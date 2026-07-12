mod credentials;
mod logging;
mod paths;
mod process;
mod quota;
mod service;

pub use credentials::{CredentialStore, ProtectedCredential};
pub use logging::AuditLogger;
pub use paths::{ArtifactPath, SwitcherPaths, detect_installations};
pub use process::{AntigravityProcess, ProcessManager};
pub use quota::QuotaDecryptor;
pub use service::{PendingSwitch, SwitchOutcome, SwitcherService};

