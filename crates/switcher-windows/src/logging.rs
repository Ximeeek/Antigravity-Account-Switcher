use chrono::Utc;
use parking_lot::Mutex;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::Arc,
};
use switcher_core::{Result, SwitcherError, redact_diagnostic_line};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct AuditLogger {
    path: PathBuf,
    archive: PathBuf,
    write_lock: Arc<Mutex<()>>,
}

impl AuditLogger {
    pub fn new(path: PathBuf, archive: PathBuf) -> Result<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|source| SwitcherError::io(parent, source))?;
        }
        fs::create_dir_all(&archive).map_err(|source| SwitcherError::io(&archive, source))?;
        let logger = Self {
            path,
            archive,
            write_lock: Arc::new(Mutex::new(())),
        };
        logger.rotate_if_needed()?;
        logger.cleanup_archives()?;
        Ok(logger)
    }

    pub fn debug(&self, op: Option<Uuid>, component: &str, message: impl AsRef<str>) {
        self.write("DEBUG", op, component, message.as_ref());
    }

    pub fn info(&self, op: Option<Uuid>, component: &str, message: impl AsRef<str>) {
        self.write("INFO", op, component, message.as_ref());
    }

    pub fn warn(&self, op: Option<Uuid>, component: &str, message: impl AsRef<str>) {
        self.write("WARN", op, component, message.as_ref());
    }

    pub fn error(&self, op: Option<Uuid>, component: &str, message: impl AsRef<str>) {
        self.write("ERROR", op, component, message.as_ref());
    }

    pub fn tail(&self, max_lines: usize) -> Result<Vec<String>> {
        if !self.path.exists() {
            return Ok(Vec::new());
        }
        let value = fs::read_to_string(&self.path)
            .map_err(|source| SwitcherError::io(&self.path, source))?;
        let lines: Vec<_> = value.lines().collect();
        Ok(lines[lines.len().saturating_sub(max_lines)..]
            .iter()
            .map(|line| redact_diagnostic_line(line))
            .collect())
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn write(&self, level: &str, op: Option<Uuid>, component: &str, message: &str) {
        let _guard = self.write_lock.lock();
        let safe_message = redact_diagnostic_line(message).replace(['\r', '\n'], " ");
        let operation = op.map(|value| value.to_string()).unwrap_or_else(|| "-".to_owned());
        let line = format!(
            "[{}] [{}] [op:{}] [{}] {}\n",
            Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            level,
            operation,
            component,
            safe_message
        );
        eprint!("{line}");
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&self.path) {
            let _ = file.write_all(line.as_bytes());
            let _ = file.flush();
        }
    }

    fn rotate_if_needed(&self) -> Result<()> {
        let Ok(metadata) = fs::metadata(&self.path) else {
            return Ok(());
        };
        if metadata.len() < 10 * 1024 * 1024 {
            return Ok(());
        }
        let name = format!("switcher-{}.log", Utc::now().format("%Y%m%d-%H%M%S"));
        let destination = self.archive.join(name);
        fs::rename(&self.path, &destination).map_err(|source| SwitcherError::io(&destination, source))
    }

    fn cleanup_archives(&self) -> Result<()> {
        let mut entries: Vec<_> = fs::read_dir(&self.archive)
            .map_err(|source| SwitcherError::io(&self.archive, source))?
            .filter_map(std::result::Result::ok)
            .filter(|entry| entry.path().extension().and_then(|value| value.to_str()) == Some("log"))
            .collect();
        entries.sort_by_key(|entry| entry.metadata().and_then(|meta| meta.modified()).ok());
        while entries.len() > 20 {
            let entry = entries.remove(0);
            let _ = fs::remove_file(entry.path());
        }
        Ok(())
    }
}
