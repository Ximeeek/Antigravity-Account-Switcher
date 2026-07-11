use crate::{
    AuditLogger, CredentialStore, ExtensionInstaller, ProcessManager, ProtectedCredential,
    SwitcherPaths, detect_installations,
};
use chrono::{DateTime, Utc};
use parking_lot::{Mutex, RwLock};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::Arc,
    time::Instant,
};
use switcher_core::{
    AppStateView, EngineStatus, HttpStatusView, JournalStore, LockStatus,
    MoveRecord, OperationProgress, PersistentConfig, ProfileManifest, ProfileMetadata, ProfileView,
    RecoveryView, Result, SettingsView, SwitchLock, SwitchRequestResult, SwitchStep, SwitcherError,
    TokenStatus, atomic_write, load_json, save_json,
};
use uuid::Uuid;
use walkdir::WalkDir;
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;

#[derive(Debug, Clone)]
pub struct PendingSwitch {
    pub operation_id: Uuid,
    pub target_profile_id: Uuid,
    pub requires_confirmation: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchOutcome {
    pub operation_id: Uuid,
    pub relaunched_pid: Option<u32>,
    pub warning: Option<String>,
}

#[derive(Debug)]
pub struct SwitcherService {
    pub paths: SwitcherPaths,
    logger: AuditLogger,
    credentials: CredentialStore,
    extension_installer: ExtensionInstaller,
    config: RwLock<PersistentConfig>,
    pending: Mutex<HashMap<Uuid, PendingSwitch>>,
    progress: RwLock<Option<OperationProgress>>,
    operation_lock: Mutex<()>,
    active_oauth_cancellation: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}


impl SwitcherService {
    pub fn initialize() -> Result<Arc<Self>> {
        Self::new(SwitcherPaths::discover()?)
    }

    pub fn new(paths: SwitcherPaths) -> Result<Arc<Self>> {
        paths.ensure()?;
        let logger = AuditLogger::new(paths.logs.join("switcher.log"), paths.log_archive.clone())?;
        let mut config = if paths.config.is_file() {
            load_json::<PersistentConfig>(&paths.config)?
        } else {
            PersistentConfig::default()
        };
        if config.installation_path.is_none() {
            config.installation_path = detect_installations().into_iter().next();
        }
        save_json(&paths.config, &config)?;
        let service = Arc::new(Self {
            extension_installer: ExtensionInstaller::new(logger.clone()),
            logger,
            credentials: CredentialStore,
            config: RwLock::new(config),
            pending: Mutex::new(HashMap::new()),
            progress: RwLock::new(None),
            operation_lock: Mutex::new(()),
            active_oauth_cancellation: Mutex::new(None),
            paths,
        });
        service.logger.info(None, "app", "Application initialized");
        if let Some(lock) = service.journal().read()? {
            service.logger.warn(
                Some(lock.operation_id),
                "recovery",
                format!("Unfinished switch detected at step={}", lock.current_step as u8),
            );
        }
        Ok(service)
    }

    pub fn logger(&self) -> &AuditLogger {
        &self.logger
    }

    pub fn api_secret(&self) -> String {
        self.config.read().api_secret.clone()
    }

    pub fn http_port(&self) -> u16 {
        self.config.read().http_port
    }

    pub fn app_state(&self, version: &str) -> Result<AppStateView> {
        let config = self.config.read().clone();
        let profiles = self.list_profiles(config.active_profile_id)?;
        let active_profile = profiles.iter().find(|profile| profile.is_active).cloned();
        let recovery = self.journal().read()?.as_ref().map(RecoveryView::from);
        let operation = self.progress.read().clone();
        let running = self.process_manager().map(|manager| manager.is_running()).unwrap_or(false);
        let engine_status = if recovery.is_some() {
            EngineStatus::Attention
        } else if operation.is_some() {
            EngineStatus::Working
        } else {
            EngineStatus::Ready
        };
        let detected_installations = detect_installations()
            .iter()
            .map(|path| path.to_string_lossy().into_owned())
            .collect();
        Ok(AppStateView {
            engine_status,
            active_profile,
            profiles,
            antigravity_running: running,
            operation,
            recovery,
            settings: SettingsView {
                http_port: config.http_port,
                installation_path: config
                    .installation_path
                    .as_ref()
                    .map(|path| path.to_string_lossy().into_owned()),
                detected_installations,
                extension_status: self.extension_installer.status(),
                token_refresh_enabled: false,
            },
            app_version: version.to_owned(),
        })
    }

    pub fn http_status(&self) -> Result<HttpStatusView> {
        let state = self.app_state(env!("CARGO_PKG_VERSION"))?;
        Ok(HttpStatusView {
            engine_status: state.engine_status,
            active_profile: state.active_profile,
            profiles: state.profiles,
            recovery_required: state.recovery.is_some(),
        })
    }

    pub fn request_switch(&self, target_profile_id: Uuid) -> Result<SwitchRequestResult> {
        if self.journal().exists() {
            return Err(SwitcherError::RecoveryRequired);
        }
        if self.progress.read().is_some() {
            return Err(SwitcherError::OperationInProgress);
        }
        let config = self.config.read().clone();
        let active = config.active_profile_id.ok_or(SwitcherError::NoActiveProfile)?;
        if active == target_profile_id {
            return Err(SwitcherError::ProfileAlreadyActive);
        }
        self.require_profile(target_profile_id)?;
        self.preflight_target(target_profile_id)?;
        let operation_id = Uuid::new_v4();
        let requires_confirmation = self.process_manager()?.is_running();
        self.pending.lock().insert(
            operation_id,
            PendingSwitch {
                operation_id,
                target_profile_id,
                requires_confirmation,
            },
        );
        self.logger.info(
            Some(operation_id),
            "profile",
            format!("Switch requested: {active} -> {target_profile_id}"),
        );
        Ok(SwitchRequestResult {
            requires_confirmation,
            operation_id,
            target_profile_id,
        })
    }

    pub fn cancel_switch(&self, operation_id: Option<Uuid>) -> Result<()> {
        let mut pending = self.pending.lock();
        if let Some(operation_id) = operation_id {
            pending.remove(&operation_id);
        } else {
            pending.clear();
        }
        Ok(())
    }

    pub fn confirm_switch(&self, operation_id: Uuid) -> Result<SwitchOutcome> {
        let pending = self
            .pending
            .lock()
            .remove(&operation_id)
            .ok_or_else(|| SwitcherError::Message("Żądanie przełączenia wygasło lub zostało anulowane".to_owned()))?;
        self.perform_switch(pending.operation_id, pending.target_profile_id)
    }

    pub fn add_current_profile(&self, display_name: String, account_email: Option<String>) -> Result<ProfileView> {
        let _guard = self.operation_lock.lock();
        if self.journal().exists() {
            return Err(SwitcherError::RecoveryRequired);
        }
        if self.config.read().active_profile_id.is_some() {
            return Err(SwitcherError::InvalidConfiguration(
                "Bezpieczny import kolejnego konta wymaga osobnego workflow logowania; bieżąca wersja rejestruje wyłącznie pierwszą aktywną sesję".to_owned(),
            ));
        }
        if self.process_manager()?.is_running() {
            return Err(SwitcherError::ConfirmationRequired);
        }
        validate_display_name(&display_name)?;
        self.paths.validate_same_volume()?;
        self.preflight_active()?;

        let operation_id = Uuid::new_v4();
        self.logger.info(Some(operation_id), "profile", "Current session import started");
        let credential = self.credentials.read_active()?;
        let protected = self.credentials.protect(&credential)?;
        let profile_id = Uuid::new_v4();
        let profile_dir = self.paths.profile_dir(profile_id);
        fs::create_dir_all(&profile_dir).map_err(|source| SwitcherError::io(&profile_dir, source))?;
        atomic_write(&profile_dir.join("credentials.enc"), &protected.0)?;
        let now = Utc::now();
        let metadata = ProfileMetadata {
            profile_id,
            display_name: display_name.trim().to_owned(),
            account_email: account_email
                .map(|email| email.trim().to_owned())
                .filter(|email| !email.is_empty()),
            created_at: now,
            last_activated_at: now,
            token_expiry: parse_token_expiry(&credential),
        };
        save_json(&profile_dir.join("metadata.json"), &metadata)?;
        let manifest = self.capture_active_manifest(&credential)?;
        save_json(&profile_dir.join("manifest.json"), &manifest)?;
        {
            let mut config = self.config.write();
            config.active_profile_id = Some(profile_id);
            save_json(&self.paths.config, &*config)?;
        }
        self.logger.info(
            Some(operation_id),
            "profile",
            format!("Current session imported as profile {profile_id}"),
        );
        Ok(ProfileView {
            token_status: TokenStatus::from_expiry(metadata.token_expiry, Utc::now()),
            metadata,
            is_active: true,
        })
    }

    pub fn delete_profile(&self, profile_id: Uuid) -> Result<()> {
        let _guard = self.operation_lock.lock();
        if self.journal().exists() {
            return Err(SwitcherError::RecoveryRequired);
        }
        if self.config.read().active_profile_id == Some(profile_id) {
            return Err(SwitcherError::InvalidConfiguration(
                "Nie można usunąć aktywnego profilu".to_owned(),
            ));
        }
        let profile = self.paths.profile_dir(profile_id);
        let canonical_root = self.paths.profiles.canonicalize().map_err(|source| SwitcherError::io(&self.paths.profiles, source))?;
        let canonical_profile = profile.canonicalize().map_err(|_| SwitcherError::ProfileNotFound(profile_id.to_string()))?;
        if !canonical_profile.starts_with(&canonical_root) {
            return Err(SwitcherError::InvalidConfiguration("Profil wskazuje poza magazyn".to_owned()));
        }
        fs::remove_dir_all(&canonical_profile).map_err(|source| SwitcherError::io(&canonical_profile, source))?;
        self.logger.info(None, "profile", format!("Profile deleted: {profile_id}"));
        Ok(())
    }

    pub fn update_settings(&self, http_port: u16, installation_path: Option<String>) -> Result<SettingsView> {
        if !(1_024..=65_535).contains(&http_port) {
            return Err(SwitcherError::InvalidConfiguration(
                "Port musi mieścić się w zakresie 1024–65535".to_owned(),
            ));
        }
        let installation_path = installation_path
            .map(PathBuf::from)
            .or_else(|| self.config.read().installation_path.clone());
        if let Some(path) = &installation_path {
            if !path.join("Antigravity.exe").is_file() {
                return Err(SwitcherError::InvalidConfiguration(format!(
                    "W wybranej lokalizacji nie ma Antigravity.exe: {}",
                    path.display()
                )));
            }
        }
        {
            let mut config = self.config.write();
            config.http_port = http_port;
            config.installation_path = installation_path;
            save_json(&self.paths.config, &*config)?;
        }
        self.logger.info(None, "settings", "Settings updated");
        Ok(self.app_state(env!("CARGO_PKG_VERSION"))?.settings)
    }

    pub fn install_extension(&self, source: &Path) -> Result<crate::ExtensionInstallResult> {
        let config = self.config.read().clone();
        self.extension_installer
            .install(source, &config.api_secret, config.http_port)
    }

    pub fn diagnostic_report(&self, app_version: &str) -> Result<String> {
        let config = self.config.read().clone();
        let installations: Vec<_> = detect_installations()
            .iter()
            .map(|path| switcher_core::sanitize_path(path))
            .collect();
        let antigravity_version = config
            .installation_path
            .as_ref()
            .and_then(|path| read_antigravity_version(path))
            .unwrap_or_else(|| "nieznana".to_owned());
        let mut report = vec![
            "Antigravity Account Switcher — raport diagnostyczny".to_owned(),
            format!("Switcher: {app_version}"),
            format!("Antigravity: {antigravity_version}"),
            format!("Windows: {}", windows_version()),
            format!("Wykryte instalacje: {}", installations.join(", ")),
            "".to_owned(),
            "Ostatnie zdarzenia:".to_owned(),
        ];
        report.extend(self.logger.tail(200)?);
        Ok(report.join("\n"))
    }

    pub fn recovery_rollback(&self) -> Result<()> {
        let _guard = self.operation_lock.lock();
        let mut lock = self.journal().read()?.ok_or_else(|| {
            SwitcherError::InvalidConfiguration("Brak operacji do odzyskania".to_owned())
        })?;
        let process = self.process_manager()?;
        if process.is_running() {
            process.close_all(lock.operation_id)?;
            process.wait_until_unlocked(&self.paths, lock.operation_id)?;
        }
        self.rollback_to_source(&mut lock)?;
        {
            let mut config = self.config.write();
            config.active_profile_id = Some(lock.from_profile_id);
            save_json(&self.paths.config, &*config)?;
        }
        self.journal().remove()?;
        self.progress.write().take();
        self.logger.info(Some(lock.operation_id), "recovery", "Previous state restored successfully");
        Ok(())
    }

    pub fn recovery_resume(&self) -> Result<SwitchOutcome> {
        let (operation_id, target_profile_id) = {
            let _guard = self.operation_lock.lock();
            let mut lock = self.journal().read()?.ok_or_else(|| {
                SwitcherError::InvalidConfiguration("Brak operacji do odzyskania".to_owned())
            })?;
            let process = self.process_manager()?;
            if process.is_running() {
                process.close_all(lock.operation_id)?;
                process.wait_until_unlocked(&self.paths, lock.operation_id)?;
            }
            self.rollback_to_source(&mut lock)?;
            {
                let mut config = self.config.write();
                config.active_profile_id = Some(lock.from_profile_id);
                save_json(&self.paths.config, &*config)?;
            }
            self.journal().remove()?;
            (Uuid::new_v4(), lock.to_profile_id)
        };
        self.logger.info(
            Some(operation_id),
            "recovery",
            "Durable journal normalized; replaying interrupted switch",
        );
        self.perform_switch(operation_id, target_profile_id)
    }

    fn perform_switch(&self, operation_id: Uuid, target_profile_id: Uuid) -> Result<SwitchOutcome> {
        let _guard = self.operation_lock.lock();
        if self.journal().exists() {
            return Err(SwitcherError::RecoveryRequired);
        }
        self.paths.validate_same_volume()?;
        self.preflight_active()?;
        self.preflight_target(target_profile_id)?;
        let from_profile_id = self.config.read().active_profile_id.ok_or(SwitcherError::NoActiveProfile)?;
        let started = Instant::now();
        let mut lock = SwitchLock::new(from_profile_id, target_profile_id);
        lock.operation_id = operation_id;
        self.set_progress(&lock, None);
        self.journal().write(&lock)?;
        self.logger.info(Some(operation_id), "profile", "Lock file written, step=1");

        let process = self.process_manager()?;
        lock.current_step = SwitchStep::CloseProcesses;
        self.journal().write(&lock)?;
        self.set_progress(&lock, None);
        if let Err(error) = process.close_all(operation_id) {
            lock.status = LockStatus::FailedAtStep2;
            self.journal().write(&lock)?;
            self.progress.write().take();
            self.logger.error(Some(operation_id), "process", error.to_string());
            return Err(error);
        }

        lock.current_step = SwitchStep::VerifyUnlocked;
        self.journal().write(&lock)?;
        self.set_progress(&lock, None);
        if let Err(error) = process.wait_until_unlocked(&self.paths, operation_id) {
            lock.status = LockStatus::FailedAtStep3;
            self.journal().write(&lock)?;
            self.progress.write().take();
            self.logger.error(Some(operation_id), "process", error.to_string());
            return Err(error);
        }

        let active_credential = self.credentials.read_active()?;
        let protected_active = self.credentials.protect(&active_credential)?;
        let target_manifest = self.load_manifest(target_profile_id)?;
        let target_credential = self.load_profile_credential(target_profile_id)?;

        lock.current_step = SwitchStep::BackupCurrent;
        self.journal().write(&lock)?;
        self.set_progress(&lock, None);
        if let Err(error) = self.backup_current_profile(&mut lock, &active_credential, &protected_active) {
            lock.status = LockStatus::FailedAtStep4RolledBack;
            self.fail_with_rollback(&mut lock, &error)?;
            return Err(error);
        }

        lock.current_step = SwitchStep::LoadTarget;
        self.journal().write(&lock)?;
        self.set_progress(&lock, None);
        if let Err(error) = self.load_target_profile(&mut lock) {
            lock.status = LockStatus::FailedAtStep5RolledBack;
            self.fail_with_rollback(&mut lock, &error)?;
            return Err(error);
        }

        lock.current_step = SwitchStep::UpdateCredential;
        self.journal().write(&lock)?;
        self.set_progress(&lock, None);
        if let Err(error) = self.credentials.write_active(&target_credential) {
            lock.status = LockStatus::FailedAtStep6RolledBack;
            self.fail_with_rollback(&mut lock, &error)?;
            return Err(error);
        }
        lock.target_credential_written = true;
        self.journal().write(&lock)?;
        self.logger.info(
            Some(operation_id),
            "credential",
            format!("Credential Manager updated for profile {target_profile_id}"),
        );

        lock.current_step = SwitchStep::VerifyConsistency;
        self.journal().write(&lock)?;
        self.set_progress(&lock, None);
        if let Err(error) = self.verify_target(&target_manifest, &target_credential) {
            lock.status = LockStatus::InconsistentStateRequiresManualRecovery;
            self.journal().write(&lock)?;
            self.progress.write().take();
            self.logger.error(Some(operation_id), "profile", error.to_string());
            return Err(error);
        }
        self.logger.info(Some(operation_id), "profile", "Consistency check passed");

        {
            let mut config = self.config.write();
            config.active_profile_id = Some(target_profile_id);
            save_json(&self.paths.config, &*config)?;
        }
        self.touch_profile(target_profile_id)?;
        lock.current_step = SwitchStep::RemoveLock;
        self.journal().write(&lock)?;
        self.set_progress(&lock, None);
        self.journal().remove()?;
        self.logger.info(
            Some(operation_id),
            "profile",
            format!(
                "Switch completed successfully, from={from_profile_id} to={target_profile_id}, duration_ms={}",
                started.elapsed().as_millis()
            ),
        );

        lock.current_step = SwitchStep::Relaunch;
        self.set_progress(&lock, None);
        let (relaunched_pid, warning) = match process.launch(Some(operation_id)) {
            Ok(pid) => (Some(pid), None),
            Err(error) => {
                let warning = "Profil przełączono poprawnie, ale nie udało się uruchomić Antigravity. Uruchom je ręcznie.".to_owned();
                self.logger.warn(Some(operation_id), "process", format!("{warning} {error}"));
                (None, Some(warning))
            }
        };
        self.progress.write().take();
        Ok(SwitchOutcome { operation_id, relaunched_pid, warning })
    }

    fn backup_current_profile(
        &self,
        lock: &mut SwitchLock,
        active_credential: &[u8],
        protected: &ProtectedCredential,
    ) -> Result<()> {
        let profile_dir = self.paths.profile_dir(lock.from_profile_id);
        fs::create_dir_all(&profile_dir).map_err(|source| SwitcherError::io(&profile_dir, source))?;
        atomic_write(&profile_dir.join("credentials.enc"), &protected.0)?;
        lock.credential_backup_written = true;
        let manifest = self.capture_active_manifest(active_credential)?;
        save_json(&profile_dir.join("manifest.json"), &manifest)?;
        self.journal().write(lock)?;
        for artifact in self.paths.artifacts() {
            if !artifact.active.exists() {
                if artifact.required {
                    return Err(SwitcherError::MissingActiveData(artifact.active));
                }
                continue;
            }
            let destination = profile_dir.join(&artifact.profile_relative);
            self.move_with_journal(lock, artifact.kind, artifact.active, destination)?;
        }
        Ok(())
    }

    fn load_target_profile(&self, lock: &mut SwitchLock) -> Result<()> {
        let profile_dir = self.paths.profile_dir(lock.to_profile_id);
        for artifact in self.paths.artifacts() {
            let source = profile_dir.join(&artifact.profile_relative);
            if !source.exists() {
                if artifact.required {
                    return Err(SwitcherError::MissingActiveData(source));
                }
                continue;
            }
            self.move_with_journal(lock, artifact.kind, source, artifact.active)?;
        }
        Ok(())
    }

    fn move_with_journal(
        &self,
        lock: &mut SwitchLock,
        kind: switcher_core::MoveKind,
        source: PathBuf,
        destination: PathBuf,
    ) -> Result<()> {
        if destination.exists() {
            return Err(SwitcherError::DestinationExists(destination));
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|source_error| SwitcherError::io(parent, source_error))?;
        }
        lock.moves.push(MoveRecord {
            kind,
            source: source.clone(),
            destination: destination.clone(),
            completed: false,
        });
        self.journal().write(lock)?;
        fs::rename(&source, &destination).map_err(|source_error| SwitcherError::io(&source, source_error))?;
        if let Some(record) = lock.moves.last_mut() {
            record.completed = true;
        }
        self.journal().write(lock)?;
        self.logger.info(
            Some(lock.operation_id),
            "profile",
            format!("Moved {} -> {}", source.display(), destination.display()),
        );
        Ok(())
    }

    fn fail_with_rollback(&self, lock: &mut SwitchLock, error: &SwitcherError) -> Result<()> {
        self.logger.error(Some(lock.operation_id), "profile", error.to_string());
        if let Err(rollback_error) = self.rollback_to_source(lock) {
            lock.status = LockStatus::InconsistentStateRequiresManualRecovery;
            self.journal().write(lock)?;
            self.progress.write().take();
            return Err(SwitcherError::Consistency(format!(
                "Rollback failed after {error}: {rollback_error}"
            )));
        }
        self.journal().write(lock)?;
        self.progress.write().take();
        Ok(())
    }

    fn rollback_to_source(&self, lock: &mut SwitchLock) -> Result<()> {
        for index in (0..lock.moves.len()).rev() {
            let source = lock.moves[index].source.clone();
            let destination = lock.moves[index].destination.clone();
            let appears_completed = lock.moves[index].completed || (!source.exists() && destination.exists());
            if appears_completed {
                if source.exists() && destination.exists() {
                    return Err(SwitcherError::Consistency(format!(
                        "Obie strony move istnieją: {} i {}",
                        source.display(),
                        destination.display()
                    )));
                }
                if !destination.exists() {
                    return Err(SwitcherError::Consistency(format!(
                        "Brak obu stron move: {} i {}",
                        source.display(),
                        destination.display()
                    )));
                }
                if let Some(parent) = source.parent() {
                    fs::create_dir_all(parent).map_err(|source_error| SwitcherError::io(parent, source_error))?;
                }
                fs::rename(&destination, &source)
                    .map_err(|source_error| SwitcherError::io(&destination, source_error))?;
                lock.moves[index].completed = false;
                self.journal().write(lock)?;
                self.logger.info(
                    Some(lock.operation_id),
                    "recovery",
                    format!("Rolled back {} -> {}", destination.display(), source.display()),
                );
            }
        }
        if lock.credential_backup_written {
            let protected = self.load_protected_credential(lock.from_profile_id)?;
            let credential = self.credentials.unprotect(&protected)?;
            self.credentials.write_active(&credential)?;
            lock.target_credential_written = false;
            self.journal().write(lock)?;
        }
        Ok(())
    }

    fn verify_target(&self, expected: &ProfileManifest, credential: &[u8]) -> Result<()> {
        let actual = self.capture_active_manifest(credential)?;
        if expected.credential_digest != actual.credential_digest {
            return Err(SwitcherError::Consistency("Credential Manager nie pasuje do profilu docelowego".to_owned()));
        }
        if expected.state_digest != actual.state_digest {
            return Err(SwitcherError::Consistency("state.vscdb nie pasuje do profilu docelowego".to_owned()));
        }
        if expected.brain_marker != actual.brain_marker {
            return Err(SwitcherError::Consistency("Katalog brain nie pasuje do profilu docelowego".to_owned()));
        }
        if expected.conversations_marker != actual.conversations_marker {
            return Err(SwitcherError::Consistency(
                "Katalog conversations nie pasuje do profilu docelowego".to_owned(),
            ));
        }
        let active = self.credentials.read_active()?;
        if CredentialStore::digest(&active) != expected.credential_digest {
            return Err(SwitcherError::Consistency("Aktywne poświadczenie nie przeszło odczytu zwrotnego".to_owned()));
        }
        Ok(())
    }

    fn capture_active_manifest(&self, credential: &[u8]) -> Result<ProfileManifest> {
        Ok(ProfileManifest {
            credential_digest: CredentialStore::digest(credential),
            state_digest: hash_file(&self.paths.state_db)?,
            brain_marker: hash_directory(&self.paths.gemini_root.join("brain"))?,
            conversations_marker: hash_directory(&self.paths.gemini_root.join("conversations"))?,
            captured_at: Some(Utc::now()),
        })
    }

    fn preflight_active(&self) -> Result<()> {
        for artifact in self.paths.artifacts().into_iter().filter(|artifact| artifact.required) {
            if !artifact.active.exists() {
                return Err(SwitcherError::MissingActiveData(artifact.active));
            }
        }
        Ok(())
    }

    fn preflight_target(&self, profile_id: Uuid) -> Result<()> {
        let profile = self.paths.profile_dir(profile_id);
        for artifact in self.paths.artifacts().into_iter().filter(|artifact| artifact.required) {
            let path = profile.join(artifact.profile_relative);
            if !path.exists() {
                return Err(SwitcherError::MissingActiveData(path));
            }
        }
        for name in ["credentials.enc", "metadata.json", "manifest.json"] {
            let path = profile.join(name);
            if !path.is_file() {
                return Err(SwitcherError::MissingActiveData(path));
            }
        }
        Ok(())
    }

    fn require_profile(&self, profile_id: Uuid) -> Result<ProfileMetadata> {
        let path = self.paths.profile_dir(profile_id).join("metadata.json");
        if !path.is_file() {
            return Err(SwitcherError::ProfileNotFound(profile_id.to_string()));
        }
        load_json(&path)
    }

    fn list_profiles(&self, active_profile_id: Option<Uuid>) -> Result<Vec<ProfileView>> {
        let mut profiles = Vec::new();
        for entry in fs::read_dir(&self.paths.profiles)
            .map_err(|source| SwitcherError::io(&self.paths.profiles, source))?
            .filter_map(std::result::Result::ok)
        {
            let metadata_path = entry.path().join("metadata.json");
            if !metadata_path.is_file() {
                continue;
            }
            match load_json::<ProfileMetadata>(&metadata_path) {
                Ok(metadata) => profiles.push(ProfileView {
                    token_status: TokenStatus::from_expiry(metadata.token_expiry, Utc::now()),
                    is_active: active_profile_id == Some(metadata.profile_id),
                    metadata,
                }),
                Err(error) => self.logger.warn(None, "profile", format!("Skipping invalid profile metadata: {error}")),
            }
        }
        profiles.sort_by(|left, right| {
            right
                .is_active
                .cmp(&left.is_active)
                .then_with(|| right.metadata.last_activated_at.cmp(&left.metadata.last_activated_at))
        });
        Ok(profiles)
    }

    fn load_protected_credential(&self, profile_id: Uuid) -> Result<ProtectedCredential> {
        let path = self.paths.profile_dir(profile_id).join("credentials.enc");
        fs::read(&path)
            .map(ProtectedCredential)
            .map_err(|source| SwitcherError::io(&path, source))
    }

    fn load_profile_credential(&self, profile_id: Uuid) -> Result<Vec<u8>> {
        let protected = self.load_protected_credential(profile_id)?;
        self.credentials.unprotect(&protected)
    }

    fn load_manifest(&self, profile_id: Uuid) -> Result<ProfileManifest> {
        load_json(&self.paths.profile_dir(profile_id).join("manifest.json"))
    }

    fn touch_profile(&self, profile_id: Uuid) -> Result<()> {
        let path = self.paths.profile_dir(profile_id).join("metadata.json");
        let mut metadata: ProfileMetadata = load_json(&path)?;
        metadata.last_activated_at = Utc::now();
        save_json(&path, &metadata)
    }

    fn process_manager(&self) -> Result<ProcessManager> {
        let installation = self
            .config
            .read()
            .installation_path
            .clone()
            .ok_or_else(|| SwitcherError::InvalidConfiguration("Nie wykryto instalacji Antigravity".to_owned()))?;
        Ok(ProcessManager::new(installation, self.logger.clone()))
    }

    fn journal(&self) -> JournalStore {
        JournalStore::new(self.paths.lock.clone())
    }

    fn set_progress(&self, lock: &SwitchLock, warning: Option<String>) {
        *self.progress.write() = Some(OperationProgress {
            operation_id: lock.operation_id,
            current_step: lock.current_step,
            label: lock.current_step.user_label().to_owned(),
            target_profile_id: lock.to_profile_id,
            warning,
        });
    }

    fn get_google_credentials(&self) -> (String, String) {
        // Try to load a local .env file manually
        if let Ok(content) = std::fs::read_to_string(".env") {
            for line in content.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }
                if let Some((key, val)) = line.split_once('=') {
                    let key = key.trim();
                    let val = val.trim().trim_matches('"').trim_matches('\'');
                    std::env::set_var(key, val);
                }
            }
        }

        let client_id = std::env::var("GOOGLE_CLIENT_ID")
            .unwrap_or_else(|_| {
                option_env!("GOOGLE_CLIENT_ID")
                    .unwrap_or("1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com")
                    .to_string()
            });

        let client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
            .unwrap_or_else(|_| {
                option_env!("GOOGLE_CLIENT_SECRET")
                    .unwrap_or("")
                    .to_string()
            });

        (client_id, client_secret)
    }

    pub async fn start_oauth_login(&self, display_name: String) -> Result<ProfileView> {
        println!("[OAuth] --- start_oauth_login started ---");
        println!("[OAuth] Display name: {}", display_name);
        validate_display_name(&display_name)?;
        if self.journal().exists() {
            println!("[OAuth] Error: Journal exists, recovery required.");
            return Err(SwitcherError::RecoveryRequired);
        }
        if self.progress.read().is_some() {
            println!("[OAuth] Error: Operation in progress.");
            return Err(SwitcherError::OperationInProgress);
        }

        self.cancel_oauth_login()?;

        let operation_id = Uuid::new_v4();
        println!("[OAuth] Operation ID generated: {}", operation_id);
        self.logger.info(Some(operation_id), "oauth", format!("Rozpoczęto logowanie bezpośrednie dla: {}", display_name));

        let code_verifier = format!("{}{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple(), Uuid::new_v4().simple());
        let mut hasher = Sha256::new();
        hasher.update(code_verifier.as_bytes());
        let hash = hasher.finalize();
        let code_challenge = base64_url_encode(&hash);
        println!("[OAuth] Generated PKCE verifier and challenge.");

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| {
                let err_msg = format!("Nie udało się uruchomić portu logowania: {}", e);
                eprintln!("[OAuth] Error: {}", err_msg);
                SwitcherError::Message(err_msg)
            })?;
        let port = listener.local_addr()
            .map_err(|e| {
                eprintln!("[OAuth] Error reading local port: {}", e);
                SwitcherError::Message(e.to_string())
            })?
            .port();
        let redirect_uri = format!("http://localhost:{}/auth/callback", port);
        println!("[OAuth] Bound local loopback listener on port: {}", port);
        println!("[OAuth] Redirect URI: {}", redirect_uri);
        self.logger.info(Some(operation_id), "oauth", format!("Uruchomiono listener OAuth na porcie {}", port));

        let (tx, rx) = tokio::sync::oneshot::channel::<()>();
        *self.active_oauth_cancellation.lock() = Some(tx);

        let (client_id, client_secret) = self.get_google_credentials();
        if client_secret.is_empty() {
            let err_msg = "Brak skonfigurowanego klucza GOOGLE_CLIENT_SECRET w pliku .env lub zmiennych środowiskowych.".to_owned();
            self.logger.error(Some(operation_id), "oauth", &err_msg);
            return Err(SwitcherError::Message(err_msg));
        }

        let state = Uuid::new_v4().simple().to_string();
        let scopes = vec![
            "https://www.googleapis.com/auth/cloud-platform",
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/cclog",
            "https://www.googleapis.com/auth/experimentsandconfigs",
            "https://www.googleapis.com/auth/aicode"
        ];

        let scopes_encoded = url_encode(&scopes.join(" "));
        let redirect_uri_encoded = url_encode(&redirect_uri);
        let auth_url = format!(
            "https://accounts.google.com/o/oauth2/v2/auth?\
             client_id={}&\
             response_type=code&\
             access_type=offline&\
             prompt=consent&\
             code_challenge_method=S256&\
             code_challenge={}&\
             redirect_uri={}&\
             state={}&\
             scope={}",
            client_id,
            code_challenge,
            redirect_uri_encoded,
            &state,
            scopes_encoded
        );
        println!("[OAuth] Built authorization URL: {}", auth_url);
        self.logger.debug(Some(operation_id), "oauth", format!("OAuth authorization URL built: {}", auth_url));
        self.logger.info(Some(operation_id), "oauth", "Otwieranie przeglądarki systemowej...");

        #[cfg(windows)]
        let spawn_res = {
            use std::os::windows::process::CommandExt;
            println!("[OAuth] Spawning browser using cmd.exe raw_arg on Windows...");
            std::process::Command::new("cmd")
                .raw_arg(format!("/c start \"\" \"{}\"", auth_url))
                .spawn()
        };
        #[cfg(not(windows))]
        let spawn_res = {
            println!("[OAuth] Spawning browser using open...");
            std::process::Command::new("open")
                .arg(&auth_url)
                .spawn()
        };

        if let Err(e) = spawn_res {
            let err_msg = format!("Nie można otworzyć przeglądarki: {}", e);
            eprintln!("[OAuth] Error spawning browser: {}", err_msg);
            self.logger.error(Some(operation_id), "oauth", format!("Nie udało się otworzyć przeglądarki: {}", e));
            *self.active_oauth_cancellation.lock() = None;
            return Err(SwitcherError::Message(err_msg));
        }

        let expected_state = state.clone();
        println!("[OAuth] Awaiting HTTP callback on loopback listener... (Timeout: 5 minutes)");
        let callback_fut = listen_for_callback(&listener, &expected_state);

        let code_res = tokio::select! {
            res = callback_fut => {
                res
            }
            _ = rx => {
                println!("[OAuth] Action cancelled by user.");
                self.logger.warn(Some(operation_id), "oauth", "Logowanie bezpośrednie zostało anulowane przez użytkownika");
                Err(SwitcherError::Message("Logowanie zostało anulowane przez użytkownika".to_owned()))
            }
            _ = tokio::time::sleep(tokio::time::Duration::from_secs(300)) => {
                eprintln!("[OAuth] Timeout: 5 minutes expired waiting for callback.");
                self.logger.error(Some(operation_id), "oauth", "Przekroczono limit czasu oczekiwania na logowanie (5 minut)");
                Err(SwitcherError::Message("Przekroczono limit czasu oczekiwania na logowanie (5 minut)".to_owned()))
            }
        };

        *self.active_oauth_cancellation.lock() = None;

        let code = code_res?;
        println!("[OAuth] Received authorization code from listener callback.");

        println!("[OAuth] Initiating token exchange POST request to accounts.google.com...");
        let client = reqwest::Client::new();
        let params = [
            ("client_id", &client_id),
            ("client_secret", &client_secret),
            ("code", &code),
            ("code_verifier", &code_verifier),
            ("redirect_uri", &redirect_uri),
            ("grant_type", "authorization_code"),
        ];

        let exchange_res = client.post("https://oauth2.googleapis.com/token")
            .form(&params)
            .send()
            .await;

        let response = match exchange_res {
            Ok(resp) => {
                println!("[OAuth] Received HTTP response from token exchange endpoint.");
                resp
            }
            Err(e) => {
                let err_msg = format!("Błąd komunikacji z serwerem Google: {}", e);
                eprintln!("[OAuth] Exchange request error: {}", err_msg);
                self.logger.error(Some(operation_id), "oauth", format!("Błąd żądania wymiany tokenu: {}", e));
                return Err(SwitcherError::Message(err_msg));
            }
        };

        let response_status = response.status();
        println!("[OAuth] Token exchange response HTTP status: {}", response_status);

        if !response_status.is_success() {
            let body = response.text().await.unwrap_or_default();
            eprintln!("[OAuth] Token exchange failed! HTTP Status: {}", response_status);
            eprintln!("[OAuth] Error body from Google: {}", body);
            self.logger.error(Some(operation_id), "oauth", format!("Google odrzucił wymianę tokenu ({})", response_status));
            return Err(SwitcherError::Message(format!("Błąd autoryzacji Google ({}): {}", response_status, body)));
        }

        let token_val: serde_json::Value = response.json().await
            .map_err(|e| {
                let err_msg = format!("Niepoprawna odpowiedź JSON z tokenami: {}", e);
                eprintln!("[OAuth] JSON parse error: {}", err_msg);
                SwitcherError::Message(err_msg)
            })?;

        println!("[OAuth] Token exchange JSON parsed successfully.");
        self.logger.info(Some(operation_id), "oauth", "Wymiana tokenów zakończona sukcesem");

        let access_token = token_val.get("access_token")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                eprintln!("[OAuth] Error: Google response is missing 'access_token'.");
                SwitcherError::Message("Brak access_token w odpowiedzi".to_owned())
            })?;
        let refresh_token = token_val.get("refresh_token")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                eprintln!("[OAuth] Error: Google response is missing 'refresh_token'. Google response JSON: {:?}", token_val);
                SwitcherError::Message("Brak refresh_token w odpowiedzi (upewnij się, że to pierwsze logowanie na tym kliencie lub wyczyść uprawnienia)".to_owned())
            })?;
        let id_token = token_val.get("id_token")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                eprintln!("[OAuth] Error: Google response is missing 'id_token'.");
                SwitcherError::Message("Brak id_token w odpowiedzi".to_owned())
            })?;
        let expires_in = token_val.get("expires_in")
            .and_then(|v| v.as_i64())
            .unwrap_or(3600);

        let email = extract_email_from_id_token(id_token)
            .ok_or_else(|| {
                eprintln!("[OAuth] Error: Failed to extract email address from 'id_token' JWT payload.");
                SwitcherError::Message("Nie udało się odczytać adresu email z id_token".to_owned())
            })?;
        println!("[OAuth] Extracted email from ID token: {}", email);

        let now = Utc::now();
        let token_expiry = now + chrono::Duration::seconds(expires_in);
        println!("[OAuth] Token expiry calculated: {}", token_expiry.to_rfc3339());

        let credential_json = serde_json::json!({
            "access_token": access_token,
            "token_type": "Bearer",
            "refresh_token": refresh_token,
            "expiry": token_expiry.to_rfc3339(),
            "auth_method": "oauth2"
        });
        let credential_bytes = serde_json::to_vec(&credential_json)
            .map_err(|e| SwitcherError::Message(e.to_string()))?;

        let new_profile_id = Uuid::new_v4();
        let profile_dir = self.paths.profile_dir(new_profile_id);
        println!("[OAuth] Creating profile directory: {}", profile_dir.display());
        fs::create_dir_all(&profile_dir).map_err(|source| SwitcherError::io(&profile_dir, source))?;

        println!("[OAuth] Saving credentials.enc...");
        let protected = self.credentials.protect(&credential_bytes)?;
        atomic_write(&profile_dir.join("credentials.enc"), &protected.0)?;

        println!("[OAuth] Creating placeholder state.vscdb, brain, conversations...");
        let state_db_path = profile_dir.join("state.vscdb");
        fs::write(&state_db_path, []).map_err(|source| SwitcherError::io(&state_db_path, source))?;

        let brain_dir = profile_dir.join("brain");
        fs::create_dir_all(&brain_dir).map_err(|source| SwitcherError::io(&brain_dir, source))?;
        let conv_dir = profile_dir.join("conversations");
        fs::create_dir_all(&conv_dir).map_err(|source| SwitcherError::io(&conv_dir, source))?;

        println!("[OAuth] Saving manifest.json...");
        let manifest = ProfileManifest {
            credential_digest: CredentialStore::digest(&credential_bytes),
            state_digest: hash_file(&state_db_path)?,
            brain_marker: hash_directory(&brain_dir)?,
            conversations_marker: hash_directory(&conv_dir)?,
            captured_at: Some(now),
        };
        save_json(&profile_dir.join("manifest.json"), &manifest)?;

        println!("[OAuth] Saving metadata.json...");
        let metadata = ProfileMetadata {
            profile_id: new_profile_id,
            display_name: display_name.trim().to_owned(),
            account_email: Some(email),
            created_at: now,
            last_activated_at: now,
            token_expiry: Some(token_expiry),
        };
        save_json(&profile_dir.join("metadata.json"), &metadata)?;

        println!("[OAuth] --- Profile successfully created with ID: {} ---", new_profile_id);
        self.logger.info(Some(operation_id), "oauth", format!("Utworzono nowy profil z bezpośrednim logowaniem: {}", new_profile_id));

        Ok(ProfileView {
            token_status: TokenStatus::from_expiry(metadata.token_expiry, now),
            is_active: false,
            metadata,
        })
    }

    pub fn cancel_oauth_login(&self) -> Result<()> {
        let mut cancellation = self.active_oauth_cancellation.lock();
        if let Some(tx) = cancellation.take() {
            let _ = tx.send(());
        }
        Ok(())
    }
}

fn validate_display_name(name: &str) -> Result<()> {
    let length = name.trim().chars().count();
    if !(1..=80).contains(&length) {
        Err(SwitcherError::InvalidConfiguration(
            "Nazwa profilu musi mieć od 1 do 80 znaków".to_owned(),
        ))
    } else {
        Ok(())
    }
}

fn hash_file(path: &Path) -> Result<String> {
    let bytes = fs::read(path).map_err(|source| SwitcherError::io(path, source))?;
    Ok(hex_digest(&bytes))
}

fn hash_directory(path: &Path) -> Result<String> {
    if !path.is_dir() {
        return Err(SwitcherError::MissingActiveData(path.to_path_buf()));
    }
    let mut records = Vec::new();
    for entry in WalkDir::new(path).follow_links(false).into_iter() {
        let entry = entry.map_err(|error| SwitcherError::Message(error.to_string()))?;
        if entry.file_type().is_symlink() {
            return Err(SwitcherError::InvalidConfiguration(format!(
                "Dowiązania/reparse points nie są obsługiwane w profilu: {}",
                entry.path().display()
            )));
        }
        let relative = entry.path().strip_prefix(path).unwrap_or(entry.path());
        let kind = if entry.file_type().is_dir() { "d" } else { "f" };
        let length = entry.metadata().map(|metadata| metadata.len()).unwrap_or(0);
        records.push(format!("{kind}:{}:{length}", relative.to_string_lossy().replace('\\', "/")));
    }
    records.sort();
    Ok(hex_digest(records.join("\n").as_bytes()))
}

fn hex_digest(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn parse_token_expiry(bytes: &[u8]) -> Option<DateTime<Utc>> {
    let value: Value = serde_json::from_slice(bytes).ok()?;
    let expiry = value.get("expiry").or_else(|| value.get("expires_at"))?;
    if let Some(text) = expiry.as_str() {
        if let Ok(value) = DateTime::parse_from_rfc3339(text) {
            return Some(value.with_timezone(&Utc));
        }
        if let Ok(number) = text.parse::<i64>() {
            return timestamp_to_datetime(number);
        }
    }
    expiry.as_i64().and_then(timestamp_to_datetime)
}

fn timestamp_to_datetime(value: i64) -> Option<DateTime<Utc>> {
    let seconds = if value > 10_000_000_000 { value / 1_000 } else { value };
    DateTime::<Utc>::from_timestamp(seconds, 0)
}

fn read_antigravity_version(installation: &Path) -> Option<String> {
    let package = installation.join("resources").join("app.asar");
    package
        .metadata()
        .ok()
        .map(|_| "wykryta (szczegółowa wersja dostępna po uruchomieniu)".to_owned())
}

fn windows_version() -> String {
    std::env::var("OS").unwrap_or_else(|_| "Windows (wersja nieznana)".to_owned())
}

fn base64_url_encode(input: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(input)
}

fn base64_url_decode(input: &str) -> std::result::Result<Vec<u8>, base64::DecodeError> {
    URL_SAFE_NO_PAD.decode(input)
}

fn extract_email_from_id_token(id_token: &str) -> Option<String> {
    let parts: Vec<&str> = id_token.split('.').collect();
    if parts.len() < 2 {
        return None;
    }
    let payload_b64 = parts[1];
    let decoded = base64_url_decode(payload_b64).ok()?;
    let value: serde_json::Value = serde_json::from_slice(&decoded).ok()?;
    value.get("email").and_then(|v| v.as_str()).map(|s| s.to_owned())
}

fn url_encode(input: &str) -> String {
    let mut encoded = String::new();
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                encoded.push(byte as char);
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    encoded
}

fn url_decode(input: &str) -> String {
    let mut decoded = String::new();
    let mut chars = input.chars();
    while let Some(c) = chars.next() {
        if c == '%' {
            let h1 = chars.next();
            let h2 = chars.next();
            if let (Some(c1), Some(c2)) = (h1, h2) {
                if let Ok(byte) = u8::from_str_radix(&format!("{}{}", c1, c2), 16) {
                    decoded.push(byte as char);
                    continue;
                }
            }
            decoded.push('%');
            if let Some(c1) = h1 { decoded.push(c1); }
            if let Some(c2) = h2 { decoded.push(c2); }
        } else if c == '+' {
            decoded.push(' ');
        } else {
            decoded.push(c);
        }
    }
    decoded
}

async fn listen_for_callback(
    listener: &tokio::net::TcpListener,
    expected_state: &str,
) -> Result<String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    println!("[OAuth Listener] Starting TCP accept loop.");
    loop {
        let (mut stream, addr) = match listener.accept().await {
            Ok(val) => val,
            Err(e) => {
                eprintln!("[OAuth Listener] Accept error: {}", e);
                return Err(SwitcherError::Message(format!("Błąd accept: {}", e)));
            }
        };
        println!("[OAuth Listener] Accepted connection from: {}", addr);
        let mut buffer = [0; 4096];
        let n = match stream.read(&mut buffer).await {
            Ok(n) => n,
            Err(e) => {
                eprintln!("[OAuth Listener] Read stream error: {}", e);
                return Err(SwitcherError::Message(format!("Błąd odczytu streamu: {}", e)));
            }
        };
        if n == 0 {
            println!("[OAuth Listener] Warning: Read 0 bytes from stream.");
            continue;
        }
        let request = String::from_utf8_lossy(&buffer[..n]);
        let first_line = match request.lines().next() {
            Some(line) => line,
            None => {
                println!("[OAuth Listener] Warning: Request has no lines.");
                continue;
            }
        };
        println!("[OAuth Listener] Request Line: {}", first_line);
        let parts: Vec<&str> = first_line.split_whitespace().collect();
        if parts.len() < 2 || parts[0] != "GET" {
            println!("[OAuth Listener] Warning: Ignoring non-GET request.");
            continue;
        }
        let url_path = parts[1];
        if !url_path.starts_with("/auth/callback") {
            println!("[OAuth Listener] Ignoring path: {}", url_path);
            continue;
        }
        let query = url_path.split('?').nth(1).unwrap_or("");
        println!("[OAuth Listener] Parsed Callback Query String: {}", query);
        let mut code = None;
        let mut state = None;
        let mut error = None;
        for param in query.split('&') {
            let mut kv = param.split('=');
            let k = kv.next().unwrap_or("");
            let v = kv.next().unwrap_or("");
            if k == "code" {
                code = Some(v.to_owned());
            } else if k == "state" {
                state = Some(v.to_owned());
            } else if k == "error" {
                error = Some(v.to_owned());
            }
        }
        if let Some(err) = error {
            let decoded_err = url_decode(&err);
            eprintln!("[OAuth Listener] Google returned error in callback: {}", decoded_err);
            let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n\
                            <html><body style=\"font-family:sans-serif; text-align:center; padding-top:50px; background-color:#0b0d19; color:#fff;\">\
                            <h1 style=\"color:#ef4444;\">Błąd autoryzacji</h1>\
                            <p>Google zwrócił błąd: </p><pre></pre>\
                            </body></html>";
            let _ = stream.write_all(response.as_bytes()).await;
            return Err(SwitcherError::Message(format!("Google OAuth error: {}", decoded_err)));
        }
        let state_val = url_decode(&state.unwrap_or_default());
        println!("[OAuth Listener] CSRF State check: Expected: '{}', Received: '{}'", expected_state, state_val);
        if state_val != expected_state {
            eprintln!("[OAuth Listener] Error: CSRF state mismatch!");
            let response = "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n\
                            <html><body style=\"font-family:sans-serif; text-align:center; padding-top:50px; background-color:#0b0d19; color:#fff;\">\
                            <h1 style=\"color:#ef4444;\">Błąd CSRF</h1>\
                            <p>Niepoprawny stan CSRF.</p>\
                            </body></html>";
            let _ = stream.write_all(response.as_bytes()).await;
            return Err(SwitcherError::Message("State mismatch (CSRF protection)".to_owned()));
        }
        let code_val = match code {
            Some(c) => {
                let decoded_code = url_decode(&c);
                println!("[OAuth Listener] Successfully URL-decoded authorization code.");
                decoded_code
            }
            None => {
                eprintln!("[OAuth Listener] Error: Missing 'code' parameter in callback query.");
                let response = "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n\
                                <html><body style=\"font-family:sans-serif; text-align:center; padding-top:50px; background-color:#0b0d19; color:#fff;\">\
                                <h1>Brak kodu</h1>\
                                <p>Brak kodu autoryzacyjnego.</p>\
                                </body></html>";
                let _ = stream.write_all(response.as_bytes()).await;
                continue;
            }
        };
        let success_html = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n\
                            <html><body style=\"font-family:sans-serif; text-align:center; padding-top:50px; background-color:#0b0d19; color:#fff;\">\
                            <h1 style=\"color:#4f46e5;\">Autoryzacja udana!</h1>\
                            <p>Możesz zamknąć to okno i wrócić do aplikacji Switchera.</p>\
                            </body></html>";
        let _ = stream.write_all(success_html.as_bytes()).await;
        let _ = stream.flush().await;
        println!("[OAuth Listener] Success HTML response sent to browser. Closing listener.");
        return Ok(code_val);
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_iso_and_millisecond_expiry() {
        assert!(parse_token_expiry(br#"{"expiry":"2030-01-01T00:00:00Z"}"#).is_some());
        assert!(parse_token_expiry(br#"{"expiry":1893456000000}"#).is_some());
    }

    #[test]
    fn directory_marker_is_stable() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::write(temp.path().join("a.txt"), "value").unwrap();
        let first = hash_directory(temp.path()).unwrap();
        let second = hash_directory(temp.path()).unwrap();
        assert_eq!(first, second);
    }

    #[test]
    fn base64_url_encode_decode_roundtrip() {
        let original = b"hello world?$-_";
        let encoded = base64_url_encode(original);
        assert!(!encoded.contains('='));
        assert!(!encoded.contains('+'));
        assert!(!encoded.contains('/'));
        let decoded = base64_url_decode(&encoded).unwrap();
        assert_eq!(original.to_vec(), decoded);
    }

    #[test]
    fn test_url_decode() {
        assert_eq!(url_decode("hello%20world"), "hello world");
        assert_eq!(url_decode("4%2F0AdkVLPw"), "4/0AdkVLPw");
        assert_eq!(url_decode("some+space"), "some space");
    }
}

