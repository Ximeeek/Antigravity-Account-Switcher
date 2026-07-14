import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  addCurrentProfile,
  cancelSwitch,
  confirmSwitch,
  copyDiagnostics,
  deleteProfile,
  getAppState,
  isDemoMode,
  recoveryResume,
  recoveryRollback,
  requestSwitch,
  setDemoScenario,
  updateSettings,
  startOauthLogin,
  cancelOauthLogin,
  showMiniWindow,
  wipeAppData,
  uninstallApp,
  lockProfile,
  unlockProfile,
  removeProfileLock,
} from "./bridge";


import MiniApp from "./components/MiniApp";

import { Dashboard } from "./components/Dashboard";
import { Header, type AppView } from "./components/Header";
import { TitleBar } from "./components/TitleBar";
import { Icon } from "./components/Icons";
import {
  AddProfileModal,
  DeleteProfileModal,
  AboutModal,
  LockProfileModal,
  UnlockProfileModal,
} from "./components/ProfileModals";

import { Settings } from "./components/Settings";
import { DevTools } from "./components/DevTools";
import { t, getLanguage, setLanguage, type Language } from "./i18n";
import {
  RecoveryScreen,
  SwitchConfirmModal,
  SwitchProgressModal,
} from "./components/SwitchFlow";
import type {
  AddProfileInput,
  AppSettings,
  AppState,
  DemoScenario,
  ProfileSummary,
  SwitchOperation,
} from "./types";

import LoadingScreen from "./components/LoadingScreen";
import LoadError from "./components/LoadError";
import Toast, { type Notice } from "./components/Toast";

const errorMessage = (error: unknown): string => {
  let message = "";
  if (error instanceof Error && error.message) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  } else if (typeof error === "object" && error !== null && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === "string") message = msg;
  }

  if (!message) return t("unexpected_error");

  // Localize known backend errors
  if (message.includes("Switching operation is already in progress")) {
    return t("err_operation_in_progress");
  }
  if (message.includes("Target profile is already active")) {
    return t("err_profile_already_active");
  }
  if (message.includes("No active profile; import the current session first")) {
    return t("err_no_active_profile");
  }
  if (message.includes("Recovery of previous operation is required")) {
    return t("err_recovery_required");
  }
  if (message.includes("Antigravity is still running and requires confirmation to close")) {
    return t("err_confirmation_required");
  }
  if (message.includes("Cannot read Antigravity credentials")) {
    return t("err_credential_unavailable");
  }
  if (message.includes("Missing required active session data")) {
    const match = message.match(/Missing required active session data:\s*(.+)/);
    const path = match ? match[1] : "";
    return t("err_missing_active_data", { path });
  }
  if (message.includes("Operation destination already exists")) {
    const match = message.match(/Operation destination already exists:\s*(.+)/);
    const path = match ? match[1] : "";
    return t("err_destination_exists", { path });
  }
  if (message.includes("Antigravity files are still locked")) {
    const match = message.match(/Antigravity files are still locked:\s*(.+)/);
    const path = match ? match[1] : "";
    return t("err_files_locked", { path });
  }
  if (message.includes("Failed to close Antigravity processes")) {
    const match = message.match(/Failed to close Antigravity processes:\s*(.+)/);
    const err = match ? match[1] : "";
    return t("err_process_shutdown", { error: err });
  }
  if (message.includes("Paths are not on the same volume")) {
    return t("err_cross_volume");
  }
  if (message.includes("No switch operation to recover")) {
    return t("err_no_op_to_recover");
  }
  if (message.includes("Missing access_token in response")) {
    return t("err_oauth_token");
  }
  if (message.includes("Missing id_token in response")) {
    return t("err_oauth_id");
  }
  if (message.includes("is already registered. Please delete the existing profile first")) {
    const match = message.match(/Account\s+(.+)\s+is already registered/);
    const email = match ? match[1] : "";
    return t("err_duplicate_account", { email });
  }

  return message;
};



export default function App() {
  const [windowLabel, setWindowLabel] = useState<string>("main");

  useEffect(() => {
    try {
      setWindowLabel(getCurrentWindow().label);
    } catch (e) {
      console.warn("Failed to get window label", e);
    }
  }, []);

  const [state, setState] = useState<AppState | null>(null);
  const [view, setView] = useState<AppView>("dashboard");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workingAction, setWorkingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [addProfileOpen, setAddProfileOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutTab, setAboutTab] = useState<"about" | "specs" | "guide">("about");
  const [deleteTarget, setDeleteTarget] = useState<ProfileSummary | null>(null);
  const [lockTarget, setLockTarget] = useState<ProfileSummary | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<ProfileSummary | null>(null);
  const [unlockMode, setUnlockMode] = useState<"unlock" | "remove_lock" | "activate">("unlock");


  const handleOpenAbout = (tab: "about" | "specs" | "guide" = "about") => {
    setAboutTab(tab);
    setAboutOpen(true);
  };
  const [pendingSwitch, setPendingSwitch] = useState<SwitchOperation | null>(null);
  const [lang, setLang] = useState<Language>(getLanguage);

  const handleLanguageChange = (newLang: Language) => {
    setLanguage(newLang);
    setLang(newLang);
  };
  const [demoScenario, setDemoScenarioState] = useState<DemoScenario>(() => {
    if (typeof window === "undefined") return "dashboard";
    const requested = new URLSearchParams(window.location.search).get("demo");
    return requested === "empty" ||
      requested === "recovery" ||
      requested === "progress" ||
      requested === "error"
      ? requested
      : "dashboard";
  });
  const mounted = useRef(true);
  const expectedSwitchTarget = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadState = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const next = await getAppState();
      if (!mounted.current) return;
      setState(next);
      setLoadError(null);
    } catch (error) {
      if (!mounted.current) return;
      if (!silent) setLoadError(errorMessage(error));
    } finally {
      if (mounted.current && !silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  useEffect(() => {
    // Poll the app state every 5 seconds when idle to keep quotas and status fresh
    const interval = window.setInterval(() => {
      // Only poll if the document is visible to save resources and API rate limits!
      if (document.visibilityState === "visible") {
        void loadState(true);
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [loadState]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(null), 5200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const operation = state?.operation;
    const shouldPoll =
      operation?.status === "in_progress" || state?.engine_status === "busy";
    if (!shouldPoll) return undefined;
    const interval = window.setInterval(() => void loadState(true), 50);
    return () => window.clearInterval(interval);
  }, [loadState, state?.engine_status, state?.operation]);

  useEffect(() => {
    const expectedTarget = expectedSwitchTarget.current;
    if (
      expectedTarget &&
      state?.active_profile_id === expectedTarget &&
      state.engine_status === "ready"
    ) {
      expectedSwitchTarget.current = null;
      setNotice({ tone: "success", message: t("toast_switch_success") });
    }
  }, [state?.active_profile_id, state?.engine_status]);

  const performStateAction = useCallback(
    async (
      actionName: string,
      action: () => Promise<AppState>,
      successMessage?: string,
    ): Promise<boolean> => {
      setWorkingAction(actionName);
      try {
        const next = await action();
        if (!mounted.current) return true;
        setState(next);
        setLoadError(null);
        if (successMessage) setNotice({ tone: "success", message: successMessage });
        return true;
      } catch (error) {
        if (mounted.current) {
          setNotice({ tone: "danger", message: errorMessage(error) });
        }
        return false;
      } finally {
        if (mounted.current) setWorkingAction(null);
      }
    },
    [],
  );

  const handleActivate = async (profile: ProfileSummary, password?: string) => {
    setWorkingAction("request-switch");
    try {
      const requested = await requestSwitch(profile.profile_id, password);

      if (!mounted.current) return;
      const operation = requested.operation;
      if (!operation) {
        throw new Error(t("err_switch_create_failed"));
      }
      expectedSwitchTarget.current = operation.to_profile_id;
      setPendingSwitch(operation);
      setState(requested);
      setLoadError(null);

      if (operation.status === "in_progress") {
        setWorkingAction("confirm-switch");
        const completed = await confirmSwitch(operation.operation_id);
        if (mounted.current) {
          setPendingSwitch(null);
          setState(completed);
        }
      }
    } catch (error) {
      if (mounted.current) {
        expectedSwitchTarget.current = null;
        setPendingSwitch(null);
        setState((current) =>
          current
            ? { ...current, engine_status: "ready", operation: null }
            : current,
        );
        setNotice({ tone: "danger", message: errorMessage(error) });
        void loadState(true);
      }
    } finally {
      if (mounted.current) setWorkingAction(null);
    }
  };

  const handleLockConfirm = async (profile: ProfileSummary, password: string) => {
    setWorkingAction("lock-profile");
    try {
      const updated = await lockProfile(profile.profile_id, password);
      setState(updated);
      setLockTarget(null);
      setNotice({ tone: "success", message: t("notice_profile_locked") });
    } catch (error) {
      setNotice({ tone: "danger", message: errorMessage(error) });
    } finally {
      setWorkingAction(null);
    }
  };

  const handleUnlockConfirm = async (profile: ProfileSummary, password: string) => {
    setWorkingAction("unlock-profile");
    try {
      if (unlockMode === "activate") {
        setUnlockTarget(null);
        await handleActivate(profile, password);
      } else if (unlockMode === "remove_lock") {
        const updated = await removeProfileLock(profile.profile_id, password);
        setState(updated);
        setUnlockTarget(null);
        setNotice({ tone: "success", message: t("notice_lock_removed") });
      } else {
        const updated = await unlockProfile(profile.profile_id, password);
        setState(updated);
        setUnlockTarget(null);
        setNotice({ tone: "success", message: t("notice_profile_unlocked") });
      }
    } catch (error) {
      throw error;

    } finally {
      setWorkingAction(null);
    }
  };


  const handleConfirmSwitch = async () => {
    const operationId = pendingSwitch?.operation_id ?? state?.operation?.operation_id;
    if (!operationId) {
      setNotice({ tone: "danger", message: t("toast_switch_no_op") });
      return;
    }
    setPendingSwitch((current) =>
      current ? { ...current, status: "in_progress", current_step: 1 } : current,
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
        : current,
    );
    const succeeded = await performStateAction(
      "confirm-switch",
      () => confirmSwitch(operationId),
    );
    if (mounted.current) setPendingSwitch(null);
    if (!succeeded) {
      expectedSwitchTarget.current = null;
      void loadState(true);
    }
  };

  const handleCancelSwitch = async () => {
    const operationId = pendingSwitch?.operation_id ?? state?.operation?.operation_id;
    const succeeded = await performStateAction(
      "cancel-switch",
      () => cancelSwitch(operationId),
    );
    if (mounted.current) setPendingSwitch(null);
    expectedSwitchTarget.current = null;
    if (!succeeded) void loadState(true);
  };

  const handleAddProfile = async (displayName: string, autoActivate: boolean) => {
    const succeeded = await performStateAction(
      "add-profile",
      () => startOauthLogin(displayName, lang, autoActivate),
      t("toast_account_saved", { name: displayName }),
    );
    if (succeeded) setAddProfileOpen(false);
  };

  const handleCloseAddProfile = async () => {
    if (workingAction === "add-profile") {
      try {
        await cancelOauthLogin();
      } catch (err) {
        console.error("Failed to cancel OAuth login:", err);
      }
      void loadState(true);
    }
    setAddProfileOpen(false);
  };

  const handleDeleteProfile = async (profile: ProfileSummary) => {
    const succeeded = await performStateAction(
      "delete-profile",
      () => deleteProfile(profile.profile_id),
      t("toast_account_deleted", { name: profile.display_name }),
    );
    if (succeeded) setDeleteTarget(null);
  };

  const handleSaveSettings = async (settings: AppSettings) => {
    await performStateAction(
      "settings",
      () => updateSettings(settings),
    );
  };

  const handleToggleSmartSwitch = async () => {
    if (!state) return;
    await handleSaveSettings({
      ...state.settings,
      smart_switch_enabled: !state.settings.smart_switch_enabled,
    });
  };

  const handleSwitchLevelChange = async (level: number) => {
    if (!state) return;
    await handleSaveSettings({
      ...state.settings,
      switch_level: level,
    });
  };



  const handleCopyDiagnostics = async () => {
    setWorkingAction("diagnostics");
    try {
      await copyDiagnostics();
      if (mounted.current) {
        setNotice({ tone: "success", message: t("diagnostics_copied") });
      }
    } catch (error) {
      if (mounted.current) setNotice({ tone: "danger", message: errorMessage(error) });
    } finally {
      if (mounted.current) setWorkingAction(null);
    }
  };

  const handleWipeData = async () => {
    setWorkingAction("wipe");
    try {
      console.log("Starting full data wipe...");
      await wipeAppData();
      console.log("Wipe command sent successfully.");
    } catch (error) {
      console.error("Failed to wipe application data:", error);
      if (mounted.current) {
        setNotice({ tone: "danger", message: errorMessage(error) });
        setWorkingAction(null);
      }
    }
  };

  const handleUninstallApp = async () => {
    setWorkingAction("uninstall");
    try {
      console.log("Starting application uninstallation...");
      await uninstallApp();
      console.log("Uninstall command sent successfully.");
    } catch (error) {
      console.error("Failed to uninstall application:", error);
      if (mounted.current) {
        setNotice({ tone: "danger", message: errorMessage(error) });
        setWorkingAction(null);
      }
    }
  };

  const handleRecoveryResume = async () => {
    await performStateAction(
      "recovery-resume",
      recoveryResume,
      t("recovery_completed"),
    );
  };

  const handleRecoveryRollback = async () => {
    await performStateAction(
      "recovery-rollback",
      recoveryRollback,
      t("rollback_completed"),
    );
  };

  const handleDemoScenario = (scenario: DemoScenario) => {
    setDemoScenarioState(scenario);
    setState(setDemoScenario(scenario));
    setView("dashboard");
    setNotice(null);
    setAddProfileOpen(false);
    setDeleteTarget(null);
  };

  if (windowLabel === "mini") {
    return <MiniApp />;
  }

  if (loading) {
    return (
      <div className="app-shell" style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <TitleBar />
        <LoadingScreen />
      </div>
    );
  }

  if (loadError && !state) {
    return (
      <div className="app-shell" style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <TitleBar />
        <LoadError message={loadError} onRetry={() => void loadState()} />
      </div>
    );
  }

  if (!state) return null;

  if (state.recovery?.required) {
    return (
      <div className="app-shell" style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <TitleBar />
        <RecoveryScreen
          onCopyDiagnostics={() => void handleCopyDiagnostics()}
          onResume={() => void handleRecoveryResume()}
          onRollback={() => void handleRecoveryRollback()}
          state={state}
          workingAction={workingAction}
        />
        {notice ? <Toast notice={notice} onClose={() => setNotice(null)} /> : null}
      </div>
    );
  }

  const switchBusy = Boolean(workingAction) || state.engine_status === "busy";
  const activeProfile = state.profiles.find(
    (p) => p.profile_id === state.active_profile_id
  );
  const isAppLocked = state.isAppLocked;

  return (
    <div className="app-shell" style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <TitleBar />
      <Header
        demoMode={isDemoMode}
        demoScenario={demoScenario}
        engineStatus={state.engine_status}
        onDemoScenarioChange={handleDemoScenario}
        onViewChange={setView}
        onBrandClick={() => handleOpenAbout("about")}
        onOpenMini={() => {
          showMiniWindow().catch((err) => console.error("Failed to open mini window", err));
        }}
        view={view}
      />

      <main className="app-main" id="main-content">
        {isAppLocked ? (
          <div className="lock-screen-container" style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            flex: 1,
            padding: "40px 20px",
            animation: "fadeIn 0.3s ease",
          }}>
            <div className="lock-screen-card" style={{
              background: "var(--surface-overlay)",
              border: "1px solid var(--border)",
              borderRadius: "16px",
              padding: "32px",
              maxWidth: "400px",
              width: "100%",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
              backdropFilter: "blur(8px)",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}>
              <div style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                background: "rgba(234, 67, 53, 0.1)",
                color: "var(--danger)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto",
              }}>
                <Icon name="lock" size={32} />
              </div>
              <div>
                <h2 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "8px" }}>
                  {t("app_locked_title")}
                </h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: "1.4" }}>
                  {t("app_locked_desc")}
                </p>

              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const pwdInput = form.elements.namedItem("pwd") as HTMLInputElement;
                const errorEl = form.querySelector(".field-error") as HTMLParagraphElement;
                const errorSpan = errorEl?.querySelector("span");
                if (errorSpan) errorSpan.textContent = "";
                if (errorEl) errorEl.style.display = "none";
                setWorkingAction("unlock-active");
                try {
                  const updated = await unlockProfile("", pwdInput.value);
                  setState(updated);

                } catch (err: any) {
                  if (errorEl && errorSpan) {
                    errorSpan.textContent = err.message || String(err);
                    errorEl.style.display = "flex";
                  }
                } finally {
                  setWorkingAction(null);
                }
              }} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <label className="field" style={{ textAlign: "left" }}>
                  <span className="field__label">{t("unlock_modal_pwd_label")}</span>
                  <input
                    disabled={workingAction === "unlock-active"}
                    name="pwd"
                    required
                    type="password"
                    autoFocus
                  />
                </label>

                <p className="field-error" style={{ display: "none", alignItems: "center", gap: "6px", margin: 0 }} role="alert">
                  <Icon name="error" size={16} />
                  <span></span>
                </p>

                <button
                  className="button button--primary button--full"
                  disabled={workingAction === "unlock-active"}
                  type="submit"
                >
                  <Icon name={workingAction === "unlock-active" ? "loader" : "unlock"} size={16} />
                  <span>{workingAction === "unlock-active" ? t("unlock_modal_submitting") : t("unlock_modal_submit")}</span>
                </button>
              </form>
            </div>
          </div>
        ) : (
          <>
            {state.last_error ? (

          <div className="inline-notice inline-notice--danger" role="alert">
            <Icon name="error" size={19} />
            <div>
              <strong>{t("app_requires_attention")}</strong>
              <p>{state.last_error}</p>
            </div>
            <button
              aria-label={t("refresh_app_state")}
              className="button button--ghost button--small"
              onClick={() => void loadState(true)}
              type="button"
            >
              <Icon name="refresh" size={15} />
              <span>{t("refresh")}</span>
            </button>
          </div>
        ) : null}

        {view === "dashboard" ? (
          <div className="fade-in-slide" key="dashboard">
            {!state.settings.antigravity_path.trim() ? (
              <div className="inline-notice inline-notice--warning" role="alert" style={{ marginBottom: "20px" }}>
                <Icon name="alert" size={19} />
                <div style={{ flex: 1 }}>
                  <strong>{t("antigravity_not_detected_title")}</strong>
                  <p>{t("antigravity_not_detected_desc")}</p>
                </div>
                <button
                  className="button button--secondary button--small"
                  onClick={() => setView("settings")}
                  type="button"
                >
                  <span>{t("antigravity_not_detected_btn")}</span>
                </button>
              </div>
            ) : null}
            <Dashboard
              busy={switchBusy}
              onActivate={(profile) => void handleActivate(profile)}
              onAdd={() => setAddProfileOpen(true)}
              onDelete={setDeleteTarget}
              state={state}
              onToggleSmartSwitch={handleToggleSmartSwitch}
              onSwitchLevelChange={handleSwitchLevelChange}
              onOpenGuide={() => handleOpenAbout("guide")}
            />

          </div>
        ) : view === "settings" ? (
          <div className="fade-in-slide" key="settings">
            <Settings
              onCopyDiagnostics={handleCopyDiagnostics}
              onSave={handleSaveSettings}
              onLanguageChange={handleLanguageChange}
              onWipeData={handleWipeData}
              onUninstallApp={handleUninstallApp}
              state={state}
              workingAction={workingAction}
              onLockProfile={(profile: ProfileSummary) => setLockTarget(profile)}
              onUnlockProfile={(profile: ProfileSummary) => {
                setUnlockTarget(profile);
                setUnlockMode("unlock");
              }}
              onRemoveProfileLock={(profile: ProfileSummary) => {
                setUnlockTarget(profile);
                setUnlockMode("remove_lock");
              }}
            />

          </div>
        ) : view === "devtools" && import.meta.env.DEV ? (
          <div className="fade-in-slide" key="devtools">
            <DevTools state={state} onSetNotice={setNotice} />
          </div>
        ) : null}
          </>
        )}
      </main>


      <SwitchConfirmModal
        onCancel={() => void handleCancelSwitch()}
        onConfirm={() => void handleConfirmSwitch()}
        operation={state.operation ?? pendingSwitch}
        state={state}
        working={workingAction === "confirm-switch" || workingAction === "cancel-switch"}
      />
      <SwitchProgressModal operation={state.operation ?? pendingSwitch} state={state} />
      <AddProfileModal
        onClose={handleCloseAddProfile}
        onSubmit={handleAddProfile}
        open={addProfileOpen}
        working={workingAction === "add-profile"}
        isFirstProfile={!state?.profiles || state.profiles.length === 0}
      />
      <DeleteProfileModal
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteProfile}
        profile={deleteTarget}
        working={workingAction === "delete-profile"}
      />
      <AboutModal
        open={aboutOpen}
        state={state}
        onClose={() => setAboutOpen(false)}
        defaultTab={aboutTab}
      />
      <LockProfileModal
        onClose={() => setLockTarget(null)}
        onConfirm={handleLockConfirm}
        profile={lockTarget}
        working={workingAction === "lock-profile"}
      />
      <UnlockProfileModal
        mode={unlockMode}
        onClose={() => setUnlockTarget(null)}
        onConfirm={handleUnlockConfirm}
        profile={unlockTarget}
        working={workingAction === "unlock-profile"}
      />

      {notice ? <Toast notice={notice} onClose={() => setNotice(null)} /> : null}

    </div>
  );
}


