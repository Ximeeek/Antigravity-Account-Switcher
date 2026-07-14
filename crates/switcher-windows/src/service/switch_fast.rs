/**
 * Fast switcher transaction operations (Level 2).
 * Implements Level 2 switching (restarting only language_server.exe) and fallback to Level 1.
 * Main exports: impl SwitcherService perform_fast_switch method
 */

use std::time::Instant;
use uuid::Uuid;

use crate::{SwitcherService, SwitchOutcome};
use switcher_core::{
    Result, SwitchLock, SwitchStep,
    save_json,
};

impl SwitcherService {
    pub(crate) fn perform_fast_switch(&self, operation_id: Uuid, target_profile_id: Uuid) -> Result<SwitchOutcome> {
        self.paths.validate_same_volume()?;
        self.preflight_target_identity(target_profile_id)?;
        
        let switch_level = self.config.read().switch_level;
        let from_profile_id = self
            .config
            .read()
            .active_profile_id
            .unwrap_or_else(Uuid::nil);
            
        let active_credential = if from_profile_id.is_nil() {
            Vec::new()
        } else {
            self.credentials.read_active()?
        };
        let protected_active = if from_profile_id.is_nil() {
            crate::ProtectedCredential(Vec::new())
        } else {
            self.credentials.protect(&active_credential)?
        };
        let target_credential = self.load_profile_credential(target_profile_id)?;
        
        let started = Instant::now();
        let mut lock = SwitchLock::new(from_profile_id, target_profile_id);
        lock.operation_id = operation_id;
        
        self.set_progress(&lock, None);
        self.journal().write(&lock)?;
        
        let process = self.process_manager()?;
        
        // 0. Auto-patch app.asar if needed (Level 2+ / 3 only). If the patch was successfully
        // applied/re-applied, it required closing Antigravity.exe (if it was running).
        // In that case, we MUST perform a full restart switch fallback.
        let patch_applied = if switch_level == 3 {
            self.ensure_asar_patched(Some(operation_id))?
        } else {
            false
        };
        if patch_applied {
            self.logger.info(
                Some(operation_id),
                "patch",
                "app.asar patch was applied/re-applied. Falling back to full app restart switch for this cycle.",
            );
            
            // Backup current profile's credentials if not nil
            if !from_profile_id.is_nil() {
                self.backup_current_profile(&mut lock, &active_credential, &protected_active)?;
            }
            
            // Write target credentials
            self.credentials.write_active(&target_credential)?;
            lock.target_credential_written = true;
            self.journal().write(&lock)?;
            
            // Make sure everything is closed/unlocked
            lock.current_step = SwitchStep::CloseProcesses;
            self.journal().write(&lock)?;
            process.close_all(operation_id)?;
            
            lock.current_step = SwitchStep::VerifyUnlocked;
            self.journal().write(&lock)?;
            process.wait_until_unlocked(&self.paths, operation_id)?;
            
            {
                let mut config = self.config.write();
                config.active_profile_id = Some(target_profile_id);
                save_json(&self.paths.config, &*config)?;
            }
            self.touch_profile(target_profile_id)?;
            
            self.journal().remove()?;
            
            let relaunched_pid = match process.launch(Some(operation_id)) {
                Ok(pid) => Some(pid),
                Err(error) => {
                    self.logger.error(
                        Some(operation_id),
                        "process",
                        format!("Full restart fallback relaunch failed: {}", error),
                    );
                    None
                }
            };
            
            self.progress.write().take();
            self.last_switches.lock().push(Instant::now());
            
            return Ok(SwitchOutcome {
                operation_id,
                relaunched_pid,
                warning: Some("The app.asar patch was applied. A full restart of the application was performed.".to_owned()),
            });
        }

        // 1. Cooldown check (handled in request_switch, but check again here for safety)
        self.check_cooldown()?;
        
        // 2. Identify all language_server.exe processes before writing credentials/killing
        let ls_procs = process.get_language_server_processes()?;
        let old_pids: std::collections::HashSet<u32> = ls_procs.iter().map(|p| p.pid).collect();
        
        // 3. Write target credentials and kill all language_server.exe processes immediately to prevent race conditions
        lock.current_step = SwitchStep::CloseProcesses;
        self.journal().write(&lock)?;
        
        self.credentials.write_active(&target_credential)?;
        lock.target_credential_written = true;
        self.journal().write(&lock)?;
        
        for &pid in &old_pids {
            self.logger.info(
                Some(operation_id),
                "process",
                format!("Killing language_server.exe process pid={}", pid),
            );
            if let Err(e) = process.kill_pid(pid) {
                self.logger.warn(
                    Some(operation_id),
                    "process",
                    format!("Failed to kill language_server.exe process pid={}: {}", pid, e),
                );
            }
        }
        
        self.set_progress(&lock, None);
        
        // 4. Backup current profile's credentials
        lock.current_step = SwitchStep::BackupCurrent;
        self.journal().write(&lock)?;
        self.set_progress(&lock, None);
        if !from_profile_id.is_nil() {
            self.backup_current_profile(&mut lock, &active_credential, &protected_active)?;
        }
        
        // 5. Update credentials step (visual progress transition)
        lock.current_step = SwitchStep::UpdateCredential;
        self.journal().write(&lock)?;
        self.set_progress(&lock, None);
        
        // 6. Verify target credentials consistency
        lock.current_step = SwitchStep::VerifyConsistency;
        self.journal().write(&lock)?;
        self.set_progress(&lock, None);
        self.verify_target(&target_credential)?;
        
        // 7. Wait for auto-respawn and verify responsiveness
        lock.current_step = SwitchStep::Relaunch;
        self.journal().write(&lock)?;
        self.set_progress(&lock, None);
        
        // Update active profile in switcher config
        {
            let mut config = self.config.write();
            config.active_profile_id = Some(target_profile_id);
            save_json(&self.paths.config, &*config)?;
        }
        self.touch_profile(target_profile_id)?;
        
        // Record successful switch attempt in history
        self.last_switches.lock().push(Instant::now());
        
        self.journal().remove()?;
        self.progress.write().take();
        
        self.logger.info(
            Some(operation_id),
            "process",
            format!("Fast switch completed successfully in {} ms", started.elapsed().as_millis()),
        );

        Ok(SwitchOutcome {
            operation_id,
            relaunched_pid: None,
            warning: None,
        })
    }
}
