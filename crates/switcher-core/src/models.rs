use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileMetadata {
    pub profile_id: Uuid,
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_email: Option<String>,
    pub created_at: DateTime<Utc>,
    pub last_activated_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_expiry: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileManifest {
    pub credential_digest: String,
    pub state_digest: String,
    pub brain_marker: String,
    pub conversations_marker: String,
    pub captured_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TokenStatus {
    Valid,
    ExpiringSoon,
    Expired,
    Unknown,
}

impl TokenStatus {
    pub fn from_expiry(expiry: Option<DateTime<Utc>>, now: DateTime<Utc>) -> Self {
        match expiry {
            Some(value) if value <= now => Self::Expired,
            Some(value) if value - now <= chrono::Duration::minutes(15) => Self::ExpiringSoon,
            Some(_) => Self::Valid,
            None => Self::Unknown,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileView {
    #[serde(flatten)]
    pub metadata: ProfileMetadata,
    pub token_status: TokenStatus,
    pub is_active: bool,
    pub has_refresh_token: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EngineStatus {
    Ready,
    Working,
    Attention,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExtensionStatus {
    Installed,
    Missing,
    UpdateAvailable,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    pub http_port: u16,
    pub installation_path: Option<String>,
    pub detected_installations: Vec<String>,
    pub extension_status: ExtensionStatus,
    pub token_refresh_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PersistentConfig {
    pub schema_version: u32,
    pub http_port: u16,
    pub api_secret: String,
    pub installation_path: Option<PathBuf>,
    pub active_profile_id: Option<Uuid>,
}

impl Default for PersistentConfig {
    fn default() -> Self {
        Self {
            schema_version: 1,
            http_port: 48731,
            api_secret: Uuid::new_v4().simple().to_string() + &Uuid::new_v4().simple().to_string(),
            installation_path: None,
            active_profile_id: None,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum SwitchStep {
    WriteLock = 1,
    CloseProcesses = 2,
    VerifyUnlocked = 3,
    BackupCurrent = 4,
    LoadTarget = 5,
    UpdateCredential = 6,
    VerifyConsistency = 7,
    RemoveLock = 8,
    Relaunch = 9,
}

impl SwitchStep {
    pub fn user_label(self) -> &'static str {
        match self {
            Self::WriteLock => "Przygotowywanie operacji",
            Self::CloseProcesses | Self::VerifyUnlocked => "Zamykanie Antigravity",
            Self::BackupCurrent => "Zapisywanie obecnego profilu",
            Self::LoadTarget | Self::UpdateCredential | Self::VerifyConsistency => {
                "Ładowanie i sprawdzanie nowego profilu"
            }
            Self::RemoveLock | Self::Relaunch => "Kończenie i uruchamianie Antigravity",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MoveKind {
    StateDatabase,
    StateDatabaseWal,
    StateDatabaseShm,
    Brain,
    Conversations,
    AntigravityState,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MoveRecord {
    pub kind: MoveKind,
    pub source: PathBuf,
    pub destination: PathBuf,
    pub completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LockStatus {
    Running,
    FailedAtStep2,
    FailedAtStep3,
    FailedAtStep4RolledBack,
    FailedAtStep5RolledBack,
    FailedAtStep6RolledBack,
    InconsistentStateRequiresManualRecovery,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SwitchLock {
    pub operation_id: Uuid,
    pub from_profile_id: Uuid,
    pub to_profile_id: Uuid,
    pub started_at: DateTime<Utc>,
    pub current_step: SwitchStep,
    pub status: LockStatus,
    pub moves: Vec<MoveRecord>,
    pub credential_backup_written: bool,
    pub target_credential_written: bool,
}

impl SwitchLock {
    pub fn new(from_profile_id: Uuid, to_profile_id: Uuid) -> Self {
        Self {
            operation_id: Uuid::new_v4(),
            from_profile_id,
            to_profile_id,
            started_at: Utc::now(),
            current_step: SwitchStep::WriteLock,
            status: LockStatus::Running,
            moves: Vec::new(),
            credential_backup_written: false,
            target_credential_written: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OperationProgress {
    pub operation_id: Uuid,
    pub current_step: SwitchStep,
    pub label: String,
    pub target_profile_id: Uuid,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryView {
    pub operation_id: Uuid,
    pub current_step: SwitchStep,
    pub step_label: String,
    pub status: LockStatus,
    pub from_profile_id: Uuid,
    pub to_profile_id: Uuid,
}

impl From<&SwitchLock> for RecoveryView {
    fn from(value: &SwitchLock) -> Self {
        Self {
            operation_id: value.operation_id,
            current_step: value.current_step,
            step_label: value.current_step.user_label().to_owned(),
            status: value.status.clone(),
            from_profile_id: value.from_profile_id,
            to_profile_id: value.to_profile_id,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppStateView {
    pub engine_status: EngineStatus,
    pub active_profile: Option<ProfileView>,
    pub profiles: Vec<ProfileView>,
    pub antigravity_running: bool,
    pub operation: Option<OperationProgress>,
    pub recovery: Option<RecoveryView>,
    pub settings: SettingsView,
    pub app_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SwitchRequestResult {
    pub requires_confirmation: bool,
    pub operation_id: Uuid,
    pub target_profile_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HttpStatusView {
    pub engine_status: EngineStatus,
    pub active_profile: Option<ProfileView>,
    pub profiles: Vec<ProfileView>,
    pub recovery_required: bool,
}

