/**
 * Normalization helpers for backend payloads.
 * Converts raw JSON objects from Tauri commands into structured frontend TypeScript types.
 * Main exports: normalizeAppState, normalizeProfile, normalizeTokenStatus, normalizeEngineStatus, normalizeSwitchStep, normalizeOperationStatus, normalizeOperation, normalizeRecovery
 */

import type {
  AppState,
  EngineStatus,
  OperationStatus,
  ProfileSummary,
  RecoveryState,
  SwitchOperation,
  TokenStatus,
} from "../types";

export type UnknownRecord = Record<string, unknown>;

export const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const asString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

export const asNullableString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

export const asBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === "boolean" ? value : fallback;

export const asNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

export const pick = (source: UnknownRecord, ...keys: string[]): unknown => {
  for (const key of keys) {
    if (key in source) return source[key];
  }
  return undefined;
};

export const normalizeTokenStatus = (
  value: unknown,
  expiry?: string | null,
  hasRefreshToken?: boolean,
): TokenStatus => {
  if (hasRefreshToken) return "valid";
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

export const normalizeProfile = (value: unknown, index: number): ProfileSummary => {
  const source = isRecord(value) ? value : {};
  const expiry = asNullableString(pick(source, "token_expiry", "tokenExpiry"));
  const hasRefreshToken = asBoolean(pick(source, "has_refresh_token", "hasRefreshToken"));
  const quota = pick(source, "quota");

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
      hasRefreshToken,
    ),
    has_refresh_token: hasRefreshToken,
    quota: isRecord(quota) ? (quota as any) : null,
  };
};

export const normalizeEngineStatus = (value: unknown): EngineStatus => {
  const status = asString(value).toLowerCase().replaceAll("-", "_");
  if (["busy", "switching", "working", "in_progress"].includes(status)) return "busy";
  if (["error", "failed", "attention", "requires_attention"].includes(status)) return "error";
  if (["offline", "stopped", "unavailable"].includes(status)) return "offline";
  return "ready";
};

export const normalizeSwitchStep = (value: unknown): number => {
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

export const normalizeOperationStatus = (value: unknown): OperationStatus => {
  const status = asString(value).toLowerCase().replaceAll("-", "_");
  if (["requested", "pending_confirmation", "awaiting_confirmation"].includes(status)) {
    return "awaiting_confirmation";
  }
  if (["completed", "complete", "success", "succeeded"].includes(status)) return "completed";
  if (["failed", "error"].includes(status)) return "failed";
  if (["cancelled", "canceled"].includes(status)) return "cancelled";
  return "in_progress";
};

export const normalizeOperation = (value: unknown): SwitchOperation | null => {
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

export const normalizeRecovery = (value: unknown): RecoveryState | null => {
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
    isAppLocked: asBoolean(pick(source, "is_app_locked", "isAppLocked")),
    hasMasterPassword: asBoolean(pick(source, "has_master_password", "hasMasterPassword")),

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
      smart_switch_enabled: asBoolean(
        pick(settingsSource, "smart_switch_enabled", "smartSwitchEnabled") ??
          pick(source, "smart_switch_enabled", "smartSwitchEnabled"),
        false,
      ),
      minimize_to_tray: asBoolean(
        pick(settingsSource, "minimize_to_tray", "minimizeToTray") ??
          pick(source, "minimize_to_tray", "minimizeToTray"),
        true,
      ),
      switch_level: asNumber(
        pick(settingsSource, "switch_level", "switchLevel") ??
          pick(source, "switch_level", "switchLevel"),
        1,
      ),
      patch_cooldown_ms: asNumber(
        pick(settingsSource, "patch_cooldown_ms", "patchCooldownMs") ??
          pick(source, "patch_cooldown_ms", "patchCooldownMs"),
        100,
      ),
      sqlite_db_path: asString(
        pick(settingsSource, "sqlite_db_path", "sqliteDbPath"),
      ),
      data_dir: asString(
        pick(settingsSource, "data_dir", "dataDir"),
      ),
      logs_file: asString(
        pick(settingsSource, "logs_file", "logsFile"),
      ),
    },
    app_version: asNullableString(pick(source, "app_version", "appVersion", "version")),
    antigravity_version: asNullableString(
      pick(source, "antigravity_version", "antigravityVersion"),
    ),
    last_error: asNullableString(pick(source, "last_error", "lastError", "error")),
  };
};
