/**
 * Database management and migrations.
 * Handles validation of the global state.vscdb SQLite database, and migration/recovery from legacy storage.json.
 * Main exports: rebuild_state_database_from_json, validate_state_database
 */

use std::path::Path;
use rusqlite::Connection;
use switcher_core::{Result, SwitcherError};

pub(crate) fn rebuild_state_database_from_json(source: &Path, destination: &Path) -> Result<usize> {
    let raw = std::fs::read(source).map_err(|e| SwitcherError::io(source, e))?;
    let data: serde_json::Value = serde_json::from_slice(&raw)
        .map_err(|e| SwitcherError::Message(format!("Invalid JSON format: {}", e)))?;
    let map = data
        .as_object()
        .ok_or_else(|| SwitcherError::Message("Root JSON element must be an object".to_owned()))?;

    let mut connection = Connection::open(destination)
        .map_err(|e| SwitcherError::Message(format!("SQLite database creation error: {}", e)))?;
    let tx = connection
        .transaction()
        .map_err(|e| SwitcherError::Message(format!("SQLite transaction error: {}", e)))?;

    tx.execute(
        "CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value TEXT)",
        [],
    )
    .map_err(|e| SwitcherError::Message(format!("CREATE TABLE error: {}", e)))?;

    let mut inserted = 0;
    let mut stmt = tx
        .prepare("INSERT INTO ItemTable (key, value) VALUES (?1, ?2)")
        .map_err(|e| SwitcherError::Message(format!("Prepare statement error: {}", e)))?;

    for (k, v) in map {
        let val_str = match v {
            serde_json::Value::String(s) => s.clone(),
            _ => v.to_string(),
        };
        stmt.execute(rusqlite::params![k, val_str])
            .map_err(|e| SwitcherError::Message(format!("Error writing key {}: {}", k, e)))?;
        inserted += 1;
    }
    drop(stmt);
    tx.commit()
        .map_err(|e| SwitcherError::Message(format!("Transaction commit error: {}", e)))?;
    Ok(inserted)
}

pub(crate) fn validate_state_database(path: &Path) -> Result<()> {
    if !path.is_file() {
        return Err(SwitcherError::Message(format!(
            "Missing global state database file: {}",
            path.display()
        )));
    }
    let mut file = std::fs::File::open(path).map_err(|e| SwitcherError::io(path, e))?;
    let mut header = [0; 16];
    use std::io::Read;
    file.read_exact(&mut header)
        .map_err(|e| SwitcherError::io(path, e))?;
    if &header[..15] != b"SQLite format 3" {
        return Err(SwitcherError::Message(
            "Invalid SQLite header - file may be corrupted".to_owned(),
        ));
    }
    Ok(())
}
