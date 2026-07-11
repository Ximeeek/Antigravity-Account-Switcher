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
    output
}

fn looks_like_email(value: &str) -> bool {
    let value = value.trim_matches(|c: char| !c.is_ascii_alphanumeric() && !matches!(c, '@' | '.' | '_' | '-' | '+'));
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
}

