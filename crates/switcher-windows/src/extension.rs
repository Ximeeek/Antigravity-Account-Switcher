use crate::AuditLogger;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
use switcher_core::{ExtensionStatus, Result, SwitcherError};
use uuid::Uuid;
use walkdir::WalkDir;

const EXTENSION_FOLDER: &str = "antigravity-account-switcher-0.1.0";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionInstallResult {
    pub destination: String,
    pub files_written: usize,
}

#[derive(Debug, Clone)]
pub struct ExtensionInstaller {
    logger: AuditLogger,
}

impl ExtensionInstaller {
    pub fn new(logger: AuditLogger) -> Self {
        Self { logger }
    }

    pub fn extension_roots(&self) -> Vec<PathBuf> {
        let Some(home) = std::env::var_os("USERPROFILE").map(PathBuf::from) else {
            return Vec::new();
        };
        vec![
            home.join(".antigravity").join("extensions"),
            home.join(".antigravity-ide").join("extensions"),
        ]
    }

    pub fn status(&self) -> ExtensionStatus {
        if self
            .extension_roots()
            .iter()
            .any(|root| root.join(EXTENSION_FOLDER).join("package.json").is_file())
        {
            ExtensionStatus::Installed
        } else {
            ExtensionStatus::Missing
        }
    }

    pub fn install(
        &self,
        source: &Path,
        api_secret: &str,
        port: u16,
    ) -> Result<ExtensionInstallResult> {
        let operation_id = Uuid::new_v4();
        self.logger.info(
            Some(operation_id),
            "extension",
            format!("Extension installation started from {}", source.display()),
        );
        if !source.join("package.json").is_file() {
            let error = SwitcherError::InvalidConfiguration(format!(
                "Brak zbudowanej wtyczki w {}",
                source.display()
            ));
            self.logger
                .error(Some(operation_id), "extension", error.to_string());
            return Err(error);
        }
        let roots = self.extension_roots();
        let destination_root = roots
            .iter()
            .find(|root| root.exists())
            .cloned()
            .or_else(|| roots.first().cloned())
            .ok_or_else(|| {
                SwitcherError::InvalidConfiguration(
                    "Nie znaleziono katalogu użytkownika".to_owned(),
                )
            })?;
        fs::create_dir_all(&destination_root)
            .map_err(|source_error| SwitcherError::io(&destination_root, source_error))?;
        let destination = destination_root.join(EXTENSION_FOLDER);
        fs::create_dir_all(&destination)
            .map_err(|source_error| SwitcherError::io(&destination, source_error))?;

        let mut written = 0_usize;
        for entry in WalkDir::new(source)
            .into_iter()
            .filter_map(std::result::Result::ok)
        {
            let relative = entry.path().strip_prefix(source).map_err(|_| {
                SwitcherError::InvalidConfiguration("Nieprawidłowa ścieżka wtyczki".to_owned())
            })?;
            if relative
                .components()
                .any(|part| part.as_os_str() == "node_modules" || part.as_os_str() == ".git")
            {
                continue;
            }
            let output = destination.join(relative);
            if entry.file_type().is_dir() {
                fs::create_dir_all(&output)
                    .map_err(|source_error| SwitcherError::io(&output, source_error))?;
            } else {
                if let Some(parent) = output.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|source_error| SwitcherError::io(parent, source_error))?;
                }
                fs::copy(entry.path(), &output)
                    .map_err(|source_error| SwitcherError::io(&output, source_error))?;
                written += 1;
            }
        }

        let runtime_config = serde_json::json!({
            "port": port,
            "apiSecret": api_secret,
            "generatedBy": "Antigravity Account Switcher"
        });
        switcher_core::save_json(&destination.join("switcher-runtime.json"), &runtime_config)?;
        self.logger.info(
            Some(operation_id),
            "extension",
            format!("Extension installed successfully, files={written}"),
        );
        Ok(ExtensionInstallResult {
            destination: destination.to_string_lossy().into_owned(),
            files_written: written,
        })
    }
}
