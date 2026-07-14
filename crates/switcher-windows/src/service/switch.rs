/**
 * Core switcher transaction operations.
 * Implements locking, closing processes, backing up metadata, database repairs, launching target processes, and full rollbacks on failure.
 * Main exports: impl SwitcherService switch methods
 */

use std::fs;
use std::time::{Duration, Instant};
use uuid::Uuid;

use crate::{SwitcherService, SwitchOutcome, PendingSwitch};
use switcher_core::{
    Result, SwitcherError, SwitchLock, SwitchStep, LockStatus, SwitchRequestResult,
    save_json,
};

use super::database::validate_state_database;

impl SwitcherService {
    pub fn check_cooldown(&self) -> Result<()> {
        let mut history = self.last_switches.lock();
        let now = Instant::now();
        
        // Clean up entries older than 60 seconds
        history.retain(|&t| now.duration_since(t) < Duration::from_secs(60));
        
        // Enforce minimum gap of 4 seconds between any two switches
        if let Some(&last) = history.last() {
            let elapsed = now.duration_since(last);
            if elapsed < Duration::from_secs(4) {
                let remaining = 4 - elapsed.as_secs();
                return Err(SwitcherError::Message(format!(
                    "Please wait {}s before switching accounts again.",
                    remaining
                )));
            }
        }
        
        // Enforce max 2 switches in 60 seconds
        if history.len() >= 2 {
            let oldest = history[0];
            let elapsed = now.duration_since(oldest);
            let wait_secs = if elapsed < Duration::from_secs(60) {
                60 - elapsed.as_secs()
            } else {
                1
            };
            return Err(SwitcherError::Message(format!(
                "Rate limit exceeded. Please try again in {}s.",
                wait_secs
            )));
        }
        
        Ok(())
    }

    pub fn request_switch(&self, target_profile_id: Uuid, password: Option<String>) -> Result<SwitchRequestResult> {
        if self.journal().exists() {
            return Err(SwitcherError::RecoveryRequired);
        }
        if self.progress.read().is_some() {
            return Err(SwitcherError::OperationInProgress);
        }
        let config = self.config.read().clone();
        let active = config.active_profile_id.unwrap_or_else(Uuid::nil);
        if active == target_profile_id {
            return Err(SwitcherError::ProfileAlreadyActive);
        }
        let has_master_password = self.paths.root.join("master_lock.json").is_file();
        let is_app_locked = has_master_password && self.master_key.read().is_none();
        if is_app_locked {
            return Err(SwitcherError::Message("Application is locked. Unlock to perform switch.".to_owned()));
        }
        let _metadata = self.load_profile_metadata(target_profile_id)?;
        self.preflight_target_identity(target_profile_id)?;

        
        // Cooldown check
        self.check_cooldown()?;
        
        let operation_id = Uuid::new_v4();
        let requires_confirmation = if config.switch_level == 2 || config.switch_level == 3 {
            false
        } else {
            self.process_manager()?.is_running()
        };
        self.pending.lock().insert(
            operation_id,
            PendingSwitch {
                operation_id,
                target_profile_id,
                requires_confirmation,
                password,
            },
        );
        self.logger.info(
            Some(operation_id),
            "profile",
            format!(
                "Switch requested: {active} -> {target_profile_id}, requires_confirmation={requires_confirmation}"
            ),
        );
        Ok(SwitchRequestResult {
            requires_confirmation,
            operation_id,
            target_profile_id,
        })
    }


    pub fn cancel_switch(&self, operation_id: Option<Uuid>) -> Result<()> {
        let mut pending = self.pending.lock();
        if let Some(operation_id) = operation_id {
            pending.remove(&operation_id);
        } else {
            pending.clear();
        }
        Ok(())
    }

    pub fn confirm_switch(&self, operation_id: Uuid) -> Result<SwitchOutcome> {
        self.logger.info(
            Some(operation_id),
            "profile",
            "Switch confirmation received",
        );
        let pending = self.pending.lock().remove(&operation_id).ok_or_else(|| {
            SwitcherError::Message("Switch request expired or was cancelled".to_owned())
        })?;
        match self.perform_switch(pending.operation_id, pending.target_profile_id, pending.password.as_deref()) {
            Ok(outcome) => Ok(outcome),

            Err(error) => {
                self.logger.error(
                    Some(operation_id),
                    "profile",
                    format!("Switch failed before completion: {error}"),
                );
                Err(error)
            }
        }
    }

    pub fn recovery_rollback(&self) -> Result<()> {
        let _guard = self.operation_lock.lock();
        let mut lock = self.journal().read()?.ok_or_else(|| {
            SwitcherError::InvalidConfiguration("No switch operation to recover".to_owned())
        })?;
        let process = self.process_manager()?;
        if process.is_running() {
            if self.config.read().switch_level == 4 {
                process.close_all_optimized(lock.operation_id)?;
            } else {
                process.close_all(lock.operation_id)?;
            }
            process.wait_until_unlocked(&self.paths, lock.operation_id)?;
        }
        self.rollback_to_source(&mut lock)?;
        {
            let mut config = self.config.write();
            config.active_profile_id = Some(lock.from_profile_id);
            save_json(&self.paths.config, &*config)?;
        }
        self.journal().remove()?;
        self.progress.write().take();
        self.logger.info(
            Some(lock.operation_id),
            "recovery",
            "Previous state restored successfully",
        );
        Ok(())
    }

    pub fn recovery_resume(&self) -> Result<SwitchOutcome> {
        let (operation_id, target_profile_id) = {
            let _guard = self.operation_lock.lock();
            let mut lock = self.journal().read()?.ok_or_else(|| {
                SwitcherError::InvalidConfiguration("No switch operation to recover".to_owned())
            })?;
            let process = self.process_manager()?;
            if process.is_running() {
                if self.config.read().switch_level == 4 {
                    process.close_all_optimized(lock.operation_id)?;
                } else {
                    process.close_all(lock.operation_id)?;
                }
                process.wait_until_unlocked(&self.paths, lock.operation_id)?;
            }
            self.rollback_to_source(&mut lock)?;
            {
                let mut config = self.config.write();
                config.active_profile_id = Some(lock.from_profile_id);
                save_json(&self.paths.config, &*config)?;
            }
            self.journal().remove()?;
            (Uuid::new_v4(), lock.to_profile_id)
        };
        self.logger.info(
            Some(operation_id),
            "recovery",
            "Durable journal normalized; replaying interrupted switch",
        );
        self.perform_switch(operation_id, target_profile_id, None)
    }

    pub(crate) fn perform_switch(&self, operation_id: Uuid, target_profile_id: Uuid, password: Option<&str>) -> Result<SwitchOutcome> {
        let _guard = self.operation_lock.lock();
        if self.journal().exists() {
            return Err(SwitcherError::RecoveryRequired);
        }
        
        let config = self.config.read().clone();
        if config.switch_level == 2 || config.switch_level == 3 {
            return self.perform_fast_switch(operation_id, target_profile_id, password);
        }

        
        self.paths.validate_same_volume()?;
        let from_profile_id = self
            .config
            .read()
            .active_profile_id
            .unwrap_or_else(Uuid::nil);
        if !from_profile_id.is_nil() {
            self.preflight_active_artifacts()?;
        }
        self.preflight_target_identity(target_profile_id)?;
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
        let target_credential = self.load_profile_credential(target_profile_id, password)?;

        let started = Instant::now();
        let mut lock = SwitchLock::new(from_profile_id, target_profile_id);
        lock.operation_id = operation_id;
        self.set_progress(&lock, None);
        self.journal().write(&lock)?;
        self.logger
            .info(Some(operation_id), "profile", "Lock file written, step=1");

        let process = self.process_manager()?;
        lock.current_step = SwitchStep::CloseProcesses;
        self.journal().write(&lock)?;
        self.set_progress(&lock, None);
        let is_level1_plus = config.switch_level == 4;
        let close_result = if is_level1_plus {
            process.close_all_optimized(operation_id)
        } else {
            process.close_all(operation_id)
        };
        if let Err(error) = close_result {
            lock.status = LockStatus::FailedAtStep2;
            self.journal().write(&lock)?;
            self.progress.write().take();
            self.logger
                .error(Some(operation_id), "process", error.to_string());
            return Err(error);
        }

        lock.current_step = SwitchStep::VerifyUnlocked;
        self.journal().write(&lock)?;
        self.set_progress(&lock, None);
        if let Err(error) = process.wait_until_unlocked(&self.paths, operation_id) {
            lock.status = LockStatus::FailedAtStep3;
            self.journal().write(&lock)?;
            self.progress.write().take();
            self.logger
                .error(Some(operation_id), "process", error.to_string());
            return Err(error);
        }

        if let Err(error) = (|| -> Result<()> {
            if !from_profile_id.is_nil() {
                self.repair_active_state_database_if_needed(operation_id)?;
                self.preflight_active()?;
            }
            if !is_level1_plus {
                self.merge_legacy_profile_artifacts(operation_id)?;
            }
            Ok(())
        })() {
            self.logger.error(
                Some(operation_id),
                "profile",
                format!(
                    "Shared editor data preparation failed before credentials were changed: {error}"
                ),
            );
            self.journal().remove()?;
            self.progress.write().take();
            if let Err(launch_error) = process.launch(Some(operation_id)) {
                self.logger.warn(
                    Some(operation_id),
                    "process",
                    format!("Failed to relaunch Antigravity after shared data preparation error: {launch_error}"),
                );
            }
            return Err(error);
        }
        self.log_artifact_inventory(Some(operation_id), "shared-data-ready", None);

        lock.current_step = SwitchStep::BackupCurrent;
        self.journal().write(&lock)?;
        self.set_progress(&lock, None);
        if !from_profile_id.is_nil() {
            if let Err(error) =
                self.backup_current_profile(&mut lock, &active_credential, &protected_active)
            {
                lock.status = LockStatus::FailedAtStep4RolledBack;
                self.fail_with_rollback(&mut lock, &error)?;
                return Err(error);
            }
        }

        lock.current_step = SwitchStep::LoadTarget;
        self.journal().write(&lock)?;
        self.set_progress(&lock, None);
        self.logger.info(
            Some(operation_id),
            "profile",
            "Shared editor and conversation data kept in place",
        );

        lock.current_step = SwitchStep::UpdateCredential;
        self.journal().write(&lock)?;
        self.set_progress(&lock, None);
        if let Err(error) = self.credentials.write_active(&target_credential) {
            lock.status = LockStatus::FailedAtStep6RolledBack;
            self.fail_with_rollback(&mut lock, &error)?;
            return Err(error);
        }
        lock.target_credential_written = true;
        self.journal().write(&lock)?;
        self.logger.info(
            Some(operation_id),
            "credential",
            format!("Credential Manager updated for profile {target_profile_id}"),
        );

        lock.current_step = SwitchStep::VerifyConsistency;
        self.journal().write(&lock)?;
        self.set_progress(&lock, None);
        if let Err(error) = self.verify_target(&target_credential) {
            lock.status = LockStatus::InconsistentStateRequiresManualRecovery;
            self.journal().write(&lock)?;
            self.progress.write().take();
            self.logger
                .error(Some(operation_id), "profile", error.to_string());
            return Err(error);
        }
        self.logger.info(Some(operation_id), "profile", "Consistency check passed");

        {
            let mut config = self.config.write();
            config.active_profile_id = Some(target_profile_id);
            save_json(&self.paths.config, &*config)?;
        }
        self.touch_profile(target_profile_id)?;
        lock.current_step = SwitchStep::RemoveLock;
        self.journal().write(&lock)?;
        self.set_progress(&lock, None);
        self.journal().remove()?;
        self.logger.info(
            Some(operation_id),
            "profile",
            format!(
                "Switch completed successfully, from={from_profile_id} to={target_profile_id}, duration_ms={}",
                started.elapsed().as_millis()
            ),
        );

        lock.current_step = SwitchStep::Relaunch;
        self.set_progress(&lock, None);
        self.log_artifact_inventory(Some(operation_id), "active-before-relaunch", None);
        let (relaunched_pid, warning) = match process.launch(Some(operation_id)) {
            Ok(pid) => (Some(pid), None),
            Err(error) => {
                let warning = "Profile switched successfully, but Antigravity failed to start. Please start it manually.".to_owned();
                self.logger
                    .warn(Some(operation_id), "process", format!("{warning} {error}"));
                (None, Some(warning))
            }
        };
        self.progress.write().take();
        Ok(SwitchOutcome {
            operation_id,
            relaunched_pid,
            warning,
        })
    }

    pub(crate) fn backup_current_profile(
        &self,
        lock: &mut SwitchLock,
        active_credential: &[u8],
        protected: &crate::ProtectedCredential,
    ) -> Result<()> {
        let profile_dir = self.paths.profile_dir(lock.from_profile_id);
        fs::create_dir_all(&profile_dir)
            .map_err(|source| SwitcherError::io(&profile_dir, source))?;

        self.save_profile_credentials(lock.from_profile_id, active_credential)?;

        lock.credential_backup_written = true;
        let manifest = self.capture_active_manifest(active_credential)?;
        save_json(&profile_dir.join("manifest.json"), &manifest)?;
        self.journal().write(lock)?;

        self.logger.info(
            Some(lock.operation_id),
            "profile",
            "Current credential backed up; shared editor data was not moved",
        );
        Ok(())
    }

    fn fail_with_rollback(&self, lock: &mut SwitchLock, error: &SwitcherError) -> Result<()> {
        self.logger
            .error(Some(lock.operation_id), "profile", error.to_string());
        if let Err(rollback_error) = self.rollback_to_source(lock) {
            lock.status = LockStatus::InconsistentStateRequiresManualRecovery;
            self.journal().write(lock)?;
            self.progress.write().take();
            self.logger.error(
                Some(lock.operation_id),
                "profile",
                format!("Failed to rollback: {rollback_error}"),
            );
            return Err(rollback_error);
        }
        self.journal().remove()?;
        self.progress.write().take();
        if let Err(launch_error) = self.process_manager()?.launch(Some(lock.operation_id)) {
            self.logger.warn(
                Some(lock.operation_id),
                "process",
                format!("Failed to relaunch Antigravity during rollback: {launch_error}"),
            );
        }
        Ok(())
    }

    fn rollback_to_source(&self, lock: &mut SwitchLock) -> Result<()> {
        for index in (0..lock.moves.len()).rev() {
            let source = lock.moves[index].source.clone();
            let destination = lock.moves[index].destination.clone();
            let appears_completed =
                lock.moves[index].completed || (!source.exists() && destination.exists());
            if appears_completed {
                if source.exists() && destination.exists() {
                    return Err(SwitcherError::Consistency(format!(
                        "Both sides of move exist: {} and {}",
                        source.display(),
                        destination.display()
                    )));
                }
                if !destination.exists() {
                    return Err(SwitcherError::Consistency(format!(
                        "Both sides of move are missing: {} and {}",
                        source.display(),
                        destination.display()
                    )));
                }
                if let Some(parent) = source.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|source_error| SwitcherError::io(parent, source_error))?;
                }
                fs::rename(&destination, &source)
                    .map_err(|source_error| SwitcherError::io(&destination, source_error))?;
                lock.moves[index].completed = false;
                self.journal().write(lock)?;
                self.logger.info(
                    Some(lock.operation_id),
                    "recovery",
                    format!(
                        "Rolled back {} -> {}",
                        destination.display(),
                        source.display()
                    ),
                );
            }
        }
        if lock.credential_backup_written {
            let credential = self.load_profile_credential(lock.from_profile_id, None)?;
            self.credentials.write_active(&credential)?;
            lock.target_credential_written = false;
            self.journal().write(lock)?;
        }

        Ok(())
    }

    pub(crate) fn verify_target(&self, credential: &[u8]) -> Result<()> {
        let active = self.credentials.read_active()?;
        if crate::CredentialStore::digest(&active) != crate::CredentialStore::digest(credential) {
            return Err(SwitcherError::Consistency(
                "Active credential failed read-back check".to_owned(),
            ));
        }
        Ok(())
    }

    pub(crate) fn preflight_active(&self) -> Result<()> {
        self.preflight_active_artifacts()?;
        if self.paths.state_db.exists() {
            validate_state_database(&self.paths.state_db)?;
        }
        Ok(())
    }

    pub(crate) fn preflight_active_artifacts(&self) -> Result<()> {
        for artifact in self
            .paths
            .artifacts()
            .into_iter()
            .filter(|artifact| artifact.required)
        {
            if !artifact.active.exists() {
                if artifact.kind == switcher_core::MoveKind::StateDatabase
                    && self.paths.state_db.with_file_name("storage.json").is_file()
                {
                    continue;
                }
                return Err(SwitcherError::MissingActiveData(artifact.active));
            }
        }
        Ok(())
    }

    pub(crate) fn repair_active_state_database_if_needed(&self, operation_id: Uuid) -> Result<()> {
        if !self.paths.state_db.exists() {
            return Ok(());
        }
        if validate_state_database(&self.paths.state_db).is_ok() {
            return Ok(());
        }
        let storage_json = self.paths.state_db.with_file_name("storage.json");
        if !storage_json.is_file() {
            return Ok(());
        }
        self.logger.warn(
            Some(operation_id),
            "recovery",
            format!(
                "Active state database is invalid; rebuilding it from {}",
                switcher_core::sanitize_path(&storage_json),
            ),
        );
        let rebuilt = self
            .paths
            .state_db
            .with_file_name(format!("state.vscdb.rebuild-{operation_id}"));
        if rebuilt.exists() {
            super::manifest::remove_path(&rebuilt)?;
        }
        let migrated = super::database::rebuild_state_database_from_json(&storage_json, &rebuilt)?;
        validate_state_database(&rebuilt)?;

        let recovery_dir = self.paths.root.join("recovery");
        fs::create_dir_all(&recovery_dir)
            .map_err(|source| SwitcherError::io(&recovery_dir, source))?;
        let backup = recovery_dir.join(format!("active-state-{operation_id}.vscdb.invalid"));
        if self.paths.state_db.exists() {
            fs::rename(&self.paths.state_db, &backup)
                .map_err(|source| SwitcherError::io(&self.paths.state_db, source))?;
        }
        if let Some(parent) = self.paths.state_db.parent() {
            fs::create_dir_all(parent)
                .map_err(|source| SwitcherError::io(parent, source))?;
        }
        fs::rename(&rebuilt, &self.paths.state_db)
            .map_err(|source| SwitcherError::io(&rebuilt, source))?;
        self.logger.info(
            Some(operation_id),
            "recovery",
            format!("Active state database rebuilt successfully, migrated_items={migrated}"),
        );
        Ok(())
    }

    pub(crate) fn merge_legacy_profile_artifacts(&self, operation_id: Uuid) -> Result<()> {
        let mut copied_files = 0_u64;
        let shared_directories = [
            ("brain", self.paths.gemini_root.join("brain")),
            (
                "conversations",
                self.paths.gemini_root.join("conversations"),
            ),
            ("annotations", self.paths.gemini_root.join("annotations")),
            (
                "html_artifacts",
                self.paths.gemini_root.join("html_artifacts"),
            ),
            ("workspaceStorage", self.paths.workspace_storage.clone()),
        ];
        let active_summaries = self.paths.gemini_root.join("agyhub_summaries_proto.pb");

        for entry in fs::read_dir(&self.paths.profiles)
            .map_err(|source| SwitcherError::io(&self.paths.profiles, source))?
        {
            let entry = entry.map_err(|source| SwitcherError::io(&self.paths.profiles, source))?;
            if !entry.path().is_dir() {
                continue;
            }
            for (relative, active) in &shared_directories {
                copied_files += super::manifest::merge_missing_files(&entry.path().join(relative), active)?;
            }

            let stored_summaries = entry.path().join("agyhub_summaries_proto.pb");
            if stored_summaries.is_file() {
                let stored_size = fs::metadata(&stored_summaries)
                    .map_err(|source| SwitcherError::io(&stored_summaries, source))?
                    .len();
                let active_size = fs::metadata(&active_summaries)
                    .map(|metadata| metadata.len())
                    .unwrap_or(0);
                if stored_size > active_size {
                    if let Some(parent) = active_summaries.parent() {
                        fs::create_dir_all(parent)
                            .map_err(|source| SwitcherError::io(parent, source))?;
                    }
                    fs::copy(&stored_summaries, &active_summaries)
                        .map_err(|source| SwitcherError::io(&stored_summaries, source))?;
                    copied_files += 1;
                }
            }
        }

        self.logger.info(
            Some(operation_id),
            "recovery",
            format!(
                "Legacy per-profile editor data merged into shared storage, copied_files={copied_files}"
            ),
        );
        Ok(())
    }

    pub(crate) fn preflight_target_identity(&self, profile_id: Uuid) -> Result<()> {
        let profile = self.paths.profile_dir(profile_id);
        let cred_path = profile.join("credentials.enc");
        if !cred_path.is_file() {
            return Err(SwitcherError::MissingActiveData(cred_path));
        }
        let metadata_json = profile.join("metadata.json");
        let metadata_enc = profile.join("metadata.enc");
        if !metadata_json.is_file() && !metadata_enc.is_file() {
            return Err(SwitcherError::MissingActiveData(metadata_json));
        }
        Ok(())
    }

}
