/**
 * Frontend-to-Backend bridge.
 * Chooses between actual Tauri IPC invoke commands and browser demo mode simulation.
 * Main exports: isTauriRuntime, isDemoMode, getAppState, requestSwitch, confirmSwitch, cancelSwitch, addCurrentProfile, startOauthLogin, cancelOauthLogin, showMiniWindow, hideMiniWindow, resizeMiniWindow, deleteProfile, updateSettings, copyDiagnostics, recoveryResume, recoveryRollback, setDemoScenario
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  AddProfileInput,
  AppSettings,
  AppState,
  DemoScenario,
} from "../types";
import {
  isRecord,
  asBoolean,
  asString,
  pick,
  normalizeAppState,
} from "./normalizers";
import { demoInvoke, setDemoScenario as setDemoStateScenario } from "./demo";

export const isTauriRuntime = (): boolean =>
  typeof window !== "undefined" &&
  Boolean(
    (window as any).__TAURI_INTERNALS__ ||
      (window as any).__TAURI__ ||
      window.navigator.userAgent.toLowerCase().includes("tauri"),
  );

export const isDemoMode = !isTauriRuntime();

const call = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
  if (isDemoMode) return demoInvoke(command, args) as Promise<T>;
  return invoke<T>(command, args);
};

const commandThenState = async (
  command: string,
  args?: Record<string, unknown>,
): Promise<AppState> => {
  const result = await call<unknown>(command, args);
  if (isRecord(result) && ("profiles" in result || "accounts" in result)) {
    return normalizeAppState(result);
  }
  return getAppState();
};

export const getAppState = async (): Promise<AppState> =>
  normalizeAppState(await call<unknown>("get_app_state"));

export const requestSwitch = async (targetProfileId: string, password?: string): Promise<AppState> => {
  const result = await call<unknown>("request_switch", { targetProfileId, password });

  if (isRecord(result) && ("profiles" in result || "accounts" in result)) {
    const state = normalizeAppState(result);
    if (!state.operation) {
      throw new Error("Backend nie zwrócił oczekującej operacji przełączenia.");
    }
    return state;
  }

  const state = await getAppState();
  if (!isRecord(result)) {
    throw new Error("Backend zwrócił nieprawidłową odpowiedź na żądanie aktywacji.");
  }

  const requiresConfirmation = asBoolean(
    pick(result, "requiresConfirmation", "requires_confirmation"),
  );
  const operationId = asString(pick(result, "operationId", "operation_id"));
  if (!operationId) {
    throw new Error("Backend nie zwrócił identyfikatora operacji przełączenia.");
  }
  state.operation = {
    operation_id: operationId,
    from_profile_id: state.active_profile_id,
    to_profile_id: asString(
      pick(result, "targetProfileId", "target_profile_id"),
      targetProfileId,
    ),
    current_step: 0,
    status: requiresConfirmation ? "awaiting_confirmation" : "in_progress",
    editor_was_running: requiresConfirmation,
  };
  return state;
};

export const confirmSwitch = (operationId?: string | null): Promise<AppState> =>
  commandThenState("confirm_switch", operationId ? { operationId } : undefined);

export const cancelSwitch = (operationId?: string | null): Promise<AppState> =>
  commandThenState("cancel_switch", operationId ? { operationId } : undefined);

export const addCurrentProfile = (profile: AddProfileInput): Promise<AppState> => {
  const args: Record<string, unknown> = { displayName: profile.display_name };
  if (profile.account_email) args.accountEmail = profile.account_email;
  return commandThenState("add_current_profile", args);
};

export const startOauthLogin = (displayName: string, lang: string, autoActivate?: boolean): Promise<AppState> =>
  commandThenState("start_oauth_login", { displayName, lang, autoActivate });

export const cancelOauthLogin = (): Promise<AppState> =>
  commandThenState("cancel_oauth_login");

export const showMiniWindow = (): Promise<void> =>
  call<void>("show_mini_window");

export const hideMiniWindow = (): Promise<void> =>
  call<void>("hide_mini_window");

export const resizeMiniWindow = (height: number): Promise<void> =>
  call<void>("resize_mini_window", { height });

export const deleteProfile = (profileId: string): Promise<AppState> =>
  commandThenState("delete_profile", { profileId });

export const updateSettings = (settings: AppSettings): Promise<AppState> =>
  commandThenState("update_settings", { settings });

export const copyDiagnostics = async (): Promise<string> => {
  const result = await call<unknown>("copy_diagnostics");
  const text = typeof result === "string" ? result : "";
  if (text && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }
  return text;
};

export const recoveryResume = (): Promise<AppState> =>
  commandThenState("recovery_resume");

export const recoveryRollback = (): Promise<AppState> =>
  commandThenState("recovery_rollback");

export const wipeAppData = (): Promise<void> =>
  call<void>("wipe_app_data");

export const uninstallApp = (): Promise<void> =>
  call<void>("uninstall_app");

export const lockProfile = (profileId: string, password: string): Promise<AppState> =>
  commandThenState("lock_profile", { profileId, password });

export const unlockProfile = (profileId: string, password: string): Promise<AppState> =>
  commandThenState("unlock_profile", { profileId, password });

export const removeProfileLock = (profileId: string, password: string): Promise<AppState> =>
  commandThenState("remove_profile_lock", { profileId, password });


export const setDemoScenario = (scenario: DemoScenario): AppState => {
  const state = setDemoStateScenario(scenario);
  return state;
};

// URL Query param initialization for demo mode
if (isDemoMode && typeof window !== "undefined") {
  const requestedScenario = new URLSearchParams(window.location.search).get("demo");
  if (
    requestedScenario === "empty" ||
    requestedScenario === "recovery" ||
    requestedScenario === "progress" ||
    requestedScenario === "error"
  ) {
    setDemoScenario(requestedScenario as DemoScenario);
  }
}
