/**
 * Profile management and metadata.
 * Implements listing profiles, live state loading, CRUD operations, and settings updates.
 * Main exports: impl SwitcherService profile methods
 */

use std::fs;
use std::path::PathBuf;
use std::collections::HashMap;
use chrono::Utc;
use uuid::Uuid;

use crate::{SwitcherService, ProtectedCredential, detect_installations};
use crate::quota::QuotaDecryptor;
use switcher_core::{
    AppStateView, EngineStatus, HttpStatusView, ProfileMetadata, ProfileView, RecoveryView, Result,
    SettingsView, SwitcherError, TokenStatus, load_json, save_json, atomic_write,
};
use super::helpers::{
    check_has_refresh_token, parse_token_expiry, validate_display_name, parse_refresh_token,
    read_antigravity_version, windows_version, try_parse_email_from_credential,
};
use super::manifest::path_summary;

impl SwitcherService {
    pub(crate) fn ensure_installation_path_resolved(&self) -> Option<PathBuf> {
        let mut config = self.config.write();
        if config.installation_path.is_none() {
            config.installation_path = detect_installations().into_iter().next();
            if let Some(ref path) = config.installation_path {
                self.logger.info(
                    None,
                    "app",
                    format!("Detected and saved Antigravity path: {}", path.display()),
                );
                let _ = save_json(&self.paths.config, &*config);
            }
        }
        config.installation_path.clone()
    }

    pub(crate) fn process_manager(&self) -> Result<crate::ProcessManager> {
        let path = self
            .ensure_installation_path_resolved()
            .ok_or_else(|| SwitcherError::InvalidConfiguration("Nie określono ścieżki do Antigravity".to_owned()))?;
        Ok(crate::ProcessManager::new(path, self.logger.clone()))
    }

    pub fn app_state(&self, version: &str) -> Result<AppStateView> {
        let _ = self.ensure_installation_path_resolved();
        let config = self.config.read().clone();
        let profiles = self.list_profiles(config.active_profile_id)?;
        let active_profile = profiles.iter().find(|profile| profile.is_active).cloned();
        let operation = self.progress.read().clone();
        let recovery = if operation.is_some() {
            None
        } else {
            self.journal().read()?.as_ref().map(RecoveryView::from)
        };
        let running = self
            .process_manager()
            .map(|manager| manager.is_running())
            .unwrap_or(false);
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
                token_refresh_enabled: false,
                smart_switch_enabled: config.smart_switch_enabled,
                switch_level: config.switch_level,
            },
            app_version: version.to_owned(),
        })
    }

    pub async fn app_state_live(&self, version: &str) -> Result<AppStateView> {
        let _ = self.ensure_installation_path_resolved();
        let config = self.config.read().clone();
        let profiles = self.list_profiles_live(config.active_profile_id).await?;
        let active_profile = profiles.iter().find(|profile| profile.is_active).cloned();
        let operation = self.progress.read().clone();
        let recovery = if operation.is_some() {
            None
        } else {
            self.journal().read()?.as_ref().map(RecoveryView::from)
        };
        let running = self
            .process_manager()
            .map(|manager| manager.is_running())
            .unwrap_or(false);
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
                token_refresh_enabled: false,
                smart_switch_enabled: config.smart_switch_enabled,
                switch_level: config.switch_level,
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

    pub fn add_current_profile(
        &self,
        display_name: String,
        account_email: Option<String>,
    ) -> Result<ProfileView> {
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
        self.logger.info(
            Some(operation_id),
            "profile",
            "Current session import started",
        );
        let credential = self.credentials.read_active()?;
        let protected = self.credentials.protect(&credential)?;
        let profile_id = Uuid::new_v4();
        let profile_dir = self.paths.profile_dir(profile_id);
        fs::create_dir_all(&profile_dir)
            .map_err(|source| SwitcherError::io(&profile_dir, source))?;
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
            snapshot_initialized: true,
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
        let has_refresh_token = check_has_refresh_token(&credential);
        let token_status = if has_refresh_token {
            TokenStatus::Valid
        } else {
            TokenStatus::from_expiry(metadata.token_expiry, Utc::now())
        };
        let quota = if let Some(ref email) = metadata.account_email {
            QuotaDecryptor::decrypt_all_quotas().ok().and_then(|mut m| m.remove(email))
        } else {
            None
        };
        Ok(ProfileView {
            token_status,
            metadata,
            is_active: true,
            has_refresh_token,
            quota,
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
        let canonical_root = self
            .paths
            .profiles
            .canonicalize()
            .map_err(|source| SwitcherError::io(&self.paths.profiles, source))?;
        let canonical_profile = profile
            .canonicalize()
            .map_err(|_| SwitcherError::ProfileNotFound(profile_id.to_string()))?;
        if !canonical_profile.starts_with(&canonical_root) {
            return Err(SwitcherError::InvalidConfiguration(
                "Profil wskazuje poza magazyn".to_owned(),
            ));
        }
        fs::remove_dir_all(&canonical_profile)
            .map_err(|source| SwitcherError::io(&canonical_profile, source))?;
        self.logger.info(
            None,
            "profile",
            format!("Profile deleted successfully: {profile_id}"),
        );
        Ok(())
    }

    pub fn update_settings(
        &self,
        http_port: u16,
        installation_path: Option<String>,
        smart_switch_enabled: bool,
        switch_level: u8,
    ) -> Result<SettingsView> {
        let path = installation_path
            .map(PathBuf::from)
            .filter(|p| p.join("Antigravity.exe").is_file());
        if http_port < 1024 {
            return Err(SwitcherError::InvalidConfiguration(
                "Dozwolone są wyłącznie porty nieuprzywilejowane (>= 1024)".to_owned(),
            ));
        }
        if switch_level != 1 && switch_level != 2 {
            return Err(SwitcherError::InvalidConfiguration(
                "Nieprawidłowy poziom przełączania kont".to_owned(),
            ));
        }
        // Force switch_level to 1 since Level 2 (Fast switch) is not supported in Antigravity 2.0.
        // Antigravity 2.0 (Google agentic app) must be restarted to load new credentials.
        let target_switch_level = 1;
        {
            let mut config = self.config.write();
            config.http_port = http_port;
            config.installation_path = path;
            config.smart_switch_enabled = smart_switch_enabled;
            config.switch_level = target_switch_level;
            save_json(&self.paths.config, &*config)?;
        }
        let state = self.app_state(env!("CARGO_PKG_VERSION"))?;
        Ok(state.settings)
    }

    pub(crate) fn require_profile(&self, profile_id: Uuid) -> Result<ProfileMetadata> {
        let path = self.paths.profile_dir(profile_id).join("metadata.json");
        if !path.is_file() {
            return Err(SwitcherError::ProfileNotFound(profile_id.to_string()));
        }
        load_json(&path)
    }

    pub(crate) fn load_profile_credential(&self, profile_id: Uuid) -> Result<Vec<u8>> {
        let protected = self.load_protected_credential(profile_id)?;
        self.credentials.unprotect(&protected)
    }

    pub(crate) fn load_protected_credential(&self, profile_id: Uuid) -> Result<ProtectedCredential> {
        let path = self.paths.profile_dir(profile_id).join("credentials.enc");
        let bytes = fs::read(&path).map_err(|source| SwitcherError::io(&path, source))?;
        Ok(ProtectedCredential(bytes))
    }

    pub(crate) fn touch_profile(&self, profile_id: Uuid) -> Result<()> {
        let path = self.paths.profile_dir(profile_id).join("metadata.json");
        let mut metadata = load_json::<ProfileMetadata>(&path)?;
        metadata.last_activated_at = Utc::now();
        save_json(&path, &metadata)
    }

    pub(crate) fn sync_active_profile_on_read(&self) -> Result<Option<Uuid>> {
        let active_credential = match self.credentials.read_active() {
            Ok(bytes) => bytes,
            Err(_) => {
                return Ok(self.config.read().active_profile_id);
            }
        };

        let active_digest = crate::CredentialStore::digest(&active_credential);
        let mut profiles_in_dir = Vec::new();

        for entry in fs::read_dir(&self.paths.profiles)
            .map_err(|source| SwitcherError::io(&self.paths.profiles, source))?
            .filter_map(std::result::Result::ok)
        {
            let metadata_path = entry.path().join("metadata.json");
            if !metadata_path.is_file() {
                continue;
            }
            if let Ok(metadata) = load_json::<ProfileMetadata>(&metadata_path) {
                profiles_in_dir.push(metadata.profile_id);
            }
        }

        // If profiles list is empty, auto-import the current session!
        if profiles_in_dir.is_empty() {
            let email = try_parse_email_from_credential(&active_credential);
            let display_name = email.clone().unwrap_or_else(|| "Sesja Antigravity".to_owned());
            
            self.logger.info(
                None,
                "profile",
                format!("Profiles list is empty. Auto-importing active session as display_name='{}'", display_name),
            );

            let protected = self.credentials.protect(&active_credential)?;
            let profile_id = Uuid::new_v4();
            let profile_dir = self.paths.profile_dir(profile_id);
            fs::create_dir_all(&profile_dir)
                .map_err(|source| SwitcherError::io(&profile_dir, source))?;
            atomic_write(&profile_dir.join("credentials.enc"), &protected.0)?;
            let now = Utc::now();
            let metadata = ProfileMetadata {
                profile_id,
                display_name: display_name.clone(),
                account_email: email,
                created_at: now,
                last_activated_at: now,
                token_expiry: parse_token_expiry(&active_credential),
                snapshot_initialized: true,
            };
            save_json(&profile_dir.join("metadata.json"), &metadata)?;
            let manifest = self.capture_active_manifest(&active_credential)?;
            save_json(&profile_dir.join("manifest.json"), &manifest)?;

            {
                let mut config = self.config.write();
                config.active_profile_id = Some(profile_id);
                save_json(&self.paths.config, &*config)?;
            }
            return Ok(Some(profile_id));
        }

        let active_email = try_parse_email_from_credential(&active_credential);

        // 1. Try matching by email address
        if let Some(ref email) = active_email {
            for profile_id in &profiles_in_dir {
                let metadata_path = self.paths.profile_dir(*profile_id).join("metadata.json");
                if let Ok(metadata) = load_json::<ProfileMetadata>(&metadata_path) {
                    if metadata.account_email.as_ref() == Some(email) {
                        // Found a match by email! Ensure config is in sync.
                        let current_active = self.config.read().active_profile_id;
                        if current_active != Some(*profile_id) {
                            self.logger.info(
                                None,
                                "profile",
                                format!("Auto-detected active profile by email matching Antigravity session: {} ({})", metadata.display_name, email),
                            );
                            let mut config = self.config.write();
                            config.active_profile_id = Some(*profile_id);
                            save_json(&self.paths.config, &*config)?;
                        }
                        return Ok(Some(*profile_id));
                    }
                }
            }
        }

        // 2. Otherwise, see if any profile matches by credential digest
        for profile_id in &profiles_in_dir {
            if let Ok(profile_credential) = self.load_profile_credential(*profile_id) {
                if crate::CredentialStore::digest(&profile_credential) == active_digest {
                    // We found a match! Ensure config is in sync.
                    let current_active = self.config.read().active_profile_id;
                    if current_active != Some(*profile_id) {
                        self.logger.info(
                            None,
                            "profile",
                            format!("Auto-detected active profile matching Antigravity session by digest: {profile_id}"),
                        );
                        let mut config = self.config.write();
                        config.active_profile_id = Some(*profile_id);
                        save_json(&self.paths.config, &*config)?;
                    }
                    return Ok(Some(*profile_id));
                }
            }
        }

        Ok(self.config.read().active_profile_id)
    }

    pub(crate) fn list_profiles(&self, active_profile_id: Option<Uuid>) -> Result<Vec<ProfileView>> {
        let synced_active_id = self.sync_active_profile_on_read().unwrap_or(active_profile_id);
        let mut profiles = Vec::new();
        let active_credential = self.credentials.read_active().ok();
        let mut quotas = QuotaDecryptor::decrypt_all_quotas().unwrap_or_else(|e| {
            self.logger.warn(None, "quota", format!("Nie udało się odszyfrować limitów: {e}"));
            HashMap::new()
        });

        for entry in fs::read_dir(&self.paths.profiles)
            .map_err(|source| SwitcherError::io(&self.paths.profiles, source))?
            .filter_map(std::result::Result::ok)
        {
            let metadata_path = entry.path().join("metadata.json");
            if !metadata_path.is_file() {
                continue;
            }
            match load_json::<ProfileMetadata>(&metadata_path) {
                Ok(mut metadata) => {
                    let is_active = synced_active_id == Some(metadata.profile_id);
                    let credential_bytes = if is_active {
                        active_credential.clone()
                    } else {
                        self.load_profile_credential(metadata.profile_id).ok()
                    };

                    let has_refresh_token = credential_bytes
                        .as_ref()
                        .map_or(false, |bytes| check_has_refresh_token(bytes));

                    if is_active {
                        if let Some(ref bytes) = credential_bytes {
                            metadata.token_expiry = parse_token_expiry(bytes);
                        }
                    }

                    let token_status = if has_refresh_token {
                        TokenStatus::Valid
                    } else {
                        TokenStatus::from_expiry(metadata.token_expiry, Utc::now())
                    };

                    let quota = metadata.account_email.as_ref().and_then(|email| quotas.remove(email));

                    profiles.push(ProfileView {
                        token_status,
                        is_active,
                        metadata,
                        has_refresh_token,
                        quota,
                    });
                }
                Err(error) => self.logger.warn(
                    None,
                    "profile",
                    format!("Skipping invalid profile metadata: {error}"),
                ),
            }
        }
        profiles.sort_by(|left, right| {
            right.is_active.cmp(&left.is_active).then_with(|| {
                right
                    .metadata
                    .last_activated_at
                    .cmp(&left.metadata.last_activated_at)
            })
        });
        Ok(profiles)
    }

    pub async fn list_profiles_live(&self, active_profile_id: Option<Uuid>) -> Result<Vec<ProfileView>> {
        let mut profiles = self.list_profiles(active_profile_id)?;

        for profile in &mut profiles {
            if let Some(ref email) = profile.metadata.account_email {
                let credential_bytes = if profile.is_active {
                    self.credentials.read_active().ok()
                } else {
                    self.load_profile_credential(profile.metadata.profile_id).ok()
                };

                if let Some(ref bytes) = credential_bytes {
                    if let Some(ref refresh_token) = parse_refresh_token(bytes) {
                        let use_cached = {
                            let cache = self.quota_cache.lock();
                            let now = std::time::Instant::now();
                            let cache_duration = if profile.is_active {
                                std::time::Duration::from_secs(5)
                            } else {
                                std::time::Duration::from_secs(60)
                            };
                            if let Some((cached_quota, cached_time)) = cache.get(email) {
                                if now.duration_since(*cached_time) < cache_duration {
                                    profile.quota = Some(cached_quota.clone());
                                    true
                                } else {
                                    false
                                }
                            } else {
                                false
                            }
                        };

                        if !use_cached {
                            match QuotaDecryptor::fetch_live_quota(refresh_token).await {
                                Ok(live_quota) => {
                                    let mut cache = self.quota_cache.lock();
                                    cache.insert(email.clone(), (live_quota.clone(), std::time::Instant::now()));
                                    profile.quota = Some(live_quota);
                                }
                                Err(err) => {
                                    self.logger.warn(
                                        None,
                                        "quota",
                                        format!(
                                            "Nie udało się pobrać limitów w locie dla {}: {}",
                                            profile.metadata.display_name, err
                                        ),
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(profiles)
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
            "Artifact diagnostics:".to_owned(),
        ];
        for artifact in self.paths.artifacts() {
            report.push(format!(
                "{:?}: path={} required={} {}",
                artifact.kind,
                switcher_core::sanitize_path(&artifact.active),
                artifact.required,
                path_summary(&artifact.active),
            ));
        }
        report.push("".to_owned());
        report.push("Ostatnie zdarzenia:".to_owned());
        report.extend(self.logger.tail(200)?);
        Ok(report.join("\n"))
    }

    pub async fn fetch_all_quotas_on_startup(&self) -> Result<()> {
        self.logger.info(None, "quota", "Wstępne pobieranie limitów w tle rozpoczęte...");
        let active_profile_id = self.config.read().active_profile_id;
        let active_credential = self.credentials.read_active().ok();

        let mut join_handles = Vec::new();

        if let Ok(dir_entries) = fs::read_dir(&self.paths.profiles) {
            for entry in dir_entries.filter_map(std::result::Result::ok) {
                let metadata_path = entry.path().join("metadata.json");
                if !metadata_path.is_file() {
                    continue;
                }
                if let Ok(metadata) = load_json::<ProfileMetadata>(&metadata_path) {
                    let is_active = active_profile_id == Some(metadata.profile_id);
                    let credential_bytes = if is_active {
                        active_credential.clone()
                    } else {
                        self.load_profile_credential(metadata.profile_id).ok()
                    };

                    if let Some(bytes) = credential_bytes {
                        if let Some(refresh_token) = parse_refresh_token(&bytes) {
                            if let Some(email) = metadata.account_email {
                                let display_name = metadata.display_name.clone();
                                let logger_clone = self.logger.clone();
                                let handle = tokio::spawn(async move {
                                    match QuotaDecryptor::fetch_live_quota(&refresh_token).await {
                                        Ok(live_quota) => Some((email, live_quota)),
                                        Err(err) => {
                                            logger_clone.warn(
                                                None,
                                                "quota",
                                                format!(
                                                    "Błąd pobierania limitu w tle dla {}: {}",
                                                    display_name, err
                                                ),
                                            );
                                            None
                                        }
                                    }
                                });
                                join_handles.push(handle);
                            }
                        }
                    }
                }
            }
        }

        let mut fetched_quotas = Vec::new();
        for handle in join_handles {
            if let Ok(Some((email, quota))) = handle.await {
                fetched_quotas.push((email, quota));
            }
        }

        if !fetched_quotas.is_empty() {
            let mut cache = self.quota_cache.lock();
            let now = std::time::Instant::now();
            for (email, quota) in fetched_quotas {
                cache.insert(email, (quota, now));
            }
        }

        self.logger.info(None, "quota", "Wstępne pobieranie limitów zakończone.");
        Ok(())
    }
}
