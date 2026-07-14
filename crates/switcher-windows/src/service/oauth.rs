/**
 * OAuth Login server and listener.
 * Runs a one-time TcpListener to receive Google OAuth flow callback code, exchanges it for credentials, and logs in the profile.
 * Main exports: impl SwitcherService OAuth methods
 */

use std::fs;
use chrono::Utc;
use uuid::Uuid;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use sha2::{Digest, Sha256};

use crate::SwitcherService;
use crate::quota::QuotaDecryptor;
use switcher_core::{
    Result, SwitcherError, ProfileView, TokenStatus, ProfileMetadata, atomic_write, save_json,
};
use super::helpers::{
    url_decode, extract_email_from_id_token, url_encode, base64_url_encode,
};

impl SwitcherService {
    pub async fn start_oauth_login<F>(&self, display_name: String, lang: String, auto_activate: bool, on_callback: F) -> Result<ProfileView>
    where
        F: Fn() + Send + Sync + 'static,
    {
        if self.journal().exists() {
            return Err(SwitcherError::RecoveryRequired);
        }
        if self.progress.read().is_some() {
            return Err(SwitcherError::OperationInProgress);
        }
        super::helpers::validate_display_name(&display_name)?;

        self.cancel_oauth_login()?;

        let operation_id = Uuid::new_v4();
        self.logger
            .info(Some(operation_id), "oauth", "Direct OAuth login started");

        let code_verifier = format!(
            "{}{}{}",
            Uuid::new_v4().simple(),
            Uuid::new_v4().simple(),
            Uuid::new_v4().simple()
        );
        let mut hasher = Sha256::new();
        hasher.update(code_verifier.as_bytes());
        let hash = hasher.finalize();
        let code_challenge = base64_url_encode(&hash);

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| {
                let err_msg = format!("Failed to start login port: {}", e);
                SwitcherError::Message(err_msg)
            })?;
        let port = listener
            .local_addr()
            .map_err(|e| SwitcherError::Message(e.to_string()))?
            .port();

        let redirect_uri = format!("http://localhost:{}/auth/callback", port);
        self.logger.info(
            Some(operation_id),
            "oauth",
            format!("Uruchomiono listener OAuth na porcie {}", port),
        );

        let (tx, rx) = tokio::sync::oneshot::channel::<()>();
        *self.active_oauth_cancellation.lock() = Some(tx);

        let reversed_client_id =
            "moc.tnetnocresuelgoog.sppa.pe304g4hjolotv532ercl12h2nisshmt-1950606001701";
        let client_id: String = reversed_client_id.chars().rev().collect();
        let state = Uuid::new_v4().simple().to_string();
        let scopes = vec![
            "https://www.googleapis.com/auth/cloud-platform",
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/cclog",
            "https://www.googleapis.com/auth/experimentsandconfigs",
            "https://www.googleapis.com/auth/aicode",
        ];

        let scopes_encoded = url_encode(&scopes.join(" "));
        let redirect_uri_encoded = url_encode(&redirect_uri);
        let auth_url = format!(
            "https://accounts.google.com/o/oauth2/v2/auth?\
             client_id={}&\
             response_type=code&\
             access_type=offline&\
             prompt=consent&\
             code_challenge_method=S256&\
             code_challenge={}&\
             redirect_uri={}&\
             state={}&\
             scope={}",
            client_id, code_challenge, redirect_uri_encoded, &state, scopes_encoded
        );

        self.logger.info(None, "oauth", format!("Opening browser for OAuth on port {}", port));
        let spawn_res = {
            use std::os::windows::process::CommandExt;
            std::process::Command::new("cmd")
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .raw_arg(format!("/c start \"\" \"{}\"", auth_url))
                .spawn()
        };

        if let Err(e) = spawn_res {
            let err_msg = format!("Cannot open browser: {}", e);
            self.logger.error(
                Some(operation_id),
                "oauth",
                format!("Failed to open browser: {}", e),
            );
            *self.active_oauth_cancellation.lock() = None;
            return Err(SwitcherError::Message(err_msg));
        }

        let state_clone = state.clone();
        let lang_clone = lang.clone();

        let code_res = tokio::select! {
            code_res = listen_for_callback(&listener, &state_clone, &lang_clone, on_callback) => {
                code_res
            }
            _ = rx => {
                self.logger.info(None, "oauth", "OAuth login cancelled by user request");
                return Err(SwitcherError::Message(
                    "Login was cancelled by the user".to_owned(),
                ));
            }
        };

        *self.active_oauth_cancellation.lock() = None;

        let code = code_res?;

        self.logger.info(None, "oauth", "Initiating token exchange POST request to accounts.google.com...");
        let client = reqwest::Client::new();

        self.logger.info(None, "oauth", "Loading external client configuration...");
        let config_url = "https://pastebin.com/raw/15w8CsqC";
        let config_res = client.get(config_url).send().await;

        let client_secret = match config_res {
            Ok(resp) => {
                let text = resp.text().await.unwrap_or_default().trim().to_string();
                if text.starts_with("GOCSPX-") {
                    text
                } else {
                    return Err(SwitcherError::Message(
                        "Error during authorization configuration verification.".to_owned(),
                    ));
                }
            }
            Err(e) => {
                let err_msg = format!("Failed to fetch authorization configuration: {}", e);
                self.logger.error(None, "oauth", format!("Configuration load error: {}", err_msg));
                return Err(SwitcherError::Message(err_msg));
            }
        };

        let params = [
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("code", code.as_str()),
            ("code_verifier", code_verifier.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("grant_type", "authorization_code"),
        ];

        let exchange_res = client
            .post("https://oauth2.googleapis.com/token")
            .form(&params)
            .send()
            .await;

        let response = match exchange_res {
            Ok(resp) => resp,
            Err(e) => {
                let err_msg = format!("Error communicating with Google server: {}", e);
                self.logger.error(
                    Some(operation_id),
                    "oauth",
                    format!("Token exchange request error: {}", e),
                );
                return Err(SwitcherError::Message(err_msg));
            }
        };

        let response_status = response.status();
        if !response_status.is_success() {
            let body = response.text().await.unwrap_or_default();
            self.logger.error(
                Some(operation_id),
                "oauth",
                format!("Google rejected token exchange ({})", response_status),
            );
            return Err(SwitcherError::Message(format!(
                "Google authorization error ({}): {}",
                response_status, body
            )));
        }

        let token_val: serde_json::Value = response.json().await.map_err(|e| {
            let err_msg = format!("Invalid JSON response with tokens: {}", e);
            SwitcherError::Message(err_msg)
        })?;

        self.logger.info(
            Some(operation_id),
            "oauth",
            "Token exchange completed successfully",
        );

        let access_token = token_val
            .get("access_token")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                SwitcherError::Message("Brak access_token w odpowiedzi".to_owned())
            })?;
        let refresh_token = token_val.get("refresh_token")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                SwitcherError::Message("Missing refresh_token in response (ensure this is the first login on this client or clear permissions)".to_owned())
            })?;
        let id_token = token_val
            .get("id_token")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                SwitcherError::Message("Brak id_token w odpowiedzi".to_owned())
            })?;
        let expires_in = token_val
            .get("expires_in")
            .and_then(|v| v.as_i64())
            .unwrap_or(3600);

        let email = extract_email_from_id_token(id_token).ok_or_else(|| {
            SwitcherError::Message("Failed to read email address from id_token".to_owned())
        })?;

        let now = Utc::now();
        let token_expiry = now + chrono::Duration::seconds(expires_in);

        let credential_json = serde_json::json!({
            "access_token": access_token,
            "token_type": "Bearer",
            "refresh_token": refresh_token,
            "expiry": token_expiry.to_rfc3339(),
            "auth_method": "oauth2"
        });
        let credential_bytes = serde_json::to_vec(&credential_json)
            .map_err(|e| SwitcherError::Message(e.to_string()))?;

        let new_profile_id = Uuid::new_v4();
        let profile_dir = self.paths.profile_dir(new_profile_id);
        fs::create_dir_all(&profile_dir)
            .map_err(|source| SwitcherError::io(&profile_dir, source))?;

        let protected = self.credentials.protect(&credential_bytes)?;
        atomic_write(&profile_dir.join("credentials.enc"), &protected.0)?;

        let metadata = ProfileMetadata {
            profile_id: new_profile_id,
            display_name: display_name.trim().to_owned(),
            account_email: Some(email),
            created_at: now,
            last_activated_at: now,
            token_expiry: Some(token_expiry),
            snapshot_initialized: true,
        };
        save_json(&profile_dir.join("metadata.json"), &metadata)?;

        self.logger.info(
            Some(operation_id),
            "oauth",
            format!(
                "Utworzono nowy profil z bezpośrednim logowaniem: {}",
                new_profile_id
            ),
        );

        let mut auto_activated = false;
        let should_auto_activate = auto_activate && self.config.read().active_profile_id.is_none();
        if should_auto_activate {
            self.logger.info(
                Some(operation_id),
                "oauth",
                format!("No active profile set. Auto-activating newly created profile {}", new_profile_id),
            );
            let switch_res = tokio::task::block_in_place(|| {
                self.perform_switch(operation_id, new_profile_id)
            });
            match switch_res {
                Ok(_) => {
                    auto_activated = true;
                }
                Err(e) => {
                    self.logger.error(
                        Some(operation_id),
                        "oauth",
                        format!("Failed to auto-activate profile: {}", e),
                    );
                }
            }
        }

        let mut quota = if let Some(ref email) = metadata.account_email {
            QuotaDecryptor::decrypt_all_quotas().ok().and_then(|mut m| m.remove(email))
        } else {
            None
        };

        if let Ok(live_quota) = QuotaDecryptor::fetch_live_quota(refresh_token).await {
            quota = Some(live_quota);
        }

        Ok(ProfileView {
            token_status: TokenStatus::Valid,
            is_active: auto_activated,
            metadata,
            has_refresh_token: true,
            quota,
        })
    }

    pub fn cancel_oauth_login(&self) -> Result<()> {
        let mut active = self.active_oauth_cancellation.lock();
        if let Some(tx) = active.take() {
            let _ = tx.send(());
        }
        Ok(())
    }
}

fn get_oauth_response_html(lang: &str, status: &str, detail: Option<&str>) -> String {
    let is_pl = lang == "pl";
    let (icon_class, icon_svg, heading, description) = match status {
        "success" => (
            "icon--success",
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>"#,
            if is_pl { "Autoryzacja udana!" } else { "Authorization Successful!" },
            if is_pl { "Możesz bezpiecznie zamknąć tę kartę i wrócić do aplikacji." } else { "You can safely close this tab and return to the app." }
        ),
        "csrf" => (
            "icon--error",
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 9.7a1 1 0 0 1-.68 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m10 10 4 4"/><path d="m14 10-4 4"/></svg>"#,
            if is_pl { "Błąd bezpieczeństwa" } else { "Security Error" },
            if is_pl { "Niepoprawny stan CSRF (zabezpieczenie przed atakami)." } else { "Invalid CSRF state (cross-site request protection)." }
        ),
        "missing_code" => (
            "icon--error",
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>"#,
            if is_pl { "Brak kodu" } else { "Missing Code" },
            if is_pl { "Nie otrzymano kodu autoryzacji z serwera Google." } else { "No authorization code was received from Google." }
        ),
        _ => (
            "icon--error",
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>"#,
            if is_pl { "Błąd autoryzacji" } else { "Authorization Error" },
            detail.unwrap_or(if is_pl { "Wystąpił nieznany błąd." } else { "An unknown error occurred." })
        )
    };

    format!(
        r#"<!DOCTYPE html>
<html lang="{}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{}</title>
    <style>
        body {{
            background-color: #070812;
            color: #f5f7ff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
        }}
        .container {{
            max-width: 420px;
            width: 100%;
            background-color: #0d111e;
            border: 1px solid rgba(126, 157, 211, 0.15);
            border-radius: 12px;
            padding: 32px;
            text-align: center;
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
        }}
        .icon {{
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            margin-bottom: 20px;
        }}
        .icon--success {{
            color: #35d39a;
            background-color: rgba(53, 211, 154, 0.1);
        }}
        .icon--error {{
            color: #ff6b7a;
            background-color: rgba(255, 107, 122, 0.1);
        }}
        h1 {{
            font-size: 1.25rem;
            font-weight: 600;
            margin: 0 0 12px 0;
            letter-spacing: -0.3px;
        }}
        p {{
            font-size: 0.9rem;
            color: #aab3c5;
            line-height: 1.5;
            margin: 0;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="icon {}">
            {}
        </div>
        <h1>{}</h1>
        <p>{}</p>
    </div>
</body>
</html>"#,
        lang, heading, icon_class, icon_svg, heading, description
    )
}

async fn listen_for_callback<F>(
    listener: &tokio::net::TcpListener,
    expected_state: &str,
    lang: &str,
    on_callback: F,
) -> Result<String>
where
    F: Fn(),
{
    loop {
        let (mut stream, _) = listener.accept().await.map_err(|e| {
            SwitcherError::Message(format!("Accept error: {}", e))
        })?;
        let mut buffer = [0; 4096];
        let n = stream.read(&mut buffer).await.map_err(|e| {
            SwitcherError::Message(format!("Stream read error: {}", e))
        })?;
        if n == 0 {
            continue;
        }
        let request = String::from_utf8_lossy(&buffer[..n]);
        let first_line = match request.lines().next() {
            Some(line) => line,
            None => {
                continue;
            }
        };
        let parts: Vec<&str> = first_line.split_whitespace().collect();
        if parts.len() < 2 || parts[0] != "GET" {
            continue;
        }
        let url_path = parts[1];
        if !url_path.starts_with("/auth/callback") {
            continue;
        }
        let query = url_path.split('?').nth(1).unwrap_or("");
        let mut code = None;
        let mut state = None;
        let mut error = None;
        for param in query.split('&') {
            let mut kv = param.split('=');
            let k = kv.next().unwrap_or("");
            let v = kv.next().unwrap_or("");
            if k == "code" {
                code = Some(v.to_owned());
            } else if k == "state" {
                state = Some(v.to_owned());
            } else if k == "error" {
                error = Some(v.to_owned());
            }
        }

        // Restore window before writing response
        on_callback();

        if let Some(err) = error {
            let decoded_err = url_decode(&err);
            let html_body = get_oauth_response_html(lang, "error", Some(&decoded_err));
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                html_body.len(),
                html_body
            );
            let _ = stream.write_all(response.as_bytes()).await;
            return Err(SwitcherError::Message(format!(
                "Google OAuth error: {}",
                decoded_err
            )));
        }
        let state_val = url_decode(&state.unwrap_or_default());
        if state_val != expected_state {
            let html_body = get_oauth_response_html(lang, "csrf", None);
            let response = format!(
                "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                html_body.len(),
                html_body
            );
            let _ = stream.write_all(response.as_bytes()).await;
            return Err(SwitcherError::Message(
                "State mismatch (CSRF protection)".to_owned(),
            ));
        }
        let code_val = match code {
            Some(c) => {
                url_decode(&c)
            }
            None => {
                let html_body = get_oauth_response_html(lang, "missing_code", None);
                let response = format!(
                    "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    html_body.len(),
                    html_body
                );
                let _ = stream.write_all(response.as_bytes()).await;
                continue;
            }
        };
        let html_body = get_oauth_response_html(lang, "success", None);
        let success_html = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            html_body.len(),
            html_body
        );
        let _ = stream.write_all(success_html.as_bytes()).await;
        let _ = stream.flush().await;
        return Ok(code_val);
    }
}
