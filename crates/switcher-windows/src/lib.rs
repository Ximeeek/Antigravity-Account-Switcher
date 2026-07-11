mod credentials;
mod extension;
mod logging;
mod paths;
mod process;
mod service;

pub use credentials::{CredentialStore, ProtectedCredential};
pub use extension::{ExtensionInstallResult, ExtensionInstaller};
pub use logging::AuditLogger;
pub use paths::{ArtifactPath, SwitcherPaths, detect_installations};
pub use process::{AntigravityProcess, ProcessManager};
pub use service::{PendingSwitch, SwitchOutcome, SwitcherService};

