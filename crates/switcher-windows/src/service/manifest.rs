/**
 * Manifest, hashing and file merging utilities.
 * Handles directory state hashing, checking directory volume scopes, and copy/merging of profile files.
 * Main exports: hash_file, hash_directory, merge_missing_files, remove_path, path_summary
 */

use std::fs;
use std::path::Path;
use sha2::{Digest, Sha256};
use walkdir::WalkDir;
use uuid::Uuid;
use chrono::Utc;

use crate::{SwitcherService, CredentialStore};
use switcher_core::{Result, SwitcherError, ProfileManifest, sanitize_path};

pub(crate) fn hash_file(path: &Path) -> Result<String> {
    let bytes = fs::read(path).map_err(|source| SwitcherError::io(path, source))?;
    Ok(hex_digest(&bytes))
}

pub(crate) fn hash_directory(path: &Path) -> Result<String> {
    if !path.is_dir() {
        return Err(SwitcherError::MissingActiveData(path.to_path_buf()));
    }
    let mut records = Vec::new();
    for entry in WalkDir::new(path).follow_links(false).into_iter() {
        let entry = entry.map_err(|error| SwitcherError::Message(error.to_string()))?;
        if entry.file_type().is_symlink() {
            return Err(SwitcherError::InvalidConfiguration(format!(
                "Symlinks/reparse points are not supported in the profile: {}",
                entry.path().display()
            )));
        }
        let relative = entry.path().strip_prefix(path).unwrap_or(entry.path());
        let kind = if entry.file_type().is_dir() { "d" } else { "f" };
        let length = entry.metadata().map(|metadata| metadata.len()).unwrap_or(0);
        records.push(format!(
            "{kind}:{}:{length}",
            relative.to_string_lossy().replace('\\', "/")
        ));
    }
    records.sort();
    Ok(hex_digest(records.join("\n").as_bytes()))
}

pub(crate) fn hex_digest(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub(crate) fn merge_missing_files(source: &Path, destination: &Path) -> Result<u64> {
    if !source.is_dir() {
        return Ok(0);
    }
    let mut copied = 0;
    for entry in WalkDir::new(source).follow_links(false).into_iter() {
        let entry = entry.map_err(|error| SwitcherError::Message(error.to_string()))?;
        if entry.file_type().is_file() {
            let relative = entry
                .path()
                .strip_prefix(source)
                .map_err(|_| SwitcherError::Message("Path relativization error".to_owned()))?;
            let dest_path = destination.join(relative);
            if !dest_path.exists() {
                if let Some(parent) = dest_path.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|source_error| SwitcherError::io(parent, source_error))?;
                }
                fs::copy(entry.path(), &dest_path)
                    .map_err(|source_error| SwitcherError::io(entry.path(), source_error))?;
                copied += 1;
            }
        }
    }
    Ok(copied)
}

pub(crate) fn remove_path(path: &Path) -> Result<()> {
    if path.is_file() {
        fs::remove_file(path).map_err(|source| SwitcherError::io(path, source))?;
    } else if path.is_dir() {
        fs::remove_dir_all(path).map_err(|source| SwitcherError::io(path, source))?;
    }
    Ok(())
}

pub(crate) fn path_summary(path: &Path) -> String {
    let Ok(metadata) = fs::metadata(path) else {
        return "status=missing".to_owned();
    };
    if metadata.is_file() {
        return format!("status=file bytes={}", metadata.len());
    }
    let mut files = 0_u64;
    let mut bytes = 0_u64;
    let mut errors = 0_u64;
    for entry in WalkDir::new(path).follow_links(false) {
        match entry {
            Ok(entry) if entry.file_type().is_file() => {
                files += 1;
                match entry.metadata() {
                    Ok(metadata) => bytes = bytes.saturating_add(metadata.len()),
                    Err(_) => errors += 1,
                }
            }
            Ok(_) => {}
            Err(_) => errors += 1,
        }
    }
    format!("status=directory files={files} bytes={bytes} scan_errors={errors}")
}

impl SwitcherService {
    pub(crate) fn log_artifact_inventory(
        &self,
        operation_id: Option<Uuid>,
        label: &str,
        profile_id: Option<Uuid>,
    ) {
        for artifact in self.paths.artifacts() {
            let path = profile_id
                .map(|id| self.paths.profile_dir(id).join(&artifact.profile_relative))
                .unwrap_or_else(|| artifact.active.clone());
            self.logger.debug(
                operation_id,
                "diagnostics",
                format!(
                    "Artifact inventory label={label} kind={:?} required={} path={} {}",
                    artifact.kind,
                    artifact.required,
                    sanitize_path(&path),
                    path_summary(&path),
                ),
            );
        }
    }

    pub(crate) fn capture_active_manifest(&self, credential: &[u8]) -> Result<ProfileManifest> {
        Ok(ProfileManifest {
            credential_digest: CredentialStore::digest(credential),
            state_digest: hash_file(&self.paths.state_db)?,
            brain_marker: hash_directory(&self.paths.gemini_root.join("brain"))?,
            conversations_marker: hash_directory(&self.paths.gemini_root.join("conversations"))?,
            captured_at: Some(Utc::now()),
        })
    }
}
