import { useEffect, useState, useRef, useCallback } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import {
  getAppState,
  requestSwitch,
  confirmSwitch,
  cancelSwitch,
  hideMiniWindow,
} from "../bridge";
import { Icon, AppMark } from "./Icons";
import { t } from "../i18n";
import type { AppState, ProfileSummary, SwitchOperation } from "../types";
import { getSwitchStepLabel } from "../utils";

function CustomSelect({
  options,
  value,
  onChange,
  disabled,
}: {
  options: ProfileSummary[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.profile_id === value);

  // Resize window on open/close
  useEffect(() => {
    const resizeWindow = async () => {
      try {
        const appWindow = getCurrentWindow();
        if (isOpen) {
          await appWindow.setSize(new LogicalSize(320, 220));
        } else {
          await appWindow.setSize(new LogicalSize(320, 72));
        }
      } catch (e) {
        console.error("Failed to resize window", e);
      }
    };
    void resizeWindow();
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen]);

  const handleSelect = (id: string) => {
    onChange(id);
    setIsOpen(false);
  };

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

  return (
    <div
      className={`custom-select-container ${disabled ? "custom-select--disabled" : ""}`}
      ref={containerRef}
    >
      <button
        type="button"
        className={`custom-select-trigger ${isOpen ? "custom-select-trigger--open" : ""}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span className="custom-select-trigger__text">
          {selectedOption ? selectedOption.display_name : t("no_active_account")}
        </span>
        <Icon name="chevron-down" size={13} className="custom-select-trigger__arrow" />
      </button>

      {isOpen && (
        <div className="custom-select-options">
          {options.map((p) => {
            const quotas = getQuotas(p);
            return (
              <button
                key={p.profile_id}
                type="button"
                className={`custom-select-option ${p.profile_id === value ? "custom-select-option--active" : ""}`}
                onClick={() => handleSelect(p.profile_id)}
              >
                <span className="custom-select-option__name">{p.display_name}</span>
                <div className="custom-select-option__badges">
                  {quotas?.fiveHour && (
                    <span
                      className={`mini-badge mini-badge--${
                        Math.round(quotas.fiveHour.remaining_fraction * 100) < 20
                          ? "danger"
                          : Math.round(quotas.fiveHour.remaining_fraction * 100) < 50
                          ? "warning"
                          : "success"
                      }`}
                    >
                      <span className="mini-badge__label">{t("quota_5h_label")}</span>
                      <span>{Math.round(quotas.fiveHour.remaining_fraction * 100)}%</span>
                    </span>
                  )}
                  {quotas?.weekly && (
                    <span
                      className={`mini-badge mini-badge--${
                        Math.round(quotas.weekly.remaining_fraction * 100) < 20
                          ? "danger"
                          : Math.round(quotas.weekly.remaining_fraction * 100) < 50
                          ? "warning"
                          : "success"
                      }`}
                    >
                      <span className="mini-badge__label">{t("quota_weekly_label")}</span>
                      <span>{Math.round(quotas.weekly.remaining_fraction * 100)}%</span>
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function MiniApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [workingAction, setWorkingAction] = useState<string | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<SwitchOperation | null>(null);
  const mounted = useRef(true);
  const expectedSwitchTarget = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    document.documentElement.classList.add("mini-window-html");
    document.body.classList.add("mini-window-body");
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
      setPendingSwitch(operation);
      setState(requested);

      if (operation.status === "in_progress") {
        setWorkingAction("confirm-switch");
        const completed = await confirmSwitch(operation.operation_id);
        if (mounted.current) {
          setPendingSwitch(null);
          setState(completed);
        }
      }
    } catch (error) {
      console.error("Activate failed:", error);
      if (mounted.current) {
        setPendingSwitch(null);
        setState((current) =>
          current ? { ...current, engine_status: "ready", operation: null } : current
        );
        void loadState(true);
      }
    } finally {
      if (mounted.current) setWorkingAction(null);
    }
  };

  const handleConfirmSwitch = async () => {
    const operationId = pendingSwitch?.operation_id ?? state?.operation?.operation_id;
    if (!operationId) return;
    setPendingSwitch((current) =>
      current ? { ...current, status: "in_progress", current_step: 1 } : current
    );
    setState((current) =>
      current?.operation
        ? {
            ...current,
            engine_status: "busy",
            operation: {
              ...current.operation,
              current_step: Math.max(1, current.operation.current_step),
              status: "in_progress",
            },
          }
        : current
    );
    setWorkingAction("confirm-switch");
    try {
      const completed = await confirmSwitch(operationId);
      if (mounted.current) {
        setPendingSwitch(null);
        setState(completed);
      }
    } catch (e) {
      console.error("Confirm switch failed:", e);
      if (mounted.current) {
        setPendingSwitch(null);
        void loadState(true);
      }
    } finally {
      if (mounted.current) setWorkingAction(null);
    }
  };

  const handleCancelSwitch = async () => {
    const operationId = pendingSwitch?.operation_id ?? state?.operation?.operation_id;
    setWorkingAction("cancel-switch");
    try {
      const next = await cancelSwitch(operationId);
      if (mounted.current) {
        setPendingSwitch(null);
        setState(next);
      }
    } catch (e) {
      console.error("Cancel switch failed:", e);
      if (mounted.current) {
        setPendingSwitch(null);
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

  const operation = state.operation ?? pendingSwitch;
  const isBusy = state.engine_status === "busy" || workingAction === "confirm-switch" || workingAction === "cancel-switch";
  const isAwaiting = operation?.status === "awaiting_confirmation";

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

  const activeQuotas = getQuotas(activeProfile);

  return (
    <div className="mini-window-card" data-tauri-drag-region>
      {isAwaiting ? (
        <div className="mini-confirm-flow" data-tauri-drag-region>
          <div className="mini-confirm-flow__title" data-tauri-drag-region>
            <Icon name="alert" size={14} className="mini-warning-icon" />
            <span>{t("mini_confirm_title")}</span>
          </div>
          <div className="mini-confirm-flow__actions">
            <button
              className="mini-btn mini-btn--primary"
              onClick={handleConfirmSwitch}
              disabled={workingAction !== null}
            >
              {workingAction === "confirm-switch" ? (
                <Icon name="loader" size={12} />
              ) : null}
              <span>{t("mini_confirm_btn")}</span>
            </button>
            <button
              className="mini-btn mini-btn--secondary"
              onClick={handleCancelSwitch}
              disabled={workingAction !== null}
            >
              <span>{t("mini_cancel_btn")}</span>
            </button>
          </div>
        </div>
      ) : isBusy && operation ? (
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
        <div className="mini-main-flow" data-tauri-drag-region>
          <div className="mini-left" data-tauri-drag-region>
            <div className="mini-logo-container" data-tauri-drag-region>
              <AppMark size={24} />
            </div>
            <div className="mini-info" data-tauri-drag-region>
              <CustomSelect
                options={state.profiles}
                value={state.active_profile_id || ""}
                onChange={handleActivate}
                disabled={isBusy}
              />
              <div className="mini-badges" data-tauri-drag-region>
                {activeQuotas?.fiveHour && (
                  <div
                    className={`mini-badge mini-badge--${
                      Math.round(activeQuotas.fiveHour.remaining_fraction * 100) < 20
                        ? "danger"
                        : Math.round(activeQuotas.fiveHour.remaining_fraction * 100) < 50
                        ? "warning"
                        : "success"
                    }`}
                    title={`${activeQuotas.fiveHour.display_name}: ${Math.round(activeQuotas.fiveHour.remaining_fraction * 100)}%`}
                  >
                    <span className="mini-badge__label">{t("quota_5h_label")}</span>
                    <span>
                      {Math.round(activeQuotas.fiveHour.remaining_fraction * 100)}%
                    </span>
                  </div>
                )}
                {activeQuotas?.weekly && (
                  <div
                    className={`mini-badge mini-badge--${
                      Math.round(activeQuotas.weekly.remaining_fraction * 100) < 20
                        ? "danger"
                        : Math.round(activeQuotas.weekly.remaining_fraction * 100) < 50
                        ? "warning"
                        : "success"
                    }`}
                    title={`${activeQuotas.weekly.display_name}: ${Math.round(activeQuotas.weekly.remaining_fraction * 100)}%`}
                  >
                    <span className="mini-badge__label">{t("quota_weekly_label")}</span>
                    <span>
                      {Math.round(activeQuotas.weekly.remaining_fraction * 100)}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mini-right">
            <button
              className="mini-control-button"
              onClick={handleMinimize}
              title={t("minimize")}
              aria-label={t("minimize")}
            >
              <Icon name="minus" size={13} />
            </button>
            <button
              className="mini-control-button mini-control-button--close"
              onClick={handleClose}
              title={t("close_mini")}
              aria-label={t("close_mini")}
            >
              <Icon name="close" size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
