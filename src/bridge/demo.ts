/**
 * Mock demo mode simulator.
 * Simulates Tauri backend IPC commands and holds a mock app state for testing in standard browsers.
 * Main exports: demoInvoke, setDemoScenario, makeDemoState, demoState
 */

import type { AppState, DemoScenario } from "../types";
import {
  isRecord,
  asString,
  asNullableString,
  asBoolean,
  asNumber,
  pick,
} from "./normalizers";

const isoIn = (minutes: number): string =>
  new Date(Date.now() + minutes * 60 * 1000).toISOString();

export const makeDemoState = (): AppState => ({
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
    smart_switch_enabled: false,
    minimize_to_tray: true,
    switch_level: 1,
    patch_cooldown_ms: 100,
    sqlite_db_path: "%APPDATA%\\Antigravity\\User\\globalStorage\\state.vscdb",
    data_dir: "%LOCALAPPDATA%\\AntigravitySwitcher",
    logs_file: "%LOCALAPPDATA%\\AntigravitySwitcher\\logs\\switcher.log",
  },
  app_version: "1.0.0-demo",
  antigravity_version: "1.4.2-demo",
  last_error: null,
  isAppLocked: false,
  hasMasterPassword: false,
});


export let demoState = makeDemoState();
let demoOperationStartedAt = 0;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const updateDemoOperation = (): void => {
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

export const demoInvoke = async (command: string, args: Record<string, unknown> = {}): Promise<unknown> => {
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
        throw new Error("Cannot switch to the selected account.");
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

    case "start_oauth_login": {
      await new Promise((resolve) => window.setTimeout(resolve, 2500));
      const displayName = asString(pick(args, "displayName", "display_name"), "Nowe konto");
      const id = `demo-profile-${Date.now()}`;
      demoState.profiles.push({
        profile_id: id,
        display_name: displayName,
        account_email: `${displayName.toLowerCase().replace(/\s+/g, "")}@example.com`,
        created_at: new Date().toISOString(),
        last_activated_at: null,
        token_expiry: isoIn(60),
        token_status: "valid",
      });
      return clone(demoState);
    }

    case "cancel_oauth_login": {
      return clone(demoState);
    }

    case "delete_profile": {
      const profileId = asString(pick(args, "profileId", "profile_id"));
      if (profileId === demoState.active_profile_id) {
        throw new Error("Cannot delete the active account.");
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
        smart_switch_enabled: asBoolean(
          pick(settings, "smart_switch_enabled", "smartSwitchEnabled"),
          demoState.settings.smart_switch_enabled,
        ),
        minimize_to_tray: asBoolean(
          pick(settings, "minimize_to_tray", "minimizeToTray"),
          demoState.settings.minimize_to_tray,
        ),
        switch_level: asNumber(
          pick(settings, "switch_level", "switchLevel"),
          demoState.settings.switch_level,
        ),
        patch_cooldown_ms: asNumber(
          pick(settings, "patch_cooldown_ms", "patchCooldownMs"),
          demoState.settings.patch_cooldown_ms || 100,
        ),
      };
      return clone(demoState);
    }

    case "copy_diagnostics":
      return [
        "Antigravity Account Switcher — demo report",
        `Version: ${demoState.app_version}`,
        `Antigravity: ${demoState.antigravity_version}`,
        "No credentials in demo report.",
      ].join("\n");

    case "recovery_resume":
    case "recovery_rollback":
      demoState.recovery = null;
      demoState.engine_status = "ready";
      demoState.last_error = null;
      return clone(demoState);

    case "show_mini_window":
      console.log("Demo: Open mini window");
      return;

    case "hide_mini_window":
      console.log("Demo: Close mini window");
      return;

    case "resize_mini_window":
      console.log("Demo: Resize mini window to", args.height);
      return;

    case "wipe_app_data":
      console.log("Demo: Wipe app data");
      demoState = makeDemoState();
      return clone(demoState);

    case "uninstall_app":
      console.log("Demo: Uninstall app");
      demoState = makeDemoState();
      return clone(demoState);

    default:
      throw new Error(`Unknown demo command: ${command}`);
  }
};

export const setDemoScenario = (scenario: DemoScenario): AppState => {
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
        reason: "Previous operation was interrupted during new profile loading.",
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
      demoState.last_error = "Failed to connect to the local plugin server.";
      break;
    case "dashboard":
    default:
      break;
  }

  return clone(demoState);
};
