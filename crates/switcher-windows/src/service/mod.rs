/**
 * Switcher service core module.
 * Declares the SwitcherService struct, constructor logic, and re-exports sub-modules.
 * Main exports: SwitcherService, PendingSwitch, SwitchOutcome
 */

pub mod database;
pub mod helpers;
pub mod manifest;
pub mod oauth;
pub mod profiles;
pub mod smart_switch;
pub mod switch;
pub mod switch_fast;
pub mod asar_patch;
#[cfg(test)]
pub mod tests;

use parking_lot::{Mutex, RwLock};
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

use crate::{AuditLogger, CredentialStore, SwitcherPaths};
use switcher_core::{
    JournalStore, OperationProgress, PersistentConfig, Result,
};

#[derive(Debug, Clone)]
pub struct PendingSwitch {
    pub operation_id: Uuid,
    pub target_profile_id: Uuid,
    pub requires_confirmation: bool,
    pub password: Option<String>,
}


#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchOutcome {
    pub operation_id: Uuid,
    pub relaunched_pid: Option<u32>,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DecryptedProfile {
    pub display_name: String,
    pub account_email: Option<String>,
}

#[derive(Debug)]
pub(crate) struct DecryptedProfileInternal {
    pub display_name: String,
    pub account_email: Option<String>,
    pub key: [u8; 32],
}


#[derive(Debug)]
pub struct SwitcherService {
    pub paths: SwitcherPaths,
    pub(crate) logger: AuditLogger,
    pub(crate) credentials: CredentialStore,
    pub(crate) config: RwLock<PersistentConfig>,
    pub(crate) pending: Mutex<HashMap<Uuid, PendingSwitch>>,
    pub(crate) progress: RwLock<Option<OperationProgress>>,
    pub(crate) operation_lock: Mutex<()>,
    pub(crate) active_oauth_cancellation: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    pub(crate) last_switches: Mutex<Vec<std::time::Instant>>,
    pub(crate) decrypted_profiles: RwLock<HashMap<Uuid, DecryptedProfileInternal>>,
}


impl SwitcherService {
    pub fn initialize() -> Result<Arc<Self>> {
        Self::new(SwitcherPaths::discover()?)
    }

    pub fn new(paths: SwitcherPaths) -> Result<Arc<Self>> {
        paths.ensure()?;
        let logger = AuditLogger::new(paths.logs.join("switcher.log"), paths.log_archive.clone())?;
        let mut config = if paths.config.is_file() {
            switcher_core::load_json::<PersistentConfig>(&paths.config)?
        } else {
            PersistentConfig::default()
        };
        if config.installation_path.is_none() {
            config.installation_path = crate::detect_installations().into_iter().next();
        }
        switcher_core::save_json(&paths.config, &config)?;
        let service = Arc::new(Self {
            logger,
            credentials: CredentialStore,
            config: RwLock::new(config),
            pending: Mutex::new(HashMap::new()),
            progress: RwLock::new(None),
            operation_lock: Mutex::new(()),
            active_oauth_cancellation: Mutex::new(None),
            last_switches: Mutex::new(Vec::new()),
            decrypted_profiles: RwLock::new(HashMap::new()),
            paths,
        });

        service.logger.info(None, "app", "Application initialized");
        service.log_artifact_inventory(None, "startup-active", None);
        if let Some(lock) = service.journal().read()? {
            service.logger.warn(
                Some(lock.operation_id),
                "recovery",
                format!(
                    "Unfinished switch detected at step={}",
                    lock.current_step as u8
                ),
            );
        }
        
        // Attempt to apply the app.asar patch at startup if switch level is Level 2+ (3) and Antigravity is not running
        if service.config.read().switch_level == 3 {
            if let Err(e) = service.ensure_asar_patched(None) {
                service.logger.warn(None, "patch", format!("Failed to apply app.asar patch at startup: {}", e));
            }
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

    pub(crate) fn journal(&self) -> JournalStore {
        JournalStore::new(self.paths.lock.clone())
    }

    pub(crate) fn set_progress(&self, lock: &switcher_core::SwitchLock, warning: Option<String>) {
        let is_fast = {
            let config = self.config.read();
            config.switch_level == 2 || config.switch_level == 3
        };
        let label = if is_fast {
            match lock.current_step {
                switcher_core::SwitchStep::CloseProcesses | switcher_core::SwitchStep::VerifyUnlocked => {
                    "Restarting background services"
                }
                switcher_core::SwitchStep::RemoveLock | switcher_core::SwitchStep::Relaunch => {
                    "Completing switch"
                }
                _ => lock.current_step.user_label(),
            }
        } else {
            lock.current_step.user_label()
        };

        *self.progress.write() = Some(OperationProgress {
            operation_id: lock.operation_id,
            current_step: lock.current_step,
            label: label.to_owned(),
            target_profile_id: lock.to_profile_id,
            warning,
        });
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
}
