/**
 * Smart Switch automation.
 * Periodically checks Gemini usage levels and automatically swaps active accounts when limits are exhausted.
 * Main exports: impl SwitcherService smart switch methods
 */

use rusqlite::Connection;
use uuid::Uuid;

use crate::SwitcherService;
use switcher_core::{Result, ProfileQuotaView, TokenStatus};

fn get_bucket_remaining_fraction(quota: &ProfileQuotaView, bucket_id: &str) -> Option<f64> {
    for group in &quota.quota_groups {
        if let Some(bucket) = group.buckets.iter().find(|b| b.bucket_id == bucket_id) {
            return Some(bucket.remaining_fraction);
        }
    }
    None
}

impl SwitcherService {
    pub fn is_agent_working(&self) -> bool {
        let path = &self.paths.state_db;
        let conn = match Connection::open(path) {
            Ok(c) => c,
            Err(_) => return false,
        };
        let query = "SELECT value FROM ItemTable WHERE key = 'antigravity.agent.working'";
        let working_str: String = match conn.query_row(query, [], |row| row.get(0)) {
            Ok(val) => val,
            Err(_) => return false,
        };
        working_str.trim().to_lowercase() == "true"
    }

    pub async fn check_and_perform_smart_switch(&self) -> Result<()> {
        if !self.config.read().smart_switch_enabled {
            return Ok(());
        }
        if self.is_agent_working() {
            self.logger.info(None, "smart_switch", "Automated switch skipped: Agent is actively working");
            return Ok(());
        }
        if self.journal().exists() {
            return Ok(());
        }
        if self.progress.read().is_some() {
            return Ok(());
        }

        let active_profile_id = match self.config.read().active_profile_id {
            Some(id) => id,
            None => return Ok(()),
        };

        let profiles = self.list_profiles_live(Some(active_profile_id)).await?;
        let active_profile = match profiles.iter().find(|p| p.is_active) {
            Some(p) => p,
            None => return Ok(()),
        };

        let active_quota = match active_profile.quota {
            Some(ref q) => q,
            None => return Ok(()),
        };

        let rem_5h = get_bucket_remaining_fraction(active_quota, "gemini-5h").unwrap_or(1.0);
        let rem_weekly = get_bucket_remaining_fraction(active_quota, "gemini-weekly").unwrap_or(1.0);

        if rem_5h >= 0.10 && rem_weekly >= 0.05 {
            return Ok(());
        }

        self.logger.warn(
            None,
            "smart_switch",
            format!(
                "Active profile limits exhausted: 5h={:.1}%, weekly={:.1}%. Finding alternative profile...",
                rem_5h * 100.0,
                rem_weekly * 100.0
            ),
        );

        let mut candidate: Option<(Uuid, f64, f64)> = None;

        for profile in &profiles {
            if profile.is_active || profile.token_status != TokenStatus::Valid {
                continue;
            }
            if let Some(ref q) = profile.quota {
                let cand_5h = get_bucket_remaining_fraction(q, "gemini-5h").unwrap_or(0.0);
                let cand_weekly = get_bucket_remaining_fraction(q, "gemini-weekly").unwrap_or(0.0);
                if cand_5h >= 0.15 && cand_weekly >= 0.08 {
                    if let Some((_, best_5h, _)) = candidate {
                        if cand_5h > best_5h {
                            candidate = Some((profile.metadata.profile_id, cand_5h, cand_weekly));
                        }
                    } else {
                        candidate = Some((profile.metadata.profile_id, cand_5h, cand_weekly));
                    }
                }
            }
        }

        if let Some((target_id, cand_5h, _)) = candidate {
            self.logger.warn(
                None,
                "smart_switch",
                format!(
                    "Triggering smart switch to profile {} (available 5h={:.1}%)",
                    target_id,
                    cand_5h * 100.0
                ),
            );
            match self.request_switch(target_id, None) {
                Ok(req) => {

                    if let Err(e) = self.confirm_switch(req.operation_id) {
                        self.logger.error(None, "smart_switch", format!("Smart switch confirm failed: {}", e));
                    }
                }
                Err(e) => {
                    self.logger.error(None, "smart_switch", format!("Smart switch request failed: {}", e));
                }
            }
        } else {
            self.logger.warn(None, "smart_switch", "No alternative profiles with sufficient quotas found.");
        }

        Ok(())
    }

    #[cfg(debug_assertions)]
    pub async fn force_smart_switch_bypass_quota(&self) -> Result<()> {
        let active_profile_id = match self.config.read().active_profile_id {
            Some(id) => id,
            None => return Err(switcher_core::SwitcherError::NoActiveProfile),
        };

        let profiles = self.list_profiles_live(Some(active_profile_id)).await?;
        
        let mut candidate: Option<(Uuid, f64, f64)> = None;
        let mut fallback_candidate: Option<Uuid> = None;

        for profile in &profiles {
            if profile.is_active || profile.token_status != TokenStatus::Valid {
                continue;
            }
            if fallback_candidate.is_none() {
                fallback_candidate = Some(profile.metadata.profile_id);
            }
            if let Some(ref q) = profile.quota {
                let cand_5h = get_bucket_remaining_fraction(q, "gemini-5h").unwrap_or(0.0);
                let cand_weekly = get_bucket_remaining_fraction(q, "gemini-weekly").unwrap_or(0.0);
                if cand_5h >= 0.15 && cand_weekly >= 0.08 {
                    if let Some((_, best_5h, _)) = candidate {
                        if cand_5h > best_5h {
                            candidate = Some((profile.metadata.profile_id, cand_5h, cand_weekly));
                        }
                    } else {
                        candidate = Some((profile.metadata.profile_id, cand_5h, cand_weekly));
                    }
                }
            }
        }

        let target_id = if let Some((id, _, _)) = candidate {
            id
        } else if let Some(id) = fallback_candidate {
            id
        } else {
            return Err(switcher_core::SwitcherError::Message("No alternative valid profiles found to switch to".to_string()));
        };

        self.logger.warn(
            None,
            "smart_switch",
            format!("Forcing smart switch to profile {} (bypassing quota checks)", target_id),
        );

        match self.request_switch(target_id, None) {
            Ok(req) => {

                let op_id = req.operation_id;
                if let Err(e) = self.confirm_switch(op_id) {
                    self.logger.error(None, "smart_switch", format!("Smart switch confirm failed: {}", e));
                    return Err(e);
                }
            }
            Err(e) => {
                self.logger.error(None, "smart_switch", format!("Smart switch request failed: {}", e));
                return Err(e);
            }
        }

        Ok(())
    }
}
