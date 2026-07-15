use chrono::Utc;
use std::collections::HashMap;
/**
 * Profile management and metadata.
 * Implements listing profiles, live state loading, CRUD operations, and settings updates.
 * Main exports: impl SwitcherService profile methods
 */
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

use super::helpers::{
    check_has_refresh_token, parse_refresh_token, parse_token_expiry, read_antigravity_version,
    try_parse_email_from_credential, validate_display_name, windows_version,
};
use super::manifest::path_summary;
use crate::quota::QuotaDecryptor;
use crate::{ProtectedCredential, SwitcherService, detect_installations};
use std::collections::HashSet;
use std::sync::Mutex as StdMutex;
use std::sync::OnceLock;
use switcher_core::ProfileQuotaView;
use switcher_core::{
    AppStateView, EngineStatus, HttpStatusView, ProfileMetadata, ProfileView, RecoveryView, Result,
    SettingsView, SwitcherError, TokenStatus, atomic_write, load_json, save_json,
};

fn global_quota_cache() -> &'static StdMutex<HashMap<String, (ProfileQuotaView, std::time::Instant)>>
{
    static CACHE: OnceLock<StdMutex<HashMap<String, (ProfileQuotaView, std::time::Instant)>>> =
        OnceLock::new();
    CACHE.get_or_init(|| StdMutex::new(HashMap::new()))
}

fn quota_fetching() -> &'static StdMutex<HashSet<String>> {
    static FETCHING: OnceLock<StdMutex<HashSet<String>>> = OnceLock::new();
    FETCHING.get_or_init(|| StdMutex::new(HashSet::new()))
}

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
                let version = read_antigravity_version(path);
                *self.cached_antigravity_version.write() = version;
            }
        }
        config.installation_path.clone()
    }

    pub(crate) fn process_manager(&self) -> Result<crate::ProcessManager> {
        let path = self.ensure_installation_path_resolved().ok_or_else(|| {
            SwitcherError::InvalidConfiguration(
                "Antigravity installation path is not configured".to_owned(),
            )
        })?;
        Ok(crate::ProcessManager::new(path, self.logger.clone()))
    }

    pub fn app_state(&self, version: &str) -> Result<AppStateView> {
        let _ = self.ensure_installation_path_resolved();
        let config = self.config.read().clone();
        let has_master_password = self.paths.root.join("master_lock.json").is_file();
        let is_app_locked = has_master_password && self.master_key.read().is_none();

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
        let detected_installations = self
            .cached_detected_installations
            .read()
            .clone()
            .unwrap_or_default();
        let antigravity_version = self.cached_antigravity_version.read().clone();
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
                patch_cooldown_ms: config.patch_cooldown_ms,
                sqlite_db_path: self.paths.state_db.to_string_lossy().into_owned(),
                data_dir: self.paths.root.to_string_lossy().into_owned(),
                logs_file: self
                    .paths
                    .logs
                    .join("switcher.log")
                    .to_string_lossy()
                    .into_owned(),
                minimize_to_tray: config.minimize_to_tray,
            },
            app_version: version.to_owned(),
            antigravity_version,
            is_app_locked,
            has_master_password,
        })
    }

    pub async fn app_state_live(&self, version: &str) -> Result<AppStateView> {
        let _ = self.ensure_installation_path_resolved();
        let config = self.config.read().clone();
        let has_master_password = self.paths.root.join("master_lock.json").is_file();
        let is_app_locked = has_master_password && self.master_key.read().is_none();

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
        let detected_installations = self
            .cached_detected_installations
            .read()
            .clone()
            .unwrap_or_default();
        let antigravity_version = self.cached_antigravity_version.read().clone();
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
                patch_cooldown_ms: config.patch_cooldown_ms,
                sqlite_db_path: self.paths.state_db.to_string_lossy().into_owned(),
                data_dir: self.paths.root.to_string_lossy().into_owned(),
                logs_file: self
                    .paths
                    .logs
                    .join("switcher.log")
                    .to_string_lossy()
                    .into_owned(),
                minimize_to_tray: config.minimize_to_tray,
            },
            app_version: version.to_owned(),
            antigravity_version,
            is_app_locked,
            has_master_password,
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
                "Secure import of another account requires a separate login workflow; the current version only registers the first active session".to_owned(),
            ));
        }
        if self.process_manager()?.is_running() {
            return Err(SwitcherError::ConfirmationRequired);
        }
        validate_display_name(&display_name)?;
        self.paths.validate_same_volume()?;
        let credential = self.credentials.read_active()?;
        self.preflight_active()?;

        if let Some(ref email) = account_email {
            let existing = self.list_profiles(None)?;
            if existing.iter().any(|p| {
                p.metadata.account_email.as_ref().map(|e| e.to_lowercase())
                    == Some(email.to_lowercase())
            }) {
                return Err(SwitcherError::Message(format!(
                    "Account {} is already registered. Please delete the existing profile first.",
                    email
                )));
            }
        }

        let operation_id = Uuid::new_v4();
        self.logger.info(
            Some(operation_id),
            "profile",
            "Current session import started",
        );
        let profile_id = Uuid::new_v4();
        let profile_dir = self.paths.profile_dir(profile_id);
        fs::create_dir_all(&profile_dir)
            .map_err(|source| SwitcherError::io(&profile_dir, source))?;
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

        self.save_profile_metadata(profile_id, &metadata)?;
        self.save_profile_credentials(profile_id, &credential)?;
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
            QuotaDecryptor::decrypt_all_quotas()
                .ok()
                .and_then(|mut m| m.remove(email))
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
                "Cannot delete active profile".to_owned(),
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
                "Profile points outside storage".to_owned(),
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
        patch_cooldown_ms: Option<u32>,
        minimize_to_tray: bool,
    ) -> Result<SettingsView> {
        let mut path = installation_path.map(PathBuf::from);
        if let Some(ref p) = path {
            if p.is_file() || p.extension().is_some() {
                if let Some(parent) = p.parent() {
                    path = Some(parent.to_path_buf());
                }
            }
        }
        let path = path.filter(|p| p.join("Antigravity.exe").is_file());
        if http_port < 1024 {
            return Err(SwitcherError::InvalidConfiguration(
                "Only unprivileged ports are allowed (>= 1024)".to_owned(),
            ));
        }
        if switch_level != 1 && switch_level != 2 && switch_level != 3 && switch_level != 4 {
            return Err(SwitcherError::InvalidConfiguration(
                "Invalid account switching level".to_owned(),
            ));
        }
        if let Some(cooldown) = patch_cooldown_ms {
            if cooldown < 10 || cooldown > 5000 {
                return Err(SwitcherError::InvalidConfiguration(
                    "Patch cooldown must be between 10ms and 5000ms".to_owned(),
                ));
            }
        }
        {
            let mut config = self.config.write();
            config.http_port = http_port;
            config.installation_path = path.clone();
            config.smart_switch_enabled = smart_switch_enabled;
            config.switch_level = switch_level;
            if let Some(cooldown) = patch_cooldown_ms {
                config.patch_cooldown_ms = cooldown;
            }
            config.minimize_to_tray = minimize_to_tray;
            save_json(&self.paths.config, &*config)?;
        }
        // Update cached values:
        {
            let new_version = path.as_ref().and_then(|p| read_antigravity_version(p));
            *self.cached_antigravity_version.write() = new_version;

            let detected = detect_installations()
                .into_iter()
                .map(|p| p.to_string_lossy().into_owned())
                .collect::<Vec<_>>();
            *self.cached_detected_installations.write() = Some(detected);
        }
        let state = self.app_state(env!("CARGO_PKG_VERSION"))?;
        Ok(state.settings)
    }

    pub(crate) fn require_profile(&self, profile_id: Uuid) -> Result<ProfileMetadata> {
        self.load_profile_metadata(profile_id)
    }

    pub(crate) fn load_profile_credential(
        &self,
        profile_id: Uuid,
        password: Option<&str>,
    ) -> Result<Vec<u8>> {
        let profile_dir = self.paths.profile_dir(profile_id);
        let cred_path = profile_dir.join("credentials.enc");
        if !cred_path.is_file() {
            return Err(SwitcherError::ProfileNotFound(profile_id.to_string()));
        }

        let bytes = fs::read(&cred_path).map_err(|source| SwitcherError::io(&cred_path, source))?;

        if self.paths.root.join("master_lock.json").is_file() {
            let key = if let Some(k) = *self.master_key.read() {
                k
            } else if let Some(pwd) = password {
                let config = load_json::<switcher_core::MasterLockConfig>(
                    &self.paths.root.join("master_lock.json"),
                )?;
                let salt_bytes = hex::decode(&config.salt)
                    .map_err(|e| SwitcherError::Message(format!("Invalid salt format: {e}")))?;
                switcher_core::crypto::derive_key(pwd, &salt_bytes)
            } else {
                return Err(SwitcherError::Message(
                    "Application is locked. Enter master password.".to_owned(),
                ));
            };

            let decrypted = switcher_core::crypto::decrypt_with_key(&bytes, &key)?;
            Ok(decrypted)
        } else {
            let protected = ProtectedCredential(bytes);
            self.credentials.unprotect(&protected)
        }
    }

    pub(crate) fn load_protected_credential(
        &self,
        profile_id: Uuid,
    ) -> Result<ProtectedCredential> {
        let path = self.paths.profile_dir(profile_id).join("credentials.enc");
        let bytes = fs::read(&path).map_err(|source| SwitcherError::io(&path, source))?;
        Ok(ProtectedCredential(bytes))
    }

    pub(crate) fn touch_profile(&self, profile_id: Uuid) -> Result<()> {
        let mut metadata = self.load_profile_metadata(profile_id)?;
        metadata.last_activated_at = Utc::now();
        self.save_profile_metadata(profile_id, &metadata)
    }

    pub(crate) fn sync_active_profile_on_read(&self) -> Result<Option<Uuid>> {
        let _guard = match self.operation_lock.try_lock() {
            Some(guard) => guard,
            None => {
                return Ok(self.config.read().active_profile_id);
            }
        };
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
            let profile_id = Uuid::parse_str(&entry.file_name().to_string_lossy())
                .unwrap_or_else(|_| Uuid::nil());
            if !profile_id.is_nil() {
                if let Ok(metadata) = self.load_profile_metadata(profile_id) {
                    profiles_in_dir.push(metadata.profile_id);
                }
            }
        }

        // If profiles list is empty, auto-import the current session!
        if profiles_in_dir.is_empty() {
            let email = try_parse_email_from_credential(&active_credential);
            let display_name = email
                .clone()
                .unwrap_or_else(|| "Active Session (Imported)".to_owned());

            self.logger.info(
                None,
                "profile",
                format!(
                    "Profiles list is empty. Auto-importing active session as display_name='{}'",
                    display_name
                ),
            );

            let profile_id = Uuid::new_v4();
            let profile_dir = self.paths.profile_dir(profile_id);
            fs::create_dir_all(&profile_dir)
                .map_err(|source| SwitcherError::io(&profile_dir, source))?;

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

            self.save_profile_metadata(profile_id, &metadata)?;
            self.save_profile_credentials(profile_id, &active_credential)?;
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
                if let Ok(metadata) = self.load_profile_metadata(*profile_id) {
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
            if let Ok(profile_credential) = self.load_profile_credential(*profile_id, None) {
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

        let current_active = self.config.read().active_profile_id;
        if current_active.is_some() {
            self.logger.warn(
                None,
                "profile",
                "Active credential on disk does not match any profile. Deselecting active profile in config.".to_owned(),
            );
            let mut config = self.config.write();
            config.active_profile_id = None;
            save_json(&self.paths.config, &*config)?;
        }
        Ok(None)
    }

    pub(crate) fn list_profiles(
        &self,
        active_profile_id: Option<Uuid>,
    ) -> Result<Vec<ProfileView>> {
        let has_master_password = self.paths.root.join("master_lock.json").is_file();
        let is_app_locked = has_master_password && self.master_key.read().is_none();
        if is_app_locked {
            return Ok(Vec::new());
        }

        let synced_active_id = self
            .sync_active_profile_on_read()
            .unwrap_or(active_profile_id);
        let mut profiles = Vec::new();
        let active_credential = self.credentials.read_active().ok();
        let mut quotas = QuotaDecryptor::decrypt_all_quotas().unwrap_or_else(|e| {
            self.logger
                .warn(None, "quota", format!("Failed to decrypt quotas: {e}"));
            HashMap::new()
        });

        for entry in fs::read_dir(&self.paths.profiles)
            .map_err(|source| SwitcherError::io(&self.paths.profiles, source))?
            .filter_map(std::result::Result::ok)
        {
            let profile_id = Uuid::parse_str(&entry.file_name().to_string_lossy())
                .unwrap_or_else(|_| Uuid::nil());
            if profile_id.is_nil() {
                continue;
            }

            match self.load_profile_metadata(profile_id) {
                Ok(metadata) => {
                    let is_active = synced_active_id == Some(metadata.profile_id);
                    let credential_bytes = if is_active {
                        active_credential.clone()
                    } else {
                        self.load_profile_credential(metadata.profile_id, None).ok()
                    };

                    let has_refresh_token = credential_bytes
                        .as_ref()
                        .map_or(false, |bytes| check_has_refresh_token(bytes));

                    let display_name = metadata.display_name.clone();
                    let account_email = metadata.account_email.clone();
                    let mut token_expiry = metadata.token_expiry;

                    if is_active {
                        if let Some(ref bytes) = credential_bytes {
                            token_expiry = parse_token_expiry(bytes);
                        }
                    }

                    let token_status = if has_refresh_token {
                        TokenStatus::Valid
                    } else {
                        TokenStatus::from_expiry(token_expiry, Utc::now())
                    };

                    let quota = account_email
                        .as_ref()
                        .and_then(|email| quotas.remove(email));

                    profiles.push(ProfileView {
                        token_status,
                        is_active,
                        metadata: ProfileMetadata {
                            display_name,
                            account_email,
                            token_expiry,
                            ..metadata
                        },
                        has_refresh_token,
                        quota,
                    });
                }
                Err(error) => self.logger.warn(
                    None,
                    "profile",
                    format!(
                        "Failed to load metadata for folder {}: {}",
                        entry.file_name().to_string_lossy(),
                        error
                    ),
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

    pub async fn list_profiles_live(
        &self,
        active_profile_id: Option<Uuid>,
    ) -> Result<Vec<ProfileView>> {
        let mut profiles = self.list_profiles(active_profile_id)?;

        for profile in &mut profiles {
            if let Some(ref email) = profile.metadata.account_email {
                let credential_bytes = if profile.is_active {
                    self.credentials.read_active().ok()
                } else {
                    self.load_profile_credential(profile.metadata.profile_id, None)
                        .ok()
                };

                if let Some(ref bytes) = credential_bytes {
                    if let Some(ref refresh_token) = parse_refresh_token(bytes) {
                        let (has_valid_cache, cached_val) = {
                            let cache = global_quota_cache().lock().unwrap();
                            let now = std::time::Instant::now();
                            // Cache quota for 15 minutes (900 seconds)
                            let cache_duration = std::time::Duration::from_secs(900);
                            if let Some((cached_quota, cached_time)) = cache.get(email) {
                                let valid = now.duration_since(*cached_time) < cache_duration;
                                (valid, Some(cached_quota.clone()))
                            } else {
                                (false, None)
                            }
                        };

                        if let Some(ref quota) = cached_val {
                            profile.quota = Some(quota.clone());
                        }

                        if !has_valid_cache {
                            let should_fetch = {
                                let mut fetching = quota_fetching().lock().unwrap();
                                if fetching.contains(email) {
                                    false
                                } else {
                                    fetching.insert(email.clone());
                                    true
                                }
                            };

                            if should_fetch {
                                let email_clone = email.clone();
                                let refresh_token_clone = refresh_token.clone();
                                let logger_clone = self.logger.clone();

                                tokio::spawn(async move {
                                    match QuotaDecryptor::fetch_live_quota(&refresh_token_clone)
                                        .await
                                    {
                                        Ok(live_quota) => {
                                            let mut cache = global_quota_cache().lock().unwrap();
                                            cache.insert(
                                                email_clone.clone(),
                                                (live_quota, std::time::Instant::now()),
                                            );
                                        }
                                        Err(err) => {
                                            logger_clone.warn(
                                                None,
                                                "quota",
                                                format!(
                                                    "Failed to fetch quotas on the fly in background for {}: {}",
                                                    email_clone, err
                                                ),
                                            );
                                        }
                                    }
                                    quota_fetching().lock().unwrap().remove(&email_clone);
                                });
                            }
                        }
                    }
                }
            }
        }

        Ok(profiles)
    }

    pub fn diagnostic_report(&self, app_version: &str) -> Result<String> {
        let installations: Vec<_> = detect_installations()
            .iter()
            .map(|path| switcher_core::sanitize_path(path))
            .collect();
        let antigravity_version = self
            .cached_antigravity_version
            .read()
            .clone()
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
        report.push("Recent events:".to_owned());
        report.extend(self.logger.tail(200)?);
        Ok(report.join("\n"))
    }

    pub async fn fetch_all_quotas_on_startup(&self) -> Result<()> {
        self.logger.info(
            None,
            "quota",
            "Startup background quota prefetching started...",
        );
        let active_profile_id = self.config.read().active_profile_id;
        let active_credential = self.credentials.read_active().ok();

        let mut join_handles = Vec::new();

        if let Ok(dir_entries) = fs::read_dir(&self.paths.profiles) {
            for entry in dir_entries.filter_map(std::result::Result::ok) {
                let profile_id = Uuid::parse_str(&entry.file_name().to_string_lossy())
                    .unwrap_or_else(|_| Uuid::nil());
                if profile_id.is_nil() {
                    continue;
                }
                if let Ok(metadata) = self.load_profile_metadata(profile_id) {
                    let is_active = active_profile_id == Some(metadata.profile_id);
                    let credential_bytes = if is_active {
                        active_credential.clone()
                    } else {
                        self.load_profile_credential(metadata.profile_id, None).ok()
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
                                                    "Error prefetching quota in background for {}: {}",
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
            let mut cache = global_quota_cache().lock().unwrap();
            let now = std::time::Instant::now();
            for (email, quota) in fetched_quotas {
                cache.insert(email, (quota, now));
            }
        }

        self.logger.info(
            None,
            "quota",
            "Startup background quota prefetching completed.",
        );
        Ok(())
    }

    pub(crate) fn save_profile_metadata(
        &self,
        profile_id: Uuid,
        metadata: &ProfileMetadata,
    ) -> Result<()> {
        let profile_dir = self.paths.profile_dir(profile_id);
        let metadata_json_path = profile_dir.join("metadata.json");
        let metadata_enc_path = profile_dir.join("metadata.enc");

        if let Some(key) = *self.master_key.read() {
            let bytes = serde_json::to_vec(metadata).map_err(|source| SwitcherError::Json {
                path: metadata_enc_path.clone(),
                source,
            })?;
            let encrypted = switcher_core::crypto::encrypt_with_key(&bytes, &key)?;
            atomic_write(&metadata_enc_path, &encrypted)?;
            if metadata_json_path.is_file() {
                let _ = fs::remove_file(&metadata_json_path);
            }
        } else {
            let bytes = serde_json::to_vec(metadata).map_err(|source| SwitcherError::Json {
                path: metadata_json_path.clone(),
                source,
            })?;
            atomic_write(&metadata_json_path, &bytes)?;
            if metadata_enc_path.is_file() {
                let _ = fs::remove_file(&metadata_enc_path);
            }
        }
        Ok(())
    }

    pub(crate) fn load_profile_metadata(&self, profile_id: Uuid) -> Result<ProfileMetadata> {
        let profile_dir = self.paths.profile_dir(profile_id);
        let metadata_json_path = profile_dir.join("metadata.json");
        let metadata_enc_path = profile_dir.join("metadata.enc");

        if metadata_enc_path.is_file() {
            if let Some(key) = *self.master_key.read() {
                let encrypted_bytes = fs::read(&metadata_enc_path)
                    .map_err(|source| SwitcherError::io(&metadata_enc_path, source))?;
                let decrypted_bytes =
                    switcher_core::crypto::decrypt_with_key(&encrypted_bytes, &key)?;
                serde_json::from_slice::<ProfileMetadata>(&decrypted_bytes).map_err(|source| {
                    SwitcherError::Json {
                        path: metadata_enc_path,
                        source,
                    }
                })
            } else {
                Err(SwitcherError::Message(
                    "Application is locked. Unblock to access profile metadata.".to_owned(),
                ))
            }
        } else if metadata_json_path.is_file() {
            load_json::<ProfileMetadata>(&metadata_json_path)
        } else {
            Err(SwitcherError::ProfileNotFound(profile_id.to_string()))
        }
    }

    pub(crate) fn save_profile_credentials(
        &self,
        profile_id: Uuid,
        raw_credential: &[u8],
    ) -> Result<()> {
        let profile_dir = self.paths.profile_dir(profile_id);
        let cred_path = profile_dir.join("credentials.enc");

        if let Some(key) = *self.master_key.read() {
            let encrypted = switcher_core::crypto::encrypt_with_key(raw_credential, &key)?;
            atomic_write(&cred_path, &encrypted)?;
        } else {
            let protected = self.credentials.protect(raw_credential)?;
            atomic_write(&cred_path, &protected.0)?;
        }
        Ok(())
    }

    pub fn lock_app(&self, password: &str) -> Result<()> {
        let _guard = self.operation_lock.lock();
        let master_lock_path = self.paths.root.join("master_lock.json");
        if master_lock_path.is_file() {
            return Err(SwitcherError::Message(
                "Application is already password-protected".to_owned(),
            ));
        }

        let salt_bytes = switcher_core::crypto::generate_salt();
        let salt_hex = hex::encode(&salt_bytes);
        let key = switcher_core::crypto::derive_key(password, &salt_bytes);

        let encrypted_test = switcher_core::crypto::encrypt_with_key(b"antigravity", &key)?;
        let config = switcher_core::MasterLockConfig {
            salt: salt_hex,
            test_encryption: hex::encode(&encrypted_test),
        };
        save_json(&master_lock_path, &config)?;

        *self.master_key.write() = Some(key);

        if let Ok(entries) = fs::read_dir(&self.paths.profiles) {
            for entry in entries.filter_map(std::result::Result::ok) {
                let profile_id = Uuid::parse_str(&entry.file_name().to_string_lossy())
                    .unwrap_or_else(|_| Uuid::nil());
                if !profile_id.is_nil() {
                    let metadata_path = entry.path().join("metadata.json");
                    if metadata_path.is_file() {
                        if let Ok(metadata) = load_json::<ProfileMetadata>(&metadata_path) {
                            // Load using legacy DPAPI first before we set master key mode
                            let legacy_cred = {
                                let cred_path = entry.path().join("credentials.enc");
                                if cred_path.is_file() {
                                    let bytes = fs::read(&cred_path)
                                        .map_err(|source| SwitcherError::io(&cred_path, source))?;
                                    let protected = ProtectedCredential(bytes);
                                    self.credentials.unprotect(&protected).ok()
                                } else {
                                    None
                                }
                            };

                            let _ = self.save_profile_metadata(profile_id, &metadata);
                            if let Some(ref raw_cred) = legacy_cred {
                                let _ = self.save_profile_credentials(profile_id, raw_cred);
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    pub fn unlock_app(&self, password: &str) -> Result<()> {
        let master_lock_path = self.paths.root.join("master_lock.json");
        if !master_lock_path.is_file() {
            return Err(SwitcherError::Message(
                "No master password is set".to_owned(),
            ));
        }

        let config = load_json::<switcher_core::MasterLockConfig>(&master_lock_path)?;
        let salt_bytes = hex::decode(&config.salt)
            .map_err(|e| SwitcherError::Message(format!("Invalid salt format: {e}")))?;
        let key = switcher_core::crypto::derive_key(password, &salt_bytes);

        let enc_test_bytes = hex::decode(&config.test_encryption)
            .map_err(|e| SwitcherError::Message(format!("Invalid ciphertext format: {e}")))?;
        let dec_test_bytes = switcher_core::crypto::decrypt_with_key(&enc_test_bytes, &key)?;
        if dec_test_bytes != b"antigravity" {
            return Err(SwitcherError::Message("Incorrect password".to_owned()));
        }

        *self.master_key.write() = Some(key);
        Ok(())
    }

    pub fn remove_app_lock(&self, password: &str) -> Result<()> {
        let _guard = self.operation_lock.lock();
        let master_lock_path = self.paths.root.join("master_lock.json");
        if !master_lock_path.is_file() {
            return Err(SwitcherError::Message(
                "No master password is set".to_owned(),
            ));
        }

        self.unlock_app(password)?;

        if let Ok(entries) = fs::read_dir(&self.paths.profiles) {
            for entry in entries.filter_map(std::result::Result::ok) {
                let profile_id = Uuid::parse_str(&entry.file_name().to_string_lossy())
                    .unwrap_or_else(|_| Uuid::nil());
                if !profile_id.is_nil() {
                    let metadata_enc_path = entry.path().join("metadata.enc");
                    if metadata_enc_path.is_file() {
                        if let Ok(metadata) = self.load_profile_metadata(profile_id) {
                            if let Ok(raw_cred) = self.load_profile_credential(profile_id, None) {
                                // Temporarily clear key so saves go to plaintext/DPAPI
                                let key = self.master_key.write().take();
                                let _ = self.save_profile_metadata(profile_id, &metadata);
                                let _ = self.save_profile_credentials(profile_id, &raw_cred);
                                *self.master_key.write() = key;
                            }
                        }
                    }
                }
            }
        }

        let _ = fs::remove_file(&master_lock_path);
        *self.master_key.write() = None;
        Ok(())
    }

    pub fn fetch_and_cache_quota_sync(&self, email: &str, refresh_token: &str) {
        let email_clone = email.to_owned();
        let refresh_token_clone = refresh_token.to_owned();
        let logger_clone = self.logger.clone();

        if let Ok(handle) = tokio::runtime::Handle::try_current() {
            handle.spawn(async move {
                let result =
                    crate::quota::QuotaDecryptor::fetch_live_quota(&refresh_token_clone).await;
                match result {
                    Ok(live_quota) => {
                        let mut cache = global_quota_cache().lock().unwrap();
                        cache.insert(email_clone, (live_quota, std::time::Instant::now()));
                        logger_clone.info(
                            None,
                            "quota",
                            format!("Target quota fetched and cached successfully in background"),
                        );
                    }
                    Err(err) => {
                        logger_clone.warn(
                            None,
                            "quota",
                            format!("Failed to fetch target quota in background: {}", err),
                        );
                    }
                }
            });
        } else {
            logger_clone.warn(
                None,
                "quota",
                "No Tokio runtime handle found; skipping background quota fetch",
            );
        }
    }

    pub fn close_app_lock(&self) -> Result<()> {
        *self.master_key.write() = None;
        Ok(())
    }
}
