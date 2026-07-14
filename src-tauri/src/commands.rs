/**
 * Tauri command handlers.
 * IPC interfaces exposed to the React frontend.
 * Main exports: get_app_state, request_switch, confirm_switch, cancel_switch, add_current_profile, delete_profile, update_settings, copy_diagnostics, recovery_resume, recovery_rollback, start_oauth_login, cancel_oauth_login, show_mini_window, hide_mini_window, resize_mini_window
 */

use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use switcher_core::{AppStateView, ProfileView, SettingsView, SwitchRequestResult};
use switcher_windows::{SwitchOutcome, SwitcherService};

#[tauri::command]
pub async fn get_app_state(service: State<'_, Arc<SwitcherService>>) -> Result<AppStateView, String> {
    service
        .app_state_live(env!("CARGO_PKG_VERSION"))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn request_switch(
    service: State<'_, Arc<SwitcherService>>,
    target_profile_id: String,
) -> Result<SwitchRequestResult, String> {
    let target_uuid = Uuid::parse_str(&target_profile_id).map_err(|e| e.to_string())?;
    service
        .request_switch(target_uuid)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn confirm_switch(
    service: State<'_, Arc<SwitcherService>>,
    operation_id: String,
) -> Result<SwitchOutcome, String> {
    let op_uuid = Uuid::parse_str(&operation_id).map_err(|e| e.to_string())?;
    let service = service.inner().clone();
    tokio::task::spawn_blocking(move || {
        service.confirm_switch(op_uuid).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn cancel_switch(
    service: State<'_, Arc<SwitcherService>>,
    operation_id: Option<String>,
) -> Result<(), String> {
    let op_uuid = match operation_id {
        Some(id) => Some(Uuid::parse_str(&id).map_err(|e| e.to_string())?),
        None => None,
    };
    service.cancel_switch(op_uuid).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_current_profile(
    service: State<'_, Arc<SwitcherService>>,
    display_name: String,
    account_email: Option<String>,
) -> Result<ProfileView, String> {
    service
        .add_current_profile(display_name, account_email)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_profile(
    service: State<'_, Arc<SwitcherService>>,
    profile_id: String,
) -> Result<(), String> {
    let uuid = Uuid::parse_str(&profile_id).map_err(|e| e.to_string())?;
    service.delete_profile(uuid).map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
pub struct AppSettingsInput {
    http_port: u16,
    antigravity_path: String,
    smart_switch_enabled: bool,
    switch_level: u8,
    patch_cooldown_ms: Option<u32>,
}

#[tauri::command]
pub fn update_settings(
    service: State<'_, Arc<SwitcherService>>,
    settings: AppSettingsInput,
) -> Result<SettingsView, String> {
    let path = if settings.antigravity_path.trim().is_empty() {
        None
    } else {
        Some(settings.antigravity_path)
    };
    service
        .update_settings(
            settings.http_port,
            path,
            settings.smart_switch_enabled,
            settings.switch_level,
            settings.patch_cooldown_ms,
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn copy_diagnostics(service: State<'_, Arc<SwitcherService>>) -> Result<String, String> {
    service
        .diagnostic_report(env!("CARGO_PKG_VERSION"))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn recovery_resume(service: State<'_, Arc<SwitcherService>>) -> Result<SwitchOutcome, String> {
    let service = service.inner().clone();
    tokio::task::spawn_blocking(move || {
        service.recovery_resume().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn recovery_rollback(service: State<'_, Arc<SwitcherService>>) -> Result<(), String> {
    service.recovery_rollback().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_oauth_login(
    service: State<'_, Arc<SwitcherService>>,
    app_handle: AppHandle,
    display_name: String,
    lang: String,
    auto_activate: Option<bool>,
) -> Result<ProfileView, String> {
    let handle_clone = app_handle.clone();
    let on_callback = move || {
        if let Some(window) = handle_clone.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    };
    service
        .start_oauth_login(display_name, lang, auto_activate.unwrap_or(true), on_callback)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cancel_oauth_login(service: State<'_, Arc<SwitcherService>>) -> Result<(), String> {
    service.cancel_oauth_login().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn show_mini_window(app_handle: AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("mini") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}

#[tauri::command]
pub fn hide_mini_window(app_handle: AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("mini") {
        let _ = window.hide();
    }
    Ok(())
}

#[tauri::command]
pub fn resize_mini_window(app_handle: AppHandle, height: f64) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("mini") {
        let _ = window.set_size(tauri::LogicalSize::new(320.0, height));
    }
    Ok(())
}

#[tauri::command]
pub fn wipe_app_data() -> Result<(), String> {
    switcher_windows::wipe_app_data_and_relaunch()
}

#[tauri::command]
pub fn uninstall_app() -> Result<(), String> {
    switcher_windows::uninstall_app_and_self_delete()
}

#[tauri::command]
pub async fn force_smart_switch(
    service: State<'_, Arc<SwitcherService>>,
) -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        service.force_smart_switch_bypass_quota().await.map_err(|e| e.to_string())
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = service;
        Err("Not available in release build".to_string())
    }
}
