import { useCallback, useEffect, useRef, useState } from "react";
import {
  addCurrentProfile,
  cancelSwitch,
  confirmSwitch,
  copyDiagnostics,
  deleteProfile,
  getAppState,
  installExtension,
  isDemoMode,
  recoveryResume,
  recoveryRollback,
  requestSwitch,
  setDemoScenario,
  updateSettings,
  startOauthLogin,
  cancelOauthLogin,
} from "./bridge";

import { Dashboard } from "./components/Dashboard";
import { Header, type AppView } from "./components/Header";
import { TitleBar } from "./components/TitleBar";
import { Icon } from "./components/Icons";
import {
  AddProfileModal,
  DeleteProfileModal,
} from "./components/ProfileModals";
import { Settings } from "./components/Settings";
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

interface Notice {
  tone: "success" | "danger" | "info";
  message: string;
}

const errorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Wystąpił nieoczekiwany błąd. Spróbuj ponownie.";
};

function LoadingScreen() {
  return (
    <main className="boot-screen" aria-busy="true" aria-label="Ładowanie aplikacji">
      <div className="boot-screen__mark"><Icon name="loader" size={27} /></div>
      <h1>Ładowanie profili</h1>
      <p>Sprawdzamy stan Antigravity i lokalnego magazynu.</p>
    </main>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="boot-screen boot-screen--error">
      <div className="boot-screen__mark"><Icon name="error" size={27} /></div>
      <h1>Nie udało się uruchomić aplikacji</h1>
      <p>{message}</p>
      <button className="button button--primary" onClick={onRetry} type="button">
        <Icon name="refresh" size={16} />
        <span>Spróbuj ponownie</span>
      </button>
    </main>
  );
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [view, setView] = useState<AppView>("dashboard");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workingAction, setWorkingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [addProfileOpen, setAddProfileOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProfileSummary | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<SwitchOperation | null>(null);
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
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(null), 5200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const operation = state?.operation;
    const shouldPoll =
      operation?.status === "in_progress" || state?.engine_status === "busy";
    if (!shouldPoll) return undefined;
    const interval = window.setInterval(() => void loadState(true), 650);
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
      setNotice({ tone: "success", message: "Konto zostało bezpiecznie przełączone." });
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

  const handleActivate = async (profile: ProfileSummary) => {
    setWorkingAction("request-switch");
    try {
      const requested = await requestSwitch(profile.profile_id);
      if (!mounted.current) return;
      const operation = requested.operation;
      if (!operation) {
        throw new Error("Nie udało się utworzyć operacji przełączenia konta.");
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

  const handleConfirmSwitch = async () => {
    const operationId = pendingSwitch?.operation_id ?? state?.operation?.operation_id;
    if (!operationId) {
      setNotice({ tone: "danger", message: "Brak operacji przełączenia do potwierdzenia." });
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

  const handleAddProfile = async (displayName: string) => {
    const succeeded = await performStateAction(
      "add-profile",
      () => startOauthLogin(displayName),
      `Konto „${displayName}” zostało zapisane.`,
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
      `Profil „${profile.display_name}” został usunięty.`,
    );
    if (succeeded) setDeleteTarget(null);
  };

  const handleSaveSettings = async (settings: AppSettings) => {
    await performStateAction(
      "settings",
      () => updateSettings(settings),
      "Ustawienia zostały zapisane.",
    );
  };

  const handleInstallExtension = async () => {
    await performStateAction(
      "extension",
      installExtension,
      "Wtyczka Antigravity została zainstalowana.",
    );
  };

  const handleCopyDiagnostics = async () => {
    setWorkingAction("diagnostics");
    try {
      await copyDiagnostics();
      if (mounted.current) {
        setNotice({ tone: "success", message: "Dziennik diagnostyczny skopiowano do schowka." });
      }
    } catch (error) {
      if (mounted.current) setNotice({ tone: "danger", message: errorMessage(error) });
    } finally {
      if (mounted.current) setWorkingAction(null);
    }
  };

  const handleRecoveryResume = async () => {
    await performStateAction(
      "recovery-resume",
      recoveryResume,
      "Odzyskiwanie zostało zakończone.",
    );
  };

  const handleRecoveryRollback = async () => {
    await performStateAction(
      "recovery-rollback",
      recoveryRollback,
      "Poprzedni profil został przywrócony.",
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

  return (
    <div className="app-shell" style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <TitleBar />
      <Header
        demoMode={isDemoMode}
        demoScenario={demoScenario}
        engineStatus={state.engine_status}
        onDemoScenarioChange={handleDemoScenario}
        onViewChange={setView}
        view={view}
      />

      <main className="app-main" id="main-content">
        {state.last_error ? (
          <div className="inline-notice inline-notice--danger" role="alert">
            <Icon name="error" size={19} />
            <div>
              <strong>Aplikacja wymaga uwagi</strong>
              <p>{state.last_error}</p>
            </div>
            <button
              aria-label="Odśwież stan aplikacji"
              className="button button--ghost button--small"
              onClick={() => void loadState(true)}
              type="button"
            >
              <Icon name="refresh" size={15} />
              <span>Odśwież</span>
            </button>
          </div>
        ) : null}

        {view === "dashboard" ? (
          <Dashboard
            busy={switchBusy}
            onActivate={(profile) => void handleActivate(profile)}
            onAdd={() => setAddProfileOpen(true)}
            onDelete={setDeleteTarget}
            state={state}
          />
        ) : (
          <Settings
            onCopyDiagnostics={handleCopyDiagnostics}
            onInstallExtension={handleInstallExtension}
            onSave={handleSaveSettings}
            state={state}
            workingAction={workingAction}
          />
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
      />
      <DeleteProfileModal
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteProfile}
        profile={deleteTarget}
        working={workingAction === "delete-profile"}
      />

      {notice ? <Toast notice={notice} onClose={() => setNotice(null)} /> : null}
    </div>
  );
}

function Toast({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  return (
    <div
      aria-atomic="true"
      className={`toast toast--${notice.tone}`}
      role={notice.tone === "danger" ? "alert" : "status"}
    >
      <span className="toast__icon">
        <Icon name={notice.tone === "success" ? "check" : notice.tone === "danger" ? "error" : "info"} size={17} />
      </span>
      <span>{notice.message}</span>
      <button aria-label="Zamknij komunikat" onClick={onClose} type="button">
        <Icon name="close" size={15} />
      </button>
    </div>
  );
}
