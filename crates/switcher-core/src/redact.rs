use std::path::Path;

pub fn redact_diagnostic_line(line: &str) -> String {
    let mut output = String::with_capacity(line.len());
    for word in line.split_inclusive(char::is_whitespace) {
        let trimmed = word.trim_end_matches(char::is_whitespace);
        let suffix = &word[trimmed.len()..];
        let lowered = trimmed.to_ascii_lowercase();
        if lowered.starts_with("ya29.")
            || lowered.starts_with("1//")
            || lowered.contains("refresh_token")
            || lowered.contains("access_token")
            || lowered.starts_with("bearer")
        {
            output.push_str("[REDACTED]");
        } else if looks_like_email(trimmed) {
            output.push_str("[EMAIL_REDACTED]");
        } else {
            output.push_str(trimmed);
        }
        output.push_str(suffix);
    }
    for key in [
        "access_token",
        "refresh_token",
        "id_token",
        "client_secret",
        "code_challenge",
        "code",
        "state",
    ] {
        output = redact_assignment(&output, key);
    }
    output
}

fn redact_assignment(input: &str, key: &str) -> String {
    let marker = format!("{key}=");
    let mut output = String::with_capacity(input.len());
    let mut remaining = input;
    while let Some(index) = remaining.find(&marker) {
        let value_start = index + marker.len();
        output.push_str(&remaining[..value_start]);
        output.push_str("[REDACTED]");
        let value_end = remaining[value_start..]
            .find(|character: char| character == '&' || character.is_whitespace())
            .map(|offset| value_start + offset)
            .unwrap_or(remaining.len());
        remaining = &remaining[value_end..];
    }
    output.push_str(remaining);
    output
}

fn looks_like_email(value: &str) -> bool {
    let value = value.trim_matches(|c: char| {
        !c.is_ascii_alphanumeric() && !matches!(c, '@' | '.' | '_' | '-' | '+')
    });
    let Some((local, domain)) = value.split_once('@') else {
        return false;
    };
    !local.is_empty() && domain.contains('.') && !domain.ends_with('.')
}

pub fn sanitize_path(path: &Path) -> String {
    let raw = path.to_string_lossy();
    let username = std::env::var("USERNAME").ok();
    match username.filter(|value| !value.is_empty()) {
        Some(value) => raw.replace(&value, "[USER]"),
        None => raw.into_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_tokens_and_emails() {
        let line = "access_token=ya29.secret owner=user@example.com next=ok";
        let redacted = redact_diagnostic_line(line);
        assert!(!redacted.contains("ya29"));
        assert!(!redacted.contains("user@example.com"));
        assert!(redacted.contains("next=ok"));
    }

    #[test]
    fn removes_oauth_query_parameters() {
        let line = "GET /auth/callback?state=csrf-value&code=authorization-code HTTP/1.1";
        let redacted = redact_diagnostic_line(line);
        assert!(!redacted.contains("csrf-value"));
        assert!(!redacted.contains("authorization-code"));
        assert!(redacted.contains("state=[REDACTED]"));
        assert!(redacted.contains("code=[REDACTED]"));
    }
}
