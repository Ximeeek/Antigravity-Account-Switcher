/**
 * Tauri Application Library Entrypoint.
 * Initializes background workers, local TCP server, system tray, and maps command handlers.
 * Main exports: run
 */

pub mod commands;
pub mod http;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

use switcher_windows::SwitcherService;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    {
        // Enforce single instance lock
        switcher_windows::check_single_instance();

        let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
        if let Err(e) = rt.block_on(switcher_windows::check_and_install_webview2()) {
            eprintln!("Failed to check or install WebView2: {}", e);
            std::process::exit(1);
        }
    }

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
                eprintln!("Failed to initialize SwitcherService: {:?}", e);
                e
            })?;

            // Prefetch quotas in the background on startup
            let service_clone = service.clone();
            tauri::async_runtime::spawn(async move {
                let _ = service_clone.fetch_all_quotas_on_startup().await;
            });

            // Thread checking automatic switching (Smart Switch) in the background
            let service_smart = service.clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(10));
                // Skip the first immediate tick
                interval.tick().await;
                loop {
                    interval.tick().await;
                    if let Err(e) = service_smart.check_and_perform_smart_switch().await {
                        service_smart.logger().error(None, "smart_switch", format!("Smart Switch error: {}", e));
                    }
                }
            });

            app.manage(service.clone());

            http::start_http_server(service.clone(), app.handle().clone());

            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
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
            commands::get_app_state,
            commands::request_switch,
            commands::confirm_switch,
            commands::cancel_switch,
            commands::add_current_profile,
            commands::delete_profile,
            commands::update_settings,
            commands::copy_diagnostics,
            commands::recovery_resume,
            commands::recovery_rollback,
            commands::start_oauth_login,
            commands::cancel_oauth_login,
            commands::show_mini_window,
            commands::hide_mini_window,
            commands::resize_mini_window,
            commands::wipe_app_data,
            commands::uninstall_app,
            commands::force_smart_switch,
            commands::lock_profile,
            commands::unlock_profile,
            commands::remove_profile_lock,
            commands::close_app_lock,
            commands::open_browser_url,
            commands::send_email_report
        ])


        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
