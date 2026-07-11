use std::{env, path::{Path, PathBuf}};
use switcher_core::{MoveKind, Result, SwitcherError};

#[derive(Debug, Clone)]
pub struct ArtifactPath {
    pub kind: MoveKind,
    pub active: PathBuf,
    pub profile_relative: PathBuf,
    pub required: bool,
}

#[derive(Debug, Clone)]
pub struct SwitcherPaths {
    pub root: PathBuf,
    pub profiles: PathBuf,
    pub logs: PathBuf,
    pub log_archive: PathBuf,
    pub config: PathBuf,
    pub lock: PathBuf,
    pub state_db: PathBuf,
    pub gemini_root: PathBuf,
}

impl SwitcherPaths {
    pub fn discover() -> Result<Self> {
        let local = env_path("LOCALAPPDATA")?;
        Self::from_root(local.join("AntigravitySwitcher"))
    }

    pub fn from_root(root: PathBuf) -> Result<Self> {
        let roaming = env_path("APPDATA")?;
        let home = env_path("USERPROFILE")?;
        Ok(Self {
            profiles: root.join("profiles"),
            logs: root.join("logs"),
            log_archive: root.join("logs").join("archive"),
            config: root.join("config.json"),
            lock: root.join("switcher.lock"),
            state_db: roaming.join("Antigravity").join("User").join("globalStorage").join("state.vscdb"),
            gemini_root: home.join(".gemini").join("antigravity"),
            root,
        })
    }

    pub fn ensure(&self) -> Result<()> {
        for path in [&self.root, &self.profiles, &self.logs, &self.log_archive] {
            std::fs::create_dir_all(path).map_err(|source| SwitcherError::io(path, source))?;
        }
        Ok(())
    }

    pub fn profile_dir(&self, id: uuid::Uuid) -> PathBuf {
        self.profiles.join(id.to_string())
    }

    pub fn artifacts(&self) -> Vec<ArtifactPath> {
        vec![
            ArtifactPath {
                kind: MoveKind::StateDatabase,
                active: self.state_db.clone(),
                profile_relative: PathBuf::from("state.vscdb"),
                required: true,
            },
            ArtifactPath {
                kind: MoveKind::StateDatabaseWal,
                active: self.state_db.with_file_name("state.vscdb-wal"),
                profile_relative: PathBuf::from("state.vscdb-wal"),
                required: false,
            },
            ArtifactPath {
                kind: MoveKind::StateDatabaseShm,
                active: self.state_db.with_file_name("state.vscdb-shm"),
                profile_relative: PathBuf::from("state.vscdb-shm"),
                required: false,
            },
            ArtifactPath {
                kind: MoveKind::Brain,
                active: self.gemini_root.join("brain"),
                profile_relative: PathBuf::from("brain"),
                required: true,
            },
            ArtifactPath {
                kind: MoveKind::Conversations,
                active: self.gemini_root.join("conversations"),
                profile_relative: PathBuf::from("conversations"),
                required: true,
            },
            ArtifactPath {
                kind: MoveKind::AntigravityState,
                active: self.gemini_root.join("antigravity_state.pbtxt"),
                profile_relative: PathBuf::from("antigravity_state.pbtxt"),
                required: false,
            },
        ]
    }

    pub fn validate_same_volume(&self) -> Result<()> {
        for active in [&self.state_db, &self.gemini_root] {
            if !same_volume(&self.profiles, active) {
                return Err(SwitcherError::CrossVolume {
                    left: self.profiles.clone(),
                    right: active.to_path_buf(),
                });
            }
        }
        Ok(())
    }
}

fn env_path(name: &str) -> Result<PathBuf> {
    env::var_os(name).map(PathBuf::from).ok_or_else(|| {
        SwitcherError::InvalidConfiguration(format!("Brak zmiennej środowiskowej {name}"))
    })
}

pub fn detect_installations() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(local) = env::var_os("LOCALAPPDATA") {
        let local = PathBuf::from(local);
        candidates.push(local.join("Programs").join("Antigravity"));
        candidates.push(local.join("Antigravity"));
    }
    if let Some(program_files) = env::var_os("ProgramFiles") {
        candidates.push(PathBuf::from(program_files).join("Antigravity"));
    }
    if let Some(program_files_x86) = env::var_os("ProgramFiles(x86)") {
        candidates.push(PathBuf::from(program_files_x86).join("Antigravity"));
    }
    candidates.sort();
    candidates.dedup();
    candidates
        .into_iter()
        .filter(|path| path.join("Antigravity.exe").is_file())
        .collect()
}

fn same_volume(left: &Path, right: &Path) -> bool {
    #[cfg(windows)]
    {
        fn prefix(path: &Path) -> Option<String> {
            use std::path::Component;
            path.components().find_map(|component| match component {
                Component::Prefix(value) => Some(value.as_os_str().to_string_lossy().to_ascii_lowercase()),
                _ => None,
            })
        }
        prefix(left) == prefix(right) && prefix(left).is_some()
    }
    #[cfg(not(windows))]
    {
        let _ = (left, right);
        true
    }
}

