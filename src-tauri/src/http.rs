/**
 * Local HTTP server for plugin communication.
 * Sets up a lightweight TcpListener routing plugin commands to switcher operations.
 * Main exports: start_http_server
 */
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use switcher_windows::SwitcherService;

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
                Ok(target_profile_id) => match service.request_switch(target_profile_id, None) {
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
                            r#"{{"accepted":true,"operationId":"{}","message":"Profile switching started"}}"#,
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
            format!("Local HTTP server running on port {}", port),
        );
        for stream in listener.incoming() {
            match stream {
                Ok(stream) => {
                    let service = service.clone();
                    let api_secret = api_secret.clone();
                    let app_handle = app_handle.clone();
                    std::thread::spawn(move || {
                        if let Err(e) = handle_client(stream, service, &api_secret, &app_handle) {
                            eprintln!("HTTP client handler error: {:?}", e);
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
