use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum SwitcherError {
    #[error("Switching operation is already in progress")]
    OperationInProgress,
    #[error("Target profile is already active")]
    ProfileAlreadyActive,
    #[error("Profile {0} not found")]
    ProfileNotFound(String),
    #[error("No active profile; import the current session first")]
    NoActiveProfile,
    #[error("Recovery of previous operation is required")]
    RecoveryRequired,
    #[error("Antigravity is still running and requires confirmation to close")]
    ConfirmationRequired,
    #[error("Paths are not on the same volume: {left:?} and {right:?}")]
    CrossVolume { left: PathBuf, right: PathBuf },
    #[error("Missing required active session data: {0:?}")]
    MissingActiveData(PathBuf),
    #[error("Operation destination already exists: {0:?}")]
    DestinationExists(PathBuf),
    #[error("Failed to close Antigravity processes: {0}")]
    ProcessShutdown(String),
    #[error("Antigravity files are still locked: {0:?}")]
    FilesLocked(PathBuf),
    #[error("Cannot read Antigravity credentials")]
    CredentialUnavailable,
    #[error("Consistency check failed: {0}")]
    Consistency(String),
    #[error("Unsupported operating system; the application runs only on Windows")]
    UnsupportedPlatform,
    #[error("Invalid configuration: {0}")]
    InvalidConfiguration(String),
    #[error("I/O error for {path:?}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("Invalid JSON data in {path:?}: {source}")]
    Json {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
    #[error("Windows system error: {0}")]
    Windows(String),
    #[error("{0}")]
    Message(String),
}

pub type Result<T> = std::result::Result<T, SwitcherError>;

impl SwitcherError {
    pub fn io(path: impl Into<PathBuf>, source: std::io::Error) -> Self {
        Self::Io {
            path: path.into(),
            source,
        }
    }
}
