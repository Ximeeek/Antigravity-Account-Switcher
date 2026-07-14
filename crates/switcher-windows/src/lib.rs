mod credentials;
mod logging;
mod paths;
mod process;
mod quota;
mod service;
pub mod uninstall;
mod webview;

pub use credentials::{CredentialStore, ProtectedCredential};
pub use logging::AuditLogger;
pub use paths::{ArtifactPath, SwitcherPaths, detect_installations};
pub use process::{AntigravityProcess, ProcessManager};
pub use quota::QuotaDecryptor;
pub use service::{PendingSwitch, SwitchOutcome, SwitcherService};
pub use uninstall::{wipe_app_data_and_relaunch, uninstall_app_and_self_delete};
pub use webview::{check_and_install_webview2, check_single_instance};

