use crate::{Result, SwitchLock, load_json, save_json};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct JournalStore {
    path: PathBuf,
}

impl JournalStore {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn exists(&self) -> bool {
        self.path.exists()
    }

    pub fn read(&self) -> Result<Option<SwitchLock>> {
        if self.exists() {
            load_json(&self.path).map(Some)
        } else {
            Ok(None)
        }
    }

    pub fn write(&self, journal: &SwitchLock) -> Result<()> {
        save_json(&self.path, journal)
    }

    pub fn remove(&self) -> Result<()> {
        if self.exists() {
            std::fs::remove_file(&self.path)
                .map_err(|source| crate::SwitcherError::io(&self.path, source))?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{LockStatus, SwitchStep};
    use uuid::Uuid;

    #[test]
    fn persists_every_mutation_of_the_operation() {
        let temp = tempfile::tempdir().unwrap();
        let store = JournalStore::new(temp.path().join("switcher.lock"));
        let mut lock = SwitchLock::new(Uuid::new_v4(), Uuid::new_v4());
        store.write(&lock).unwrap();
        lock.current_step = SwitchStep::BackupCurrent;
        lock.status = LockStatus::Running;
        store.write(&lock).unwrap();
        assert_eq!(store.read().unwrap().unwrap(), lock);
        store.remove().unwrap();
        assert!(!store.exists());
    }
}

