/**
 * Fast switcher transaction operations (Level 2).
 * Implements Level 2 switching (restarting only language_server.exe) and fallback to Level 1.
 * Main exports: impl SwitcherService perform_fast_switch method
 */

use std::thread;
use std::time::{Duration, Instant};
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
        
        // 1. Cooldown check (handled in request_switch, but check again here for safety)
        self.check_cooldown()?;
        
        // 2. Identify all language_server.exe processes before writing credentials/killing
        let process = self.process_manager()?;
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
        
        let mut success = false;
        let mut new_pid = None;
        let poll_start = Instant::now();
        
        // Poll for up to 5 seconds
        while poll_start.elapsed() < Duration::from_secs(5) {
            thread::sleep(Duration::from_millis(100));
            if let Ok(current_procs) = process.get_language_server_processes() {
                if let Some(new_proc) = current_procs.iter().find(|p| !old_pids.contains(&p.pid)) {
                    // Found a new process!
                    new_pid = Some(new_proc.pid);
                    // Verify it stays alive for at least 150ms
                    thread::sleep(Duration::from_millis(150));
                    if let Ok(verify_procs) = process.get_language_server_processes() {
                        if verify_procs.iter().any(|p| p.pid == new_proc.pid) {
                            success = true;
                            break;
                        }
                    }
                }
            }
        }
        
        if success {
            self.logger.info(
                Some(operation_id),
                "process",
                format!(
                    "language_server.exe restarted successfully in {} ms, new pid={}",
                    started.elapsed().as_millis(),
                    new_pid.unwrap_or(0)
                ),
            );
            
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
            
            // Let the editor GUI reload and settle before completing the switch
            thread::sleep(Duration::from_millis(1500));
            
            self.progress.write().take();
            
            Ok(SwitchOutcome {
                operation_id,
                relaunched_pid: new_pid,
                warning: None,
            })
        } else {
            // FALLBACK TO TIER 0 / LEVEL 1 (Full restart)
            self.logger.warn(
                Some(operation_id),
                "process",
                "Fast restart failed: language_server.exe did not respawn or respond. Falling back to full app restart.",
            );
            
            // Perform Level 1 (Full restart) switch sequence
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
            
            // Record successful switch attempt in history
            self.last_switches.lock().push(Instant::now());
            
            Ok(SwitchOutcome {
                operation_id,
                relaunched_pid,
                warning: Some("Fast restart failed (service did not restart). A full restart of the application was performed.".to_owned()),
            })
        }
    }
}
