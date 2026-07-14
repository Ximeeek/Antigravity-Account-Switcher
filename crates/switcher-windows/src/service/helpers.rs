/**
 * Service helpers and utilities.
 * Includes base64 URL coding, URL encoding/decoding, token parsers, and display name validators.
 * Main exports: base64_url_encode, base64_url_decode, url_encode, url_decode, extract_email_from_id_token, try_parse_email_from_credential, parse_token_expiry, check_has_refresh_token, parse_refresh_token, windows_version, read_antigravity_version, validate_display_name
 */

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use chrono::{DateTime, Utc};
use serde_json::Value;
use std::path::Path;
use switcher_core::{Result, SwitcherError};

pub(crate) fn base64_url_encode(input: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(input)
}

pub(crate) fn base64_url_decode(input: &str) -> std::result::Result<Vec<u8>, base64::DecodeError> {
    URL_SAFE_NO_PAD.decode(input)
}

pub(crate) fn url_encode(input: &str) -> String {
    let mut encoded = String::new();
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                encoded.push(byte as char);
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    encoded
}

pub(crate) fn url_decode(input: &str) -> String {
    let mut decoded = String::new();
    let mut chars = input.chars();
    while let Some(c) = chars.next() {
        if c == '%' {
            let h1 = chars.next();
            let h2 = chars.next();
            if let (Some(c1), Some(c2)) = (h1, h2) {
                if let Ok(byte) = u8::from_str_radix(&format!("{}{}", c1, c2), 16) {
                    decoded.push(byte as char);
                    continue;
                }
            }
            decoded.push('%');
            if let Some(c1) = h1 {
                decoded.push(c1);
            }
            if let Some(c2) = h2 {
                decoded.push(c2);
            }
        } else if c == '+' {
            decoded.push(' ');
        } else {
            decoded.push(c);
        }
    }
    decoded
}

pub(crate) fn extract_email_from_id_token(id_token: &str) -> Option<String> {
    let parts: Vec<&str> = id_token.split('.').collect();
    if parts.len() < 2 {
        return None;
    }
    let payload_b64 = parts[1];
    let decoded = base64_url_decode(payload_b64).ok()?;
    let value: serde_json::Value = serde_json::from_slice(&decoded).ok()?;
    value
        .get("email")
        .and_then(|v| v.as_str())
        .map(|s| s.to_owned())
}

pub(crate) fn try_parse_email_from_credential(bytes: &[u8]) -> Option<String> {
    let value: Value = serde_json::from_slice(bytes).ok()?;
    
    // Try root fields
    for field in &["email", "account_email", "account", "accountName", "username", "user_email"] {
        if let Some(email) = value.get(field).and_then(|v| v.as_str()) {
            if email.contains('@') {
                return Some(email.to_owned());
            }
        }
    }
    
    // Try nested fields under "token"
    if let Some(token_val) = value.get("token") {
        for field in &["email", "account_email", "account", "accountName", "username", "user_email"] {
            if let Some(email) = token_val.get(field).and_then(|v| v.as_str()) {
                if email.contains('@') {
                    return Some(email.to_owned());
                }
            }
        }
        
        // Try id_token inside token object
        if let Some(id_token) = token_val.get("id_token").and_then(|v| v.as_str()) {
            if let Some(email) = extract_email_from_id_token(id_token) {
                return Some(email);
            }
        }
    }
    
    // Try id_token in root object
    if let Some(id_token) = value.get("id_token").and_then(|v| v.as_str()) {
        if let Some(email) = extract_email_from_id_token(id_token) {
            return Some(email);
        }
    }
    
    None
}

pub(crate) fn parse_token_expiry(bytes: &[u8]) -> Option<DateTime<Utc>> {
    let value: Value = serde_json::from_slice(bytes).ok()?;
    let target = if let Some(inner) = value.get("token").filter(|t| t.is_object()) {
        inner
    } else {
        &value
    };
    let expiry = target.get("expiry").or_else(|| target.get("expires_at"))?;
    if let Some(text) = expiry.as_str() {
        if let Ok(value) = DateTime::parse_from_rfc3339(text) {
            return Some(value.with_timezone(&Utc));
        }
        if let Ok(number) = text.parse::<i64>() {
            return timestamp_to_datetime(number);
        }
    }
    expiry.as_i64().and_then(timestamp_to_datetime)
}

pub(crate) fn check_has_refresh_token(bytes: &[u8]) -> bool {
    let value: Value = match serde_json::from_slice(bytes) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let target = if let Some(inner) = value.get("token").filter(|t| t.is_object()) {
        inner
    } else {
        &value
    };
    target
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .map(|s| !s.is_empty())
        .unwrap_or(false)
}

pub(crate) fn parse_refresh_token(bytes: &[u8]) -> Option<String> {
    let value: Value = serde_json::from_slice(bytes).ok()?;
    let target = if let Some(inner) = value.get("token").filter(|t| t.is_object()) {
        inner
    } else {
        &value
    };
    target.get("refresh_token").and_then(|v| v.as_str()).map(|s| s.to_owned())
}

pub(crate) fn timestamp_to_datetime(value: i64) -> Option<DateTime<Utc>> {
    let seconds = if value > 10_000_000_000 {
        value / 1_000
    } else {
        value
    };
    DateTime::<Utc>::from_timestamp(seconds, 0)
}

#[allow(dead_code)]
pub(crate) fn read_antigravity_version(installation: &Path) -> Option<String> {
    let exe_path = installation.join("Antigravity.exe");
    if !exe_path.exists() {
        return None;
    }

    // Attempt to read via PowerShell (fast, native on Windows)
    let output = std::process::Command::new("powershell")
        .arg("-NoProfile")
        .arg("-Command")
        .arg(format!(
            "(Get-Item '{}').VersionInfo.ProductVersion",
            exe_path.to_string_lossy().replace('\'', "''")
        ))
        .output()
        .ok()?;

    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout).trim().to_owned();
        if !version.is_empty() {
            return Some(version);
        }
    }

    // Fallback if PowerShell query fails
    let package = installation.join("resources").join("app.asar");
    if package.exists() {
        Some("detected (unknown version)".to_owned())
    } else {
        None
    }
}

#[allow(dead_code)]
pub(crate) fn windows_version() -> String {
    std::env::var("OS").unwrap_or_else(|_| "Windows (unknown version)".to_owned())
}

pub(crate) fn validate_display_name(name: &str) -> Result<()> {
    let length = name.trim().chars().count();
    if !(1..=80).contains(&length) {
        Err(SwitcherError::InvalidConfiguration(
            "Profile name must be between 1 and 80 characters".to_owned(),
        ))
    } else {
        Ok(())
    }
}
