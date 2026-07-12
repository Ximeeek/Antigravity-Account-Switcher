use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use switcher_core::{AppStateView, ProfileView, SettingsView, SwitchRequestResult};
use switcher_windows::{SwitchOutcome, SwitcherService};

#[tauri::command]
async fn get_app_state(service: State<'_, Arc<SwitcherService>>) -> Result<AppStateView, String> {
    service
        .app_state_live(env!("CARGO_PKG_VERSION"))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn request_switch(
    service: State<'_, Arc<SwitcherService>>,
    target_profile_id: String,
) -> Result<SwitchRequestResult, String> {
    let target_uuid = Uuid::parse_str(&target_profile_id).map_err(|e| e.to_string())?;
    service
        .request_switch(target_uuid)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn confirm_switch(
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
fn cancel_switch(
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
fn add_current_profile(
    service: State<'_, Arc<SwitcherService>>,
    display_name: String,
    account_email: Option<String>,
) -> Result<ProfileView, String> {
    service
        .add_current_profile(display_name, account_email)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_profile(
    service: State<'_, Arc<SwitcherService>>,
    profile_id: String,
) -> Result<(), String> {
    let uuid = Uuid::parse_str(&profile_id).map_err(|e| e.to_string())?;
    service.delete_profile(uuid).map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
struct AppSettingsInput {
    http_port: u16,
    antigravity_path: String,
}

#[tauri::command]
fn update_settings(
    service: State<'_, Arc<SwitcherService>>,
    settings: AppSettingsInput,
) -> Result<SettingsView, String> {
    let path = if settings.antigravity_path.trim().is_empty() {
        None
    } else {
        Some(settings.antigravity_path)
    };
    service
        .update_settings(settings.http_port, path)
        .map_err(|e| e.to_string())
}



#[tauri::command]
fn copy_diagnostics(service: State<'_, Arc<SwitcherService>>) -> Result<String, String> {
    service
        .diagnostic_report(env!("CARGO_PKG_VERSION"))
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn recovery_resume(service: State<'_, Arc<SwitcherService>>) -> Result<SwitchOutcome, String> {
    let service = service.inner().clone();
    tokio::task::spawn_blocking(move || {
        service.recovery_resume().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn recovery_rollback(service: State<'_, Arc<SwitcherService>>) -> Result<(), String> {
    service.recovery_rollback().map_err(|e| e.to_string())
}

#[tauri::command]
async fn start_oauth_login(
    service: State<'_, Arc<SwitcherService>>,
    app_handle: tauri::AppHandle,
    display_name: String,
    lang: String,
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
        .start_oauth_login(display_name, lang, on_callback)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn cancel_oauth_login(service: State<'_, Arc<SwitcherService>>) -> Result<(), String> {
    service.cancel_oauth_login().map_err(|e| e.to_string())
}

fn handle_client(
    mut stream: TcpStream,
    service: Arc<SwitcherService>,
    api_secret: &str,
    app_handle: &AppHandle,
) -> anyhow::Result<()> {
    let mut buffer = [0; 8192];
    let bytes_read = stream.read(&mut buffer)?;
    if bytes_read == 0 {
        return Ok(());
    }
    let request_str = String::from_utf8_lossy(&buffer[..bytes_read]);
    let mut lines = request_str.lines();
    let first_line = match lines.next() {
        Some(line) => line,
        None => return Ok(()),
    };
    let parts: Vec<&str> = first_line.split_whitespace().collect();
    if parts.len() < 2 {
        return Ok(());
    }
    let method = parts[0];
    let path = parts[1];

    let mut auth_header = None;
    for line in lines {
        if line.to_lowercase().starts_with("authorization:") {
            auth_header = Some(line["authorization:".len()..].trim());
            break;
        }
    }

    let expected_auth = format!("Bearer {}", api_secret);
    if auth_header != Some(expected_auth.as_str()) {
        send_response(
            &mut stream,
            401,
            "Unauthorized",
            r#"{"error":"Unauthorized"}"#,
        )?;
        return Ok(());
    }

    if method == "GET" && path == "/api/v1/status" {
        match service.http_status() {
            Ok(status) => {
                let json = serde_json::to_string(&status)?;
                send_response(&mut stream, 200, "OK", &json)?;
            }
            Err(e) => {
                let err_msg = format!(r#"{{"error":{:?}}}"#, e.to_string());
                send_response(&mut stream, 500, "Internal Server Error", &err_msg)?;
            }
        }
    } else if method == "POST" && path == "/api/v1/app/show" {
        if let Some(window) = app_handle.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
        send_response(&mut stream, 200, "OK", r#"{"success":true}"#)?;
    } else if method == "POST"
        && path.starts_with("/api/v1/profiles/")
        && path.ends_with("/activate")
    {
        let prefix = "/api/v1/profiles/";
        let suffix = "/activate";
        if path.len() > prefix.len() + suffix.len() {
            let profile_id_str = &path[prefix.len()..path.len() - suffix.len()];
            match Uuid::parse_str(profile_id_str) {
                Ok(target_profile_id) => match service.request_switch(target_profile_id) {
                    Ok(res) => {
                        let service_clone = service.clone();
                        let operation_id = res.operation_id;
                        std::thread::spawn(move || {
                            if let Err(e) = service_clone.confirm_switch(operation_id) {
                                service_clone.logger().error(
                                    Some(operation_id),
                                    "http",
                                    format!("Switch failed: {}", e),
                                );
                            }
                        });
                        let resp = format!(
                            r#"{{"accepted":true,"operationId":"{}","message":"Rozpoczęto przełączanie profilu"}}"#,
                            operation_id.to_string()
                        );
                        send_response(&mut stream, 200, "OK", &resp)?;
                    }
                    Err(e) => {
                        let err_msg =
                            format!(r#"{{"accepted":false,"message":{:?}}}"#, e.to_string());
                        send_response(&mut stream, 400, "Bad Request", &err_msg)?;
                    }
                },
                Err(_) => {
                    send_response(
                        &mut stream,
                        400,
                        "Bad Request",
                        r#"{"error":"Invalid profile ID"}"#,
                    )?;
                }
            }
        } else {
            send_response(
                &mut stream,
                400,
                "Bad Request",
                r#"{"error":"Invalid path"}"#,
            )?;
        }
    } else {
        send_response(&mut stream, 404, "Not Found", r#"{"error":"Not Found"}"#)?;
    }
    Ok(())
}

fn send_response(
    stream: &mut TcpStream,
    status_code: u16,
    status_text: &str,
    body: &str,
) -> anyhow::Result<()> {
    let response = format!(
        "HTTP/1.1 {} {}\r\n\
         Content-Type: application/json; charset=utf-8\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\
         \r\n\
         {}",
        status_code,
        status_text,
        body.len(),
        body
    );
    stream.write_all(response.as_bytes())?;
    stream.flush()?;
    Ok(())
}

pub fn start_http_server(service: Arc<SwitcherService>, app_handle: AppHandle) {
    let port = service.http_port();
    let api_secret = service.api_secret();
    std::thread::spawn(move || {
        let listener = match TcpListener::bind(format!("127.0.0.1:{}", port)) {
            Ok(l) => l,
            Err(e) => {
                service.logger().error(
                    None,
                    "http",
                    format!("Failed to bind to port {}: {}", port, e),
                );
                return;
            }
        };
        service.logger().info(
            None,
            "http",
            format!("Lokalny serwer HTTP uruchomiony na porcie {}", port),
        );
        for stream in listener.incoming() {
            match stream {
                Ok(stream) => {
                    let service = service.clone();
                    let api_secret = api_secret.clone();
                    let app_handle = app_handle.clone();
                    std::thread::spawn(move || {
                        if let Err(e) = handle_client(stream, service, &api_secret, &app_handle) {
                            eprintln!("Błąd obsługi klienta HTTP: {:?}", e);
                        }
                    });
                }
                Err(e) => {
                    service.logger().error(
                        None,
                        "http",
                        format!("Failed to accept connection: {}", e),
                    );
                }
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let service = SwitcherService::initialize().map_err(|e| {
                eprintln!("Nie udało się zainicjować usługi SwitcherService: {:?}", e);
                e
            })?;

            // Wstępne pobieranie limitów w tle na starcie
            let service_clone = service.clone();
            tauri::async_runtime::spawn(async move {
                let _ = service_clone.fetch_all_quotas_on_startup().await;
            });

            app.manage(service.clone());

            start_http_server(service.clone(), app.handle().clone());

            let quit_i = MenuItem::with_id(app, "quit", "Zakończ", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Pokaż okno", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let icon = app.default_window_icon().cloned().unwrap_or_else(|| {
                tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png")).unwrap()
            });

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            request_switch,
            confirm_switch,
            cancel_switch,
            add_current_profile,
            delete_profile,
            update_settings,
            copy_diagnostics,
            recovery_resume,
            recovery_rollback,
            start_oauth_login,
            cancel_oauth_login
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
