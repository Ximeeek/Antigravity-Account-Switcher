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
    #[serde(default = "existing_profile_has_snapshot")]
    pub snapshot_initialized: bool,
}

fn existing_profile_has_snapshot() -> bool {
    true
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct QuotaBucketView {
    pub bucket_id: String,
    pub window: String,
    pub remaining_fraction: f64,
    pub reset_time: Option<String>,
    pub display_name: String,
    pub description: Option<String>,
}

// Since f64 is not Eq, let's implement Eq manually or just derive PartialEq.
// Serde needs PartialEq/Eq for models. Let's make sure it compiles.
// Note: Rust doesn't allow Eq on structs with f64. So we derive PartialEq for all Quota models,
// but since ProfileView has PartialEq + Eq, we might need Eq for ProfileView.
// Let's implement Eq manually for QuotaBucketView and others by comparing bits/floats, or by deriving Eq and using a wrapper for f64, OR we can implement Eq for ProfileView manually so it doesn't need Eq on Quota!
// Actually, let's look at why ProfileView derives Eq: it is because it is part of AppStateView which has Eq.
// Let's implement Eq manually for QuotaBucketView, QuotaGroupView, ProfileQuotaView by matching float as u64 or just partial_cmp.
// Better: implement Eq for QuotaBucketView, QuotaGroupView, ProfileQuotaView by mapping f64 to a wrapper or comparing as total_cmp or custom Eq.
// Let's do custom Eq/PartialEq for QuotaBucketView:

impl Eq for QuotaBucketView {}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct QuotaGroupView {
    pub display_name: String,
    pub description: String,
    pub buckets: Vec<QuotaBucketView>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct ProfileQuotaView {
    pub subscription_tier: String,
    pub quota_groups: Vec<QuotaGroupView>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileView {
    #[serde(flatten)]
    pub metadata: ProfileMetadata,
    pub token_status: TokenStatus,
    pub is_active: bool,
    pub has_refresh_token: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quota: Option<ProfileQuotaView>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EngineStatus {
    Ready,
    Working,
    Attention,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    pub http_port: u16,
    pub installation_path: Option<String>,
    pub detected_installations: Vec<String>,
    pub token_refresh_enabled: bool,
    pub smart_switch_enabled: bool,
    pub switch_level: u8,
    pub patch_cooldown_ms: u32,
    pub sqlite_db_path: String,
    pub data_dir: String,
    pub logs_file: String,
}

fn default_switch_level() -> u8 {
    1
}

fn default_patch_cooldown() -> u32 {
    100
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PersistentConfig {
    pub schema_version: u32,
    pub http_port: u16,
    pub api_secret: String,
    pub installation_path: Option<PathBuf>,
    pub active_profile_id: Option<Uuid>,
    #[serde(default)]
    pub smart_switch_enabled: bool,
    #[serde(default = "default_switch_level")]
    pub switch_level: u8,
    #[serde(default = "default_patch_cooldown")]
    pub patch_cooldown_ms: u32,
    #[serde(default)]
    pub patched_asar_mtime: Option<u64>,
    #[serde(default)]
    pub patched_asar_cooldown: Option<u32>,
}

impl Default for PersistentConfig {
    fn default() -> Self {
        Self {
            schema_version: 1,
            http_port: if cfg!(debug_assertions) { 48732 } else { 48731 },
            api_secret: Uuid::new_v4().simple().to_string() + &Uuid::new_v4().simple().to_string(),
            installation_path: None,
            active_profile_id: None,
            smart_switch_enabled: false,
            switch_level: 1,
            patch_cooldown_ms: 100,
            patched_asar_mtime: None,
            patched_asar_cooldown: None,
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
            Self::WriteLock => "Preparing operation",
            Self::CloseProcesses | Self::VerifyUnlocked => "Closing Antigravity",
            Self::BackupCurrent => "Saving current profile",
            Self::LoadTarget | Self::UpdateCredential | Self::VerifyConsistency => {
                "Loading and verifying new profile"
            }
            Self::RemoveLock | Self::Relaunch => "Finishing and starting Antigravity",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MoveKind {
    StateDatabase,
    StateDatabaseWal,
    StateDatabaseShm,
    GlobalStorageJson,
    Brain,
    Conversations,
    AntigravityState,
    Annotations,
    ConversationSummaries,
    HtmlArtifacts,
    WorkspaceStorage,
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
    pub antigravity_version: Option<String>,
    pub is_app_locked: bool,
    pub has_master_password: bool,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_profile_metadata_defaults_to_initialized_snapshot() {
        let profile_id = Uuid::new_v4();
        let value = serde_json::json!({
            "profileId": profile_id,
            "displayName": "legacy",
            "createdAt": "2026-01-01T00:00:00Z",
            "lastActivatedAt": "2026-01-01T00:00:00Z"
        });
        let metadata: ProfileMetadata = serde_json::from_value(value).unwrap();
        assert!(metadata.snapshot_initialized);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MasterLockConfig {
    pub salt: String,            // hex encoded salt
    pub test_encryption: String, // hex encoded ciphertext of "antigravity"
}
