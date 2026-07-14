/**
 * ASAR patching service for language server restart cooldown.
 * Implements backup, extraction, modification, packing, and validation of app.asar.
 */

use std::fs;
use std::path::Path;
use std::process::Command;
use uuid::Uuid;

use crate::SwitcherService;
use switcher_core::{Result, SwitcherError, save_json};

impl SwitcherService {
    /// Checks if the app.asar file is patched with the expected cooldown value.
    /// Returns true if it is patched, false if it is not.
    /// Returns an error if the file cannot be read or is invalid.
    pub fn is_asar_patched(&self) -> Result<bool> {
        let config = self.config.read().clone();
        let install_path = match &config.installation_path {
            Some(path) => path,
            None => return Ok(false),
        };
        let asar_path = install_path.join("resources").join("app.asar");
        if !asar_path.is_file() {
            return Ok(false);
        }

        let metadata = fs::metadata(&asar_path).map_err(|e| SwitcherError::io(&asar_path, e))?;
        let current_mtime = metadata.modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::SystemTime::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        if config.patched_asar_mtime == Some(current_mtime)
            && config.patched_asar_cooldown == Some(config.patch_cooldown_ms)
        {
            return Ok(true);
        }

        let bytes = fs::read(&asar_path).map_err(|e| SwitcherError::io(&asar_path, e))?;
        let content = String::from_utf8_lossy(&bytes);
        let is_patched = self.verify_cooldown_in_str(&content, config.patch_cooldown_ms);

        if is_patched {
            let mut write_config = self.config.write();
            write_config.patched_asar_mtime = Some(current_mtime);
            write_config.patched_asar_cooldown = Some(config.patch_cooldown_ms);
            let _ = save_json(&self.paths.config, &*write_config);
        }

        Ok(is_patched)
    }

    /// Verifies and applies the patch to app.asar if needed.
    /// Returns true if patch was applied/re-applied, false if it was already patched.
    /// If Antigravity is running and we need to patch, we stop it first.
    pub fn ensure_asar_patched(&self, operation_id: Option<Uuid>) -> Result<bool> {
        let op_id = operation_id.unwrap_or_else(Uuid::new_v4);
        let config = self.config.read().clone();
        let install_path = match &config.installation_path {
            Some(path) => path,
            None => {
                self.logger.warn(Some(op_id), "patch", "No installation path configured; skipping asar patch check.");
                return Ok(false);
            }
        };
        
        let asar_path = install_path.join("resources").join("app.asar");
        if !asar_path.is_file() {
            self.logger.warn(Some(op_id), "patch", format!("app.asar not found at {}; skipping patch.", asar_path.display()));
            return Ok(false);
        }

        // Check if already patched
        if self.is_asar_patched()? {
            return Ok(false);
        }

        self.logger.info(Some(op_id), "patch", "app.asar is not patched or needs update; initiating patch routine.");

        // Check if Antigravity is running, and if so, handle it
        let process_mgr = self.process_manager()?;
        let is_running = process_mgr.is_running();
        if is_running {
            if operation_id.is_none() {
                self.logger.info(Some(op_id), "patch", "Antigravity is running; skipping startup patch check to avoid closing the application.");
                return Ok(false);
            }
            self.logger.info(Some(op_id), "patch", "Antigravity is running. Closing processes to unlock app.asar.");
            process_mgr.close_all(op_id)?;
            // Sleep slightly to let files unlock
            std::thread::sleep(std::time::Duration::from_millis(500));
        }

        // 1. Take a backup of the original untouched app.asar
        let bytes = fs::read(&asar_path).map_err(|e| SwitcherError::io(&asar_path, e))?;
        let content_str = String::from_utf8_lossy(&bytes);
        let backup_path = self.paths.root.join("app.asar.backup");
        let is_original = self.verify_cooldown_in_str(&content_str, 2000);
        
        if is_original {
            self.logger.info(Some(op_id), "patch", format!("Backing up untouched original app.asar to {}", backup_path.display()));
            fs::copy(&asar_path, &backup_path).map_err(|e| SwitcherError::io(&backup_path, e))?;
        } else if !backup_path.is_file() {
            self.logger.warn(Some(op_id), "patch", "Backup not found and live app.asar is already modified. Backing up live file as fallback.");
            fs::copy(&asar_path, &backup_path).map_err(|e| SwitcherError::io(&backup_path, e))?;
        }

        // 2. Perform patching in a temp directory
        let temp_dir = self.paths.root.join("temp_patch");
        let temp_patched_asar = self.paths.root.join("app.asar.patched");
        let temp_val_dir = self.paths.root.join("temp_val");

        // Clean up any stale temp paths
        let _ = fs::remove_dir_all(&temp_dir);
        let _ = fs::remove_file(&temp_patched_asar);
        let _ = fs::remove_dir_all(&temp_val_dir);

        let patch_result = self.run_patch_sequence(&asar_path, &temp_dir, &temp_patched_asar, &temp_val_dir, config.patch_cooldown_ms, op_id);

        if let Err(err) = patch_result {
            self.logger.error(Some(op_id), "patch", format!("Patch sequence failed: {}. Restoring backup.", err));
            // Attempt to restore backup
            if backup_path.is_file() {
                if let Err(restore_err) = fs::copy(&backup_path, &asar_path) {
                    self.logger.error(Some(op_id), "patch", format!("FATAL: Failed to restore backup app.asar: {}", restore_err));
                } else {
                    self.logger.info(Some(op_id), "patch", "Successfully restored original app.asar from backup.");
                }
            }
            // Clean up
            let _ = fs::remove_dir_all(&temp_dir);
            let _ = fs::remove_file(&temp_patched_asar);
            let _ = fs::remove_dir_all(&temp_val_dir);
            return Err(err);
        }

        // 3. Move the verified patched asar to live location
        self.logger.info(Some(op_id), "patch", "Patch successfully verified. Overwriting live app.asar.");
        fs::copy(&temp_patched_asar, &asar_path).map_err(|e| SwitcherError::io(&asar_path, e))?;

        if let Ok(metadata) = fs::metadata(&asar_path) {
            if let Some(mtime) = metadata.modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::SystemTime::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
            {
                let mut write_config = self.config.write();
                write_config.patched_asar_mtime = Some(mtime);
                write_config.patched_asar_cooldown = Some(write_config.patch_cooldown_ms);
                let _ = save_json(&self.paths.config, &*write_config);
            }
        }

        // Clean up
        let _ = fs::remove_dir_all(&temp_dir);
        let _ = fs::remove_file(&temp_patched_asar);
        let _ = fs::remove_dir_all(&temp_val_dir);

        Ok(true)
    }

    fn run_patch_sequence(
        &self, 
        asar_path: &Path, 
        temp_dir: &Path, 
        temp_patched_asar: &Path, 
        temp_val_dir: &Path, 
        target_cooldown: u32, 
        op_id: Uuid
    ) -> Result<()> {
        use std::os::windows::process::CommandExt;
        // Extract
        self.logger.info(Some(op_id), "patch", "Extracting app.asar archive...");
        let status = Command::new("cmd")
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .args(&["/C", "npx", "asar", "extract"])
            .arg(asar_path)
            .arg(temp_dir)
            .status()
            .map_err(|e| SwitcherError::ProcessShutdown(format!("Failed to start npx asar extract: {}", e)))?;
        
        if !status.success() {
            return Err(SwitcherError::ProcessShutdown("npx asar extract failed".to_owned()));
        }

        // Edit dist/languageServer.js
        let js_path = temp_dir.join("dist").join("languageServer.js");
        if !js_path.is_file() {
            return Err(SwitcherError::ProcessShutdown("Extracted languageServer.js not found".to_owned()));
        }

        let js_content = fs::read_to_string(&js_path).map_err(|e| SwitcherError::io(&js_path, e))?;
        
        let patched_content = self.patch_js_content(&js_content, target_cooldown)
            .ok_or_else(|| SwitcherError::ProcessShutdown("Constant RESTART_COOLDOWN_MS not found in languageServer.js".to_owned()))?;

        fs::write(&js_path, patched_content).map_err(|e| SwitcherError::io(&js_path, e))?;
        self.logger.info(Some(op_id), "patch", format!("Modified RESTART_COOLDOWN_MS to {} in languageServer.js", target_cooldown));

        // Pack
        self.logger.info(Some(op_id), "patch", "Packing patched app.asar archive...");
        let status = Command::new("cmd")
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .args(&["/C", "npx", "asar", "pack"])
            .arg(temp_dir)
            .arg(temp_patched_asar)
            .status()
            .map_err(|e| SwitcherError::ProcessShutdown(format!("Failed to start npx asar pack: {}", e)))?;

        if !status.success() {
            return Err(SwitcherError::ProcessShutdown("npx asar pack failed".to_owned()));
        }

        // Verify structural validity by extracting to temp_val_dir
        self.logger.info(Some(op_id), "patch", "Validating patched app.asar structure...");
        let status = Command::new("cmd")
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .args(&["/C", "npx", "asar", "extract"])
            .arg(temp_patched_asar)
            .arg(temp_val_dir)
            .status()
            .map_err(|e| SwitcherError::ProcessShutdown(format!("Failed to start npx asar extract for validation: {}", e)))?;

        if !status.success() {
            return Err(SwitcherError::ProcessShutdown("Validation extract failed (asar archive structurally invalid)".to_owned()));
        }

        let val_js_path = temp_val_dir.join("dist").join("languageServer.js");
        if !val_js_path.is_file() {
            return Err(SwitcherError::ProcessShutdown("Validation failed: languageServer.js not found in unpacked archive".to_owned()));
        }

        let val_js_content = fs::read_to_string(&val_js_path).map_err(|e| SwitcherError::io(&val_js_path, e))?;
        if !self.verify_cooldown_in_str(&val_js_content, target_cooldown) {
            return Err(SwitcherError::ProcessShutdown("Validation failed: constant not updated correctly in repacked archive".to_owned()));
        }

        Ok(())
    }

    fn patch_js_content(&self, content: &str, target_cooldown: u32) -> Option<String> {
        let key = "RESTART_COOLDOWN_MS";
        if let Some(pos) = content.find(key) {
            let after_key = pos + key.len();
            if let Some(eq_offset) = content[after_key..].find('=') {
                let eq_pos = after_key + eq_offset;
                if let Some(semi_offset) = content[eq_pos..].find(';') {
                    let semi_pos = eq_pos + semi_offset;
                    let mut new_content = content[..eq_pos + 1].to_string();
                    new_content.push_str(&format!(" {};", target_cooldown));
                    new_content.push_str(&content[semi_pos + 1..]);
                    return Some(new_content);
                }
            }
        }
        None
    }

    fn verify_cooldown_in_str(&self, content: &str, target_cooldown: u32) -> bool {
        let key = "RESTART_COOLDOWN_MS";
        if let Some(pos) = content.find(key) {
            let after_key = pos + key.len();
            if let Some(eq_offset) = content[after_key..].find('=') {
                let eq_pos = after_key + eq_offset;
                if let Some(semi_offset) = content[eq_pos..].find(';') {
                    let value_str = content[eq_pos + 1..eq_pos + semi_offset].trim();
                    if let Ok(val) = value_str.parse::<u32>() {
                        return val == target_cooldown;
                    }
                }
            }
        }
        false
    }
}
