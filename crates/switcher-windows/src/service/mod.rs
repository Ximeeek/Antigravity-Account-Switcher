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
#[cfg(test)]
pub mod tests;

use parking_lot::{Mutex, RwLock};
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

use crate::{AuditLogger, CredentialStore, SwitcherPaths};
use switcher_core::{
    JournalStore, OperationProgress, PersistentConfig, ProfileQuotaView, Result,
};

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
    pub(crate) logger: AuditLogger,
    pub(crate) credentials: CredentialStore,
    pub(crate) config: RwLock<PersistentConfig>,
    pub(crate) pending: Mutex<HashMap<Uuid, PendingSwitch>>,
    pub(crate) progress: RwLock<Option<OperationProgress>>,
    pub(crate) operation_lock: Mutex<()>,
    pub(crate) active_oauth_cancellation: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    pub(crate) quota_cache: Mutex<HashMap<String, (ProfileQuotaView, std::time::Instant)>>,
    pub(crate) last_switches: Mutex<Vec<std::time::Instant>>,
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
            quota_cache: Mutex::new(HashMap::new()),
            last_switches: Mutex::new(Vec::new()),
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
        *self.progress.write() = Some(OperationProgress {
            operation_id: lock.operation_id,
            current_step: lock.current_step,
            label: lock.current_step.user_label().to_owned(),
            target_profile_id: lock.to_profile_id,
            warning,
        });
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
}
