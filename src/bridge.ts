import { invoke } from "@tauri-apps/api/core";
import type {
  AddProfileInput,
  AppSettings,
  AppState,
  DemoScenario,
  EngineStatus,
  ExtensionInfo,
  ExtensionStatus,
  OperationStatus,
  ProfileSummary,
  RecoveryState,
  SwitchOperation,
  TokenStatus,
} from "./types";

declare global {
  interface Window {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  }
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const asNullableString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const asBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === "boolean" ? value : fallback;

const asNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const pick = (source: UnknownRecord, ...keys: string[]): unknown => {
  for (const key of keys) {
    if (key in source) return source[key];
  }
  return undefined;
};

const normalizeTokenStatus = (value: unknown, expiry?: string | null): TokenStatus => {
  const raw = asString(value).toLowerCase().replaceAll("-", "_");
  if (["valid", "ok", "active"].includes(raw)) return "valid";
  if (["expiring", "expiring_soon", "expires_soon"].includes(raw)) return "expiring";
  if (["expired", "invalid", "reauth_required"].includes(raw)) return "expired";
  if (["refreshing", "pending"].includes(raw)) return "refreshing";

  if (expiry) {
    const expiryTime = Date.parse(expiry);
    if (Number.isFinite(expiryTime)) {
      const remaining = expiryTime - Date.now();
      if (remaining <= 0) return "expired";
      if (remaining <= 30 * 60 * 1000) return "expiring";
      return "valid";
    }
  }

  return "unknown";
};

const normalizeProfile = (value: unknown, index: number): ProfileSummary => {
  const source = isRecord(value) ? value : {};
  const expiry = asNullableString(pick(source, "token_expiry", "tokenExpiry"));

  return {
    profile_id: asString(pick(source, "profile_id", "profileId", "id"), `profile-${index}`),
    display_name: asString(
      pick(source, "display_name", "displayName", "name"),
      `Konto ${index + 1}`,
    ),
    account_email: asNullableString(pick(source, "account_email", "accountEmail", "email")),
    created_at: asNullableString(pick(source, "created_at", "createdAt")),
    last_activated_at: asNullableString(
      pick(source, "last_activated_at", "lastActivatedAt"),
    ),
    token_expiry: expiry,
    token_status: normalizeTokenStatus(
      pick(source, "token_status", "tokenStatus", "status"),
      expiry,
    ),
  };
};

const normalizeEngineStatus = (value: unknown): EngineStatus => {
  const status = asString(value).toLowerCase().replaceAll("-", "_");
  if (["busy", "switching", "working", "in_progress"].includes(status)) return "busy";
  if (["error", "failed", "attention", "requires_attention"].includes(status)) return "error";
  if (["offline", "stopped", "unavailable"].includes(status)) return "offline";
  return "ready";
};

const normalizeSwitchStep = (value: unknown): number => {
  const numeric = asNumber(value, Number.NaN);
  if (Number.isFinite(numeric)) return Math.max(0, Math.min(9, numeric));
  const step = asString(value).toLowerCase().replaceAll("-", "_");
  const steps: Record<string, number> = {
    write_lock: 1,
    close_processes: 2,
    verify_unlocked: 3,
    backup_current: 4,
    load_target: 5,
    update_credential: 6,
    verify_consistency: 7,
    remove_lock: 8,
    relaunch: 9,
  };
  return steps[step] ?? 0;
};

const normalizeOperationStatus = (value: unknown): OperationStatus => {
  const status = asString(value).toLowerCase().replaceAll("-", "_");
  if (["requested", "pending_confirmation", "awaiting_confirmation"].includes(status)) {
    return "awaiting_confirmation";
  }
  if (["completed", "complete", "success", "succeeded"].includes(status)) return "completed";
  if (["failed", "error"].includes(status)) return "failed";
  if (["cancelled", "canceled"].includes(status)) return "cancelled";
  return "in_progress";
};

const normalizeOperation = (value: unknown): SwitchOperation | null => {
  if (!isRecord(value)) return null;
  const toProfileId = asNullableString(pick(value, "to_profile_id", "toProfileId", "target_profile_id", "targetProfileId"));
  if (!toProfileId) return null;

  return {
    operation_id: asString(pick(value, "operation_id", "operationId", "id"), "current-operation"),
    from_profile_id: asNullableString(pick(value, "from_profile_id", "fromProfileId")),
    to_profile_id: toProfileId,
    current_step: normalizeSwitchStep(pick(value, "current_step", "currentStep", "step")),
    status: normalizeOperationStatus(pick(value, "status", "state")),
    message: asNullableString(pick(value, "message", "status_message", "statusMessage", "label")),
    error: asNullableString(pick(value, "error", "error_message", "errorMessage")),
    editor_was_running: asBoolean(pick(value, "editor_was_running", "editorWasRunning")),
  };
};

const normalizeRecovery = (value: unknown): RecoveryState | null => {
  if (!isRecord(value)) return null;
  const required = asBoolean(pick(value, "required", "is_required", "isRequired"), true);
  if (!required) return null;

  return {
    required,
    operation_id: asNullableString(pick(value, "operation_id", "operationId")),
    current_step: normalizeSwitchStep(pick(value, "current_step", "currentStep", "step")),
    from_profile_id: asNullableString(pick(value, "from_profile_id", "fromProfileId")),
    to_profile_id: asNullableString(pick(value, "to_profile_id", "toProfileId")),
    reason: asNullableString(pick(value, "reason", "message", "error", "step_label", "stepLabel")),
    can_resume: asBoolean(pick(value, "can_resume", "canResume"), true),
    can_rollback: asBoolean(pick(value, "can_rollback", "canRollback"), true),
  };
};

const normalizeExtensionStatus = (value: unknown): ExtensionStatus => {
  const status = asString(value).toLowerCase().replaceAll("-", "_");
  if (["installed", "ok", "ready"].includes(status)) return "installed";
  if (["update_available", "outdated", "needs_update"].includes(status)) {
    return "update_available";
  }
  if (["error", "failed"].includes(status)) return "error";
  return "not_installed";
};

const normalizeExtension = (value: unknown, root: UnknownRecord): ExtensionInfo => {
  const source = isRecord(value) ? value : {};
  const rawStatus = pick(source, "status", "extension_status", "extensionStatus") ??
    pick(root, "extension_status", "extensionStatus");
  return {
    status: normalizeExtensionStatus(rawStatus),
    version: asNullableString(pick(source, "version", "extension_version", "extensionVersion")),
    message: asNullableString(pick(source, "message", "error")),
  };
};

export const normalizeAppState = (value: unknown): AppState => {
  const source = isRecord(value) ? value : {};
  const rawProfiles = pick(source, "profiles", "accounts");
  const profiles = Array.isArray(rawProfiles)
    ? rawProfiles.map(normalizeProfile)
    : [];
  const settingsSource = isRecord(pick(source, "settings", "config"))
    ? (pick(source, "settings", "config") as UnknownRecord)
    : {};

  const activeFromProfile = profiles.find((profile, index) => {
    const raw = Array.isArray(rawProfiles) ? rawProfiles[index] : null;
    return isRecord(raw) && asBoolean(pick(raw, "is_active", "isActive", "active"));
  })?.profile_id;
  const activeProfileSource = isRecord(pick(source, "active_profile", "activeProfile"))
    ? (pick(source, "active_profile", "activeProfile") as UnknownRecord)
    : null;

  return {
    profiles,
    active_profile_id:
      asNullableString(pick(source, "active_profile_id", "activeProfileId")) ??
      (activeProfileSource
        ? asNullableString(pick(activeProfileSource, "profile_id", "profileId", "id"))
        : null) ??
      activeFromProfile ??
      null,
    engine_status: normalizeEngineStatus(
      pick(source, "engine_status", "engineStatus", "status"),
    ),
    editor_running: asBoolean(
      pick(source, "editor_running", "editorRunning", "antigravity_running", "antigravityRunning"),
    ),
    operation: normalizeOperation(
      pick(source, "operation", "switch_operation", "switchOperation", "pending_switch", "pendingSwitch"),
    ),
    recovery: normalizeRecovery(
      pick(source, "recovery", "recovery_state", "recoveryState"),
    ),
    settings: {
      http_port: asNumber(
        pick(settingsSource, "http_port", "httpPort", "port") ??
          pick(source, "http_port", "httpPort"),
        43127,
      ),
      antigravity_path: asString(
        pick(settingsSource, "antigravity_path", "antigravityPath", "installation_path", "installationPath") ??
          pick(source, "antigravity_path", "antigravityPath"),
      ),
    },
    extension: normalizeExtension(
      pick(source, "extension", "extension_info", "extensionInfo") ?? {
        status: pick(settingsSource, "extension_status", "extensionStatus"),
      },
      source,
    ),
    app_version: asNullableString(pick(source, "app_version", "appVersion", "version")),
    antigravity_version: asNullableString(
      pick(source, "antigravity_version", "antigravityVersion"),
    ),
    last_error: asNullableString(pick(source, "last_error", "lastError", "error")),
  };
};

export const isTauriRuntime = (): boolean =>
  typeof window !== "undefined" &&
  Boolean(
    window.__TAURI_INTERNALS__ ||
      window.__TAURI__ ||
      window.navigator.userAgent.toLowerCase().includes("tauri"),
  );

export const isDemoMode = !isTauriRuntime();

const isoIn = (minutes: number): string =>
  new Date(Date.now() + minutes * 60 * 1000).toISOString();

const makeDemoState = (): AppState => ({
  profiles: [
    {
      profile_id: "demo-studio",
      display_name: "Studio",
      account_email: "studio@example.test",
      created_at: isoIn(-18 * 24 * 60),
      last_activated_at: isoIn(-42),
      token_expiry: isoIn(54),
      token_status: "valid",
    },
    {
      profile_id: "demo-research",
      display_name: "Research",
      account_email: "research@example.test",
      created_at: isoIn(-12 * 24 * 60),
      last_activated_at: isoIn(-2 * 24 * 60),
      token_expiry: isoIn(18),
      token_status: "expiring",
    },
    {
      profile_id: "demo-personal",
      display_name: "Prywatne",
      account_email: "personal@example.test",
      created_at: isoIn(-7 * 24 * 60),
      last_activated_at: isoIn(-5 * 24 * 60),
      token_expiry: isoIn(-35),
      token_status: "expired",
    },
  ],
  active_profile_id: "demo-studio",
  engine_status: "ready",
  editor_running: true,
  operation: null,
  recovery: null,
  settings: {
    http_port: 43127,
    antigravity_path: "C:\\Program Files\\Antigravity\\Antigravity.exe",
  },
  extension: {
    status: "installed",
    version: "1.0.0-demo",
  },
  app_version: "1.0.0-demo",
  antigravity_version: "1.4.2-demo",
  last_error: null,
});

let demoState = makeDemoState();
let demoOperationStartedAt = 0;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const updateDemoOperation = (): void => {
  const operation = demoState.operation;
  if (!operation || operation.status !== "in_progress" || demoOperationStartedAt === 0) return;

  const elapsed = Date.now() - demoOperationStartedAt;
  const step = Math.min(9, Math.max(1, Math.floor(elapsed / 700) + 1));
  operation.current_step = step;
  operation.message = null;

  if (step >= 9) {
    demoState.active_profile_id = operation.to_profile_id;
    demoState.profiles = demoState.profiles.map((profile) =>
      profile.profile_id === operation.to_profile_id
        ? {
            ...profile,
            last_activated_at: new Date().toISOString(),
            token_status: profile.token_status === "expired" ? "valid" : profile.token_status,
            token_expiry: profile.token_status === "expired" ? isoIn(60) : profile.token_expiry,
          }
        : profile,
    );
    demoState.operation = null;
    demoState.engine_status = "ready";
    demoState.editor_running = true;
    demoOperationStartedAt = 0;
  }
};

const demoInvoke = async (command: string, args: UnknownRecord = {}): Promise<unknown> => {
  await new Promise((resolve) => window.setTimeout(resolve, 140));
  updateDemoOperation();

  switch (command) {
    case "get_app_state":
      return clone(demoState);

    case "request_switch": {
      const targetProfileId = asString(
        pick(args, "targetProfileId", "target_profile_id", "profileId", "profile_id"),
      );
      const target = demoState.profiles.find((profile) => profile.profile_id === targetProfileId);
      if (!target || targetProfileId === demoState.active_profile_id) {
        throw new Error("Nie można przełączyć na wybrane konto.");
      }
      demoState.operation = {
        operation_id: `demo-${Date.now()}`,
        from_profile_id: demoState.active_profile_id,
        to_profile_id: targetProfileId,
        current_step: 0,
        status: demoState.editor_running ? "awaiting_confirmation" : "in_progress",
        editor_was_running: demoState.editor_running,
      };
      if (!demoState.editor_running) {
        demoState.engine_status = "busy";
        demoOperationStartedAt = Date.now();
      }
      return clone(demoState);
    }

    case "confirm_switch":
      if (!demoState.operation) throw new Error("Brak operacji do potwierdzenia.");
      demoState.operation.status = "in_progress";
      demoState.operation.current_step = 1;
      demoState.engine_status = "busy";
      demoOperationStartedAt = Date.now();
      return clone(demoState);

    case "cancel_switch":
      demoState.operation = null;
      demoState.engine_status = "ready";
      demoOperationStartedAt = 0;
      return clone(demoState);

    case "add_current_profile": {
      const payload = isRecord(args.profile) ? args.profile : args;
      const id = `demo-profile-${Date.now()}`;
      demoState.profiles.push({
        profile_id: id,
        display_name: asString(pick(payload, "displayName", "display_name"), "Nowe konto"),
        account_email: asNullableString(pick(payload, "accountEmail", "account_email")),
        created_at: new Date().toISOString(),
        last_activated_at: null,
        token_expiry: isoIn(60),
        token_status: "valid",
      });
      if (!demoState.active_profile_id) demoState.active_profile_id = id;
      return clone(demoState);
    }

    case "delete_profile": {
      const profileId = asString(pick(args, "profileId", "profile_id"));
      if (profileId === demoState.active_profile_id) {
        throw new Error("Nie można usunąć aktywnego konta.");
      }
      demoState.profiles = demoState.profiles.filter(
        (profile) => profile.profile_id !== profileId,
      );
      return clone(demoState);
    }

    case "update_settings": {
      const settings = isRecord(args.settings) ? args.settings : args;
      demoState.settings = {
        http_port: asNumber(pick(settings, "http_port", "httpPort"), demoState.settings.http_port),
        antigravity_path: asString(
          pick(settings, "antigravity_path", "antigravityPath"),
          demoState.settings.antigravity_path,
        ),
      };
      return clone(demoState);
    }

    case "install_extension":
      demoState.extension = { status: "installed", version: "1.0.0-demo" };
      return clone(demoState);

    case "copy_diagnostics":
      return [
        "Antigravity Account Switcher — raport demonstracyjny",
        `Wersja: ${demoState.app_version}`,
        `Antigravity: ${demoState.antigravity_version}`,
        "Brak danych uwierzytelniających w raporcie demonstracyjnym.",
      ].join("\n");

    case "recovery_resume":
    case "recovery_rollback":
      demoState.recovery = null;
      demoState.engine_status = "ready";
      demoState.last_error = null;
      return clone(demoState);

    default:
      throw new Error(`Nieznana komenda demonstracyjna: ${command}`);
  }
};

const call = async <T>(command: string, args?: UnknownRecord): Promise<T> => {
  if (isDemoMode) return demoInvoke(command, args) as Promise<T>;
  return invoke<T>(command, args);
};

const commandThenState = async (
  command: string,
  args?: UnknownRecord,
): Promise<AppState> => {
  const result = await call<unknown>(command, args);
  if (isRecord(result) && ("profiles" in result || "accounts" in result)) {
    return normalizeAppState(result);
  }
  return getAppState();
};

export const getAppState = async (): Promise<AppState> =>
  normalizeAppState(await call<unknown>("get_app_state"));

export const requestSwitch = async (targetProfileId: string): Promise<AppState> => {
  const result = await call<unknown>("request_switch", { targetProfileId });
  if (isRecord(result) && ("profiles" in result || "accounts" in result)) {
    return normalizeAppState(result);
  }

  const state = await getAppState();
  if (!isRecord(result)) {
    return state;
  }

  const requiresConfirmation = asBoolean(
    pick(result, "requiresConfirmation", "requires_confirmation"),
  );
  if (!state.operation) {
    state.operation = {
      operation_id: asString(
        pick(result, "operationId", "operation_id"),
        "pending-operation",
      ),
      from_profile_id: state.active_profile_id,
      to_profile_id: asString(
        pick(result, "targetProfileId", "target_profile_id"),
        targetProfileId,
      ),
      current_step: 0,
      status: requiresConfirmation ? "awaiting_confirmation" : "in_progress",
      editor_was_running: requiresConfirmation,
    };
  }
  return state;
};

export const confirmSwitch = (operationId?: string | null): Promise<AppState> =>
  commandThenState("confirm_switch", operationId ? { operationId } : undefined);

export const cancelSwitch = (operationId?: string | null): Promise<AppState> =>
  commandThenState("cancel_switch", operationId ? { operationId } : undefined);

export const addCurrentProfile = (profile: AddProfileInput): Promise<AppState> => {
  const args: UnknownRecord = { displayName: profile.display_name };
  if (profile.account_email) args.accountEmail = profile.account_email;
  return commandThenState("add_current_profile", args);
};

export const deleteProfile = (profileId: string): Promise<AppState> =>
  commandThenState("delete_profile", { profileId });

export const updateSettings = (settings: AppSettings): Promise<AppState> =>
  commandThenState("update_settings", { settings });

export const installExtension = (): Promise<AppState> =>
  commandThenState("install_extension");

export const copyDiagnostics = async (): Promise<string> => {
  const result = await call<unknown>("copy_diagnostics");
  const text = typeof result === "string" ? result : "";
  if (isDemoMode && text && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }
  return text;
};

export const recoveryResume = (): Promise<AppState> =>
  commandThenState("recovery_resume");

export const recoveryRollback = (): Promise<AppState> =>
  commandThenState("recovery_rollback");

export const setDemoScenario = (scenario: DemoScenario): AppState => {
  if (!isDemoMode) return clone(demoState);
  demoState = makeDemoState();
  demoOperationStartedAt = 0;

  switch (scenario) {
    case "empty":
      demoState.profiles = [];
      demoState.active_profile_id = null;
      demoState.editor_running = false;
      break;
    case "recovery":
      demoState.engine_status = "error";
      demoState.recovery = {
        required: true,
        operation_id: "demo-recovery-operation",
        current_step: 5,
        from_profile_id: "demo-studio",
        to_profile_id: "demo-research",
        reason: "Poprzednia operacja została przerwana podczas ładowania nowego profilu.",
        can_resume: true,
        can_rollback: true,
      };
      break;
    case "progress":
      demoState.engine_status = "busy";
      demoState.operation = {
        operation_id: "demo-progress-operation",
        from_profile_id: "demo-studio",
        to_profile_id: "demo-research",
        current_step: 1,
        status: "in_progress",
        editor_was_running: true,
      };
      demoOperationStartedAt = Date.now();
      break;
    case "error":
      demoState.engine_status = "error";
      demoState.last_error = "Nie udało się połączyć z lokalnym serwerem wtyczki.";
      demoState.extension = {
        status: "error",
        message: "Wtyczka nie odpowiada.",
      };
      break;
    case "dashboard":
    default:
      break;
  }

  return clone(demoState);
};

if (isDemoMode && typeof window !== "undefined") {
  const requestedScenario = new URLSearchParams(window.location.search).get("demo");
  if (
    requestedScenario === "empty" ||
    requestedScenario === "recovery" ||
    requestedScenario === "progress" ||
    requestedScenario === "error"
  ) {
    setDemoScenario(requestedScenario);
  }
}
