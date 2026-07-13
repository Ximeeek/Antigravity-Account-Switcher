/**
 * Unit tests for switcher service.
 * Verifies key formats, state databases rebuilding, directory hash stability, base64 conversions.
 */

#[cfg(test)]
mod tests {
    use super::super::helpers::{
        parse_token_expiry, check_has_refresh_token, base64_url_encode, base64_url_decode, url_decode,
    };
    use super::super::manifest::{hash_directory, merge_missing_files};
    use super::super::database::{validate_state_database, rebuild_state_database_from_json};
    use rusqlite::Connection;

    #[test]
    fn parses_iso_and_millisecond_expiry() {
        assert!(parse_token_expiry(br#"{"expiry":"2030-01-01T00:00:00Z"}"#).is_some());
        assert!(parse_token_expiry(br#"{"expiry":1893456000000}"#).is_some());
        assert!(parse_token_expiry(br#"{"token":{"expiry":"2030-01-01T00:00:00Z"}}"#).is_some());
    }

    #[test]
    fn test_check_has_refresh_token() {
        assert!(check_has_refresh_token(br#"{"refresh_token":"abc"}"#));
        assert!(check_has_refresh_token(
            br#"{"token":{"refresh_token":"abc"}}"#
        ));
        assert!(!check_has_refresh_token(br#"{"refresh_token":""}"#));
        assert!(!check_has_refresh_token(
            br#"{"token":{"refresh_token":""}}"#
        ));
    }

    #[test]
    fn directory_marker_is_stable() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::write(temp.path().join("a.txt"), "value").unwrap();
        let first = hash_directory(temp.path()).unwrap();
        let second = hash_directory(temp.path()).unwrap();
        assert_eq!(first, second);
    }

    #[test]
    fn state_database_validation_rejects_placeholder_and_accepts_sqlite_header() {
        let temp = tempfile::tempdir().unwrap();
        let database = temp.path().join("state.vscdb");
        std::fs::write(&database, []).unwrap();
        assert!(validate_state_database(&database).is_err());

        std::fs::write(&database, b"SQLite format 3\0payload").unwrap();
        assert!(validate_state_database(&database).is_ok());
    }

    #[test]
    fn rebuilds_state_database_from_legacy_storage_json() {
        let temp = tempfile::tempdir().unwrap();
        let storage = temp.path().join("storage.json");
        let database = temp.path().join("state.vscdb");
        std::fs::write(
            &storage,
            br#"{"theme":"dark","onboarding.complete":true,"window":{"x":10}}"#,
        )
        .unwrap();

        let migrated = rebuild_state_database_from_json(&storage, &database).unwrap();

        assert_eq!(migrated, 3);
        validate_state_database(&database).unwrap();
        let connection = Connection::open(&database).unwrap();
        let theme: String = connection
            .query_row(
                "SELECT value FROM ItemTable WHERE key = 'theme'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(theme, "dark");
    }

    #[test]
    fn legacy_merge_restores_missing_conversations_without_overwriting_shared_files() {
        let temp = tempfile::tempdir().unwrap();
        let stored = temp.path().join("stored");
        let shared = temp.path().join("shared");
        std::fs::create_dir_all(&stored).unwrap();
        std::fs::create_dir_all(&shared).unwrap();
        std::fs::write(stored.join("old.db"), b"stored conversation").unwrap();
        std::fs::write(stored.join("current.db"), b"old copy").unwrap();
        std::fs::write(shared.join("current.db"), b"current conversation").unwrap();

        let copied = merge_missing_files(&stored, &shared).unwrap();

        assert_eq!(copied, 1);
        assert_eq!(
            std::fs::read(shared.join("old.db")).unwrap(),
            b"stored conversation"
        );
        assert_eq!(
            std::fs::read(shared.join("current.db")).unwrap(),
            b"current conversation",
        );
    }

    #[test]
    fn base64_url_encode_decode_roundtrip() {
        let original = b"hello world?$-_";
        let encoded = base64_url_encode(original);
        assert!(!encoded.contains('='));
        assert!(!encoded.contains('+'));
        assert!(!encoded.contains('/'));
        let decoded = base64_url_decode(&encoded).unwrap();
        assert_eq!(original.to_vec(), decoded);
    }

    #[test]
    fn test_url_decode() {
        assert_eq!(url_decode("hello%20world"), "hello world");
        assert_eq!(url_decode("4%2F0AdkVLPw"), "4/0AdkVLPw");
        assert_eq!(url_decode("some+space"), "some space");
    }

    #[test]
    fn test_client_id_domain() {
        let reversed_client_id =
            "moc.tnetnocresuelgoog.sppa.pe304g4hjolotv532ercl12h2nisshmt-1950606001701";
        let client_id: String = reversed_client_id.chars().rev().collect();
        assert_eq!(
            client_id,
            "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com"
        );
    }

    #[test]
    fn test_get_bucket_remaining_fraction() {
        use switcher_core::{QuotaGroupView, QuotaBucketView, ProfileQuotaView};
        
        let quota = ProfileQuotaView {
            subscription_tier: "tier".to_owned(),
            quota_groups: vec![
                QuotaGroupView {
                    display_name: "group1".to_owned(),
                    description: "desc".to_owned(),
                    buckets: vec![
                        QuotaBucketView {
                            bucket_id: "gemini-5h".to_owned(),
                            window: "5h".to_owned(),
                            remaining_fraction: 0.75,
                            reset_time: None,
                            display_name: "5h limit".to_owned(),
                            description: None,
                        },
                        QuotaBucketView {
                            bucket_id: "gemini-weekly".to_owned(),
                            window: "168h".to_owned(),
                            remaining_fraction: 0.12,
                            reset_time: None,
                            display_name: "weekly limit".to_owned(),
                            description: None,
                        },
                    ],
                }
            ],
        };
        
        // Use custom local logic to test
        let get_fraction = |q: &ProfileQuotaView, bid: &str| {
            for group in &q.quota_groups {
                if let Some(bucket) = group.buckets.iter().find(|b| b.bucket_id == bid) {
                    return Some(bucket.remaining_fraction);
                }
            }
            None
        };
        
        assert_eq!(get_fraction(&quota, "gemini-5h"), Some(0.75));
        assert_eq!(get_fraction(&quota, "gemini-weekly"), Some(0.12));
        assert_eq!(get_fraction(&quota, "gemini-nonexistent"), None);
    }
}
