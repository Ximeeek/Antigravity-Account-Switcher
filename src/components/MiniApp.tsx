import { useEffect, useState, useRef, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  getAppState,
  requestSwitch,
  confirmSwitch,
  hideMiniWindow,
  resizeMiniWindow,
} from "../bridge";
import { Icon } from "./Icons";
import { t } from "../i18n";
import type { AppState, ProfileSummary } from "../types";
import { getSwitchStepLabel, getInitials } from "../utils";

export default function MiniApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [workingAction, setWorkingAction] = useState<string | null>(null);
  const mounted = useRef(true);
  const expectedSwitchTarget = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    document.documentElement.classList.add("mini-window-html");
    document.body.classList.add("mini-window-body");
    void resizeMiniWindow(140);
    return () => {
      mounted.current = false;
      document.documentElement.classList.remove("mini-window-html");
      document.body.classList.remove("mini-window-body");
    };
  }, []);

  const loadState = useCallback(async (silent = false) => {
    try {
      const next = await getAppState();
      if (mounted.current) {
        setState(next);
      }
    } catch (e) {
      console.error("Failed to load app state", e);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadState(true);
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [loadState]);

  useEffect(() => {
    const operation = state?.operation;
    const shouldPoll =
      operation?.status === "in_progress" || state?.engine_status === "busy";
    if (!shouldPoll) return undefined;
    const interval = window.setInterval(() => void loadState(true), 200);
    return () => window.clearInterval(interval);
  }, [loadState, state?.engine_status, state?.operation]);

  const handleActivate = async (profileId: string) => {
    if (!profileId || profileId === state?.active_profile_id) return;
    setWorkingAction("request-switch");
    try {
      const requested = await requestSwitch(profileId);
      if (!mounted.current) return;
      const operation = requested.operation;
      if (!operation) {
        throw new Error("Failed to create switch operation.");
      }

      expectedSwitchTarget.current = operation.to_profile_id;
      setState(requested);

      // Instantly confirm the switch without any user confirmation prompts
      setWorkingAction("confirm-switch");
      const completed = await confirmSwitch(operation.operation_id);
      if (mounted.current) {
        setState(completed);
      }
    } catch (error) {
      console.error("Activate failed:", error);
      if (mounted.current) {
        setState((current) =>
          current ? { ...current, engine_status: "ready", operation: null } : current
        );
        void loadState(true);
      }
    } finally {
      if (mounted.current) setWorkingAction(null);
    }
  };

  const handleClose = async () => {
    try {
      await hideMiniWindow();
    } catch (e) {
      console.error("Failed to hide mini window", e);
    }
  };

  const handleMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (e) {
      console.error("Failed to minimize", e);
    }
  };

  if (!state) {
    return (
      <div className="mini-window-card mini-window-loading">
        <Icon name="loader" size={16} />
      </div>
    );
  }

  const activeProfile = state.profiles.find(
    (p) => p.profile_id === state.active_profile_id
  );

  const operation = state.operation;
  const isBusy = state.engine_status === "busy" || workingAction === "confirm-switch";

  const getQuotas = (profile?: ProfileSummary) => {
    if (!profile?.quota?.quota_groups) return null;
    let weekly = null;
    let fiveHour = null;
    for (const group of profile.quota.quota_groups) {
      const w = group.buckets.find((b) => b.bucket_id === "gemini-weekly");
      if (w) weekly = w;
      const f = group.buckets.find((b) => b.bucket_id === "gemini-5h");
      if (f) fiveHour = f;
    }
    return { weekly, fiveHour };
  };

  const get5hRemainingFraction = (profile: ProfileSummary) => {
    const quotas = getQuotas(profile);
    return quotas?.fiveHour?.remaining_fraction ?? 1.0;
  };

  const getProfileQuotaInfo = (p: ProfileSummary) => {
    const quotas = getQuotas(p);
    let pct = 100;
    let isWeeklyWarning = false;

    if (quotas) {
      const weeklyPct = quotas.weekly ? Math.round(quotas.weekly.remaining_fraction * 100) : 100;
      const fiveHourPct = quotas.fiveHour ? Math.round(quotas.fiveHour.remaining_fraction * 100) : 100;

      if (weeklyPct < 10) {
        pct = weeklyPct;
        isWeeklyWarning = true;
      } else {
        pct = fiveHourPct;
      }
    }

    const tone = pct < 20 ? "danger" : pct < 50 ? "warning" : "success";

    return { pct, isWeeklyWarning, tone };
  };

  const otherProfilesSorted = state.profiles
    .filter((p) => p.profile_id !== state.active_profile_id)
    .sort((a, b) => get5hRemainingFraction(b) - get5hRemainingFraction(a));

  const sortedProfiles = activeProfile
    ? [activeProfile, ...otherProfilesSorted]
    : otherProfilesSorted;

  return (
    <div className="mini-window-card" data-tauri-drag-region>
      {isBusy && operation ? (
        <div className="mini-progress-flow" data-tauri-drag-region>
          <div className="mini-progress-flow__status" data-tauri-drag-region>
            <Icon name="loader" size={16} />
            <div className="mini-progress-flow__text" data-tauri-drag-region>
              <div className="mini-progress-flow__title" data-tauri-drag-region>
                {t("mini_switching")}
              </div>
              <div className="mini-progress-flow__step" data-tauri-drag-region>
                {getSwitchStepLabel(operation.current_step)}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mini-container" data-tauri-drag-region>
          <header className="mini-header" data-tauri-drag-region>
            <span className="mini-header-title" data-tauri-drag-region>AAC / MINI</span>
            <div className="mini-header-controls">
              <span className={`mini-status-dot mini-status-dot--${state.engine_status}`} />
              <div className="mini-control-buttons">
                <button
                  className="mini-control-button"
                  onClick={handleMinimize}
                  title={t("minimize")}
                  aria-label={t("minimize")}
                >
                  <Icon name="minus" size={12} />
                </button>
                <button
                  className="mini-control-button mini-control-button--close"
                  onClick={handleClose}
                  title={t("close_mini")}
                  aria-label={t("close_mini")}
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            </div>
          </header>
          
          <div className="mini-profile-list">
            {sortedProfiles.map((p) => {
              const isActive = p.profile_id === state.active_profile_id;
              const { pct, isWeeklyWarning, tone } = getProfileQuotaInfo(p);
              
              return (
                <div
                  key={p.profile_id}
                  className={`mini-profile-row ${isActive ? "mini-profile-row--active" : ""} ${isBusy ? "mini-profile-row--disabled" : ""}`}
                  onClick={() => !isActive && !isBusy && handleActivate(p.profile_id)}
                >
                  <div className="mini-profile-avatar">
                    {getInitials(p.display_name)}
                  </div>
                  <div className="mini-profile-info">
                    <span className="mini-profile-name">{p.display_name}</span>
                    {isActive && (
                      <span className="mini-profile-badge">{t("used_badge")}</span>
                    )}
                  </div>
                  <div className={`mini-profile-quota mini-profile-quota--${tone}`}>
                    <span className="quota-percent">{pct}%</span>
                    {isWeeklyWarning && <span className="quota-period">7d</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
