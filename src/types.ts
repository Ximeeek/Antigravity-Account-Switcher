export type EngineStatus = "ready" | "busy" | "error" | "offline";

export type TokenStatus =
  | "valid"
  | "expiring"
  | "expired"
  | "refreshing"
  | "unknown";



export type OperationStatus =
  | "awaiting_confirmation"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled";

export interface ProfileSummary {
  profile_id: string;
  display_name: string;
  account_email?: string | null;
  created_at?: string | null;
  last_activated_at?: string | null;
  token_expiry?: string | null;
  token_status: TokenStatus;
  has_refresh_token?: boolean;
}

export interface SwitchOperation {
  operation_id: string;
  from_profile_id?: string | null;
  to_profile_id: string;
  current_step: number;
  status: OperationStatus;
  message?: string | null;
  error?: string | null;
  editor_was_running?: boolean;
}

export interface RecoveryState {
  required: boolean;
  operation_id?: string | null;
  current_step: number;
  from_profile_id?: string | null;
  to_profile_id?: string | null;
  reason?: string | null;
  can_resume: boolean;
  can_rollback: boolean;
}

export interface AppSettings {
  http_port: number;
  antigravity_path: string;
}



export interface AppState {
  profiles: ProfileSummary[];
  active_profile_id: string | null;
  engine_status: EngineStatus;
  editor_running: boolean;
  operation: SwitchOperation | null;
  recovery: RecoveryState | null;
  settings: AppSettings;

  app_version?: string | null;
  antigravity_version?: string | null;
  last_error?: string | null;
}

export interface AddProfileInput {
  display_name: string;
  account_email?: string;
}

export type DemoScenario =
  | "dashboard"
  | "empty"
  | "recovery"
  | "progress"
  | "error";

export interface CommandError {
  message: string;
  command?: string;
  details?: unknown;
}
