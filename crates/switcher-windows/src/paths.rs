use std::{
    env,
    path::{Path, PathBuf},
};
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
    pub workspace_storage: PathBuf,
}

impl SwitcherPaths {
    pub fn discover() -> Result<Self> {
        let local = env_path("LOCALAPPDATA")?;
        let root_name = if cfg!(debug_assertions) {
            "AntigravitySwitcherDev"
        } else {
            "AntigravitySwitcher"
        };
        Self::from_root(local.join(root_name))
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
            state_db: roaming
                .join("Antigravity")
                .join("User")
                .join("globalStorage")
                .join("state.vscdb"),
            gemini_root: home.join(".gemini").join("antigravity"),
            workspace_storage: roaming
                .join("Antigravity")
                .join("User")
                .join("workspaceStorage"),
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
                kind: MoveKind::GlobalStorageJson,
                active: self.state_db.with_file_name("storage.json"),
                profile_relative: PathBuf::from("storage.json"),
                required: false,
            },
            ArtifactPath {
                kind: MoveKind::Brain,
                active: self.gemini_root.join("brain"),
                profile_relative: PathBuf::from("brain"),
                required: false,
            },
            ArtifactPath {
                kind: MoveKind::Conversations,
                active: self.gemini_root.join("conversations"),
                profile_relative: PathBuf::from("conversations"),
                required: false,
            },
            ArtifactPath {
                kind: MoveKind::AntigravityState,
                active: self.gemini_root.join("antigravity_state.pbtxt"),
                profile_relative: PathBuf::from("antigravity_state.pbtxt"),
                required: false,
            },
            ArtifactPath {
                kind: MoveKind::Annotations,
                active: self.gemini_root.join("annotations"),
                profile_relative: PathBuf::from("annotations"),
                required: false,
            },
            ArtifactPath {
                kind: MoveKind::ConversationSummaries,
                active: self.gemini_root.join("agyhub_summaries_proto.pb"),
                profile_relative: PathBuf::from("agyhub_summaries_proto.pb"),
                required: false,
            },
            ArtifactPath {
                kind: MoveKind::HtmlArtifacts,
                active: self.gemini_root.join("html_artifacts"),
                profile_relative: PathBuf::from("html_artifacts"),
                required: false,
            },
            ArtifactPath {
                kind: MoveKind::WorkspaceStorage,
                active: self.workspace_storage.clone(),
                profile_relative: PathBuf::from("workspaceStorage"),
                required: false,
            },
        ]
    }

    pub fn validate_same_volume(&self) -> Result<()> {
        for active in [&self.state_db, &self.gemini_root, &self.workspace_storage] {
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

#[cfg(windows)]
fn encode_wide(s: &str) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    std::ffi::OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
fn decode_wide(bytes: &[u16]) -> String {
    let len = bytes.iter().position(|&x| x == 0).unwrap_or(bytes.len());
    String::from_utf16_lossy(&bytes[..len])
}

#[cfg(windows)]
fn detect_from_registry() -> Vec<PathBuf> {
    use windows_sys::Win32::System::Registry::{
        HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE,
    };
    let mut paths = Vec::new();

    // 1. Check Uninstall keys
    let uninstall_keys = [
        "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Antigravity",
        "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Antigravity_is1",
    ];

    for &key in &uninstall_keys {
        if let Some(path) = query_registry_value(HKEY_CURRENT_USER, key, "InstallLocation") {
            paths.push(path);
        }
        if let Some(uninstall_cmd) = query_registry_value(HKEY_CURRENT_USER, key, "UninstallString") {
            if let Some(parent) = uninstall_cmd.parent() {
                paths.push(parent.to_path_buf());
            }
        }
        if let Some(path) = query_registry_value(HKEY_LOCAL_MACHINE, key, "InstallLocation") {
            paths.push(path);
        }
        if let Some(uninstall_cmd) = query_registry_value(HKEY_LOCAL_MACHINE, key, "UninstallString") {
            if let Some(parent) = uninstall_cmd.parent() {
                paths.push(parent.to_path_buf());
            }
        }
    }

    // 2. Check App Paths
    let app_paths = [
        "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Antigravity.exe",
    ];

    for &key in &app_paths {
        if let Some(exe_path) = query_registry_value(HKEY_CURRENT_USER, key, "") {
            if let Some(parent) = exe_path.parent() {
                paths.push(parent.to_path_buf());
            }
        }
        if let Some(exe_path) = query_registry_value(HKEY_LOCAL_MACHINE, key, "") {
            if let Some(parent) = exe_path.parent() {
                paths.push(parent.to_path_buf());
            }
        }
    }

    paths
}

#[cfg(windows)]
fn query_registry_value(hkey_root: windows_sys::Win32::System::Registry::HKEY, subkey: &str, value_name: &str) -> Option<PathBuf> {
    use windows_sys::Win32::System::Registry::{
        RegOpenKeyExW, RegQueryValueExW, RegCloseKey, KEY_READ, REG_SZ, REG_EXPAND_SZ, HKEY
    };
    use std::ptr;

    let subkey_wide = encode_wide(subkey);
    let mut hkey: HKEY = ptr::null_mut();
    let status = unsafe {
        RegOpenKeyExW(
            hkey_root,
            subkey_wide.as_ptr(),
            0,
            KEY_READ,
            &mut hkey,
        )
    };
    if status != 0 {
        return None;
    }

    let value_name_wide = if value_name.is_empty() {
        None
    } else {
        Some(encode_wide(value_name))
    };
    let value_ptr = value_name_wide.as_ref().map(|v| v.as_ptr()).unwrap_or(ptr::null());

    let mut value_type = 0;
    let mut buf_size = 0;
    let status = unsafe {
        RegQueryValueExW(
            hkey,
            value_ptr,
            ptr::null_mut(),
            &mut value_type,
            ptr::null_mut(),
            &mut buf_size,
        )
    };

    if status != 0 || buf_size == 0 {
        unsafe { RegCloseKey(hkey) };
        return None;
    }

    let mut buf = vec![0_u8; buf_size as usize];
    let status = unsafe {
        RegQueryValueExW(
            hkey,
            value_ptr,
            ptr::null_mut(),
            &mut value_type,
            buf.as_mut_ptr(),
            &mut buf_size,
        )
    };

    unsafe { RegCloseKey(hkey) };

    if status != 0 {
        return None;
    }

    if value_type == REG_SZ || value_type == REG_EXPAND_SZ {
        let u16_len = buf_size as usize / 2;
        let u16_slice = unsafe { std::slice::from_raw_parts(buf.as_ptr() as *const u16, u16_len) };
        let path_str = decode_wide(u16_slice);
        let path_str_trimmed = path_str.trim().trim_matches('"');
        if !path_str_trimmed.is_empty() {
            return Some(PathBuf::from(path_str_trimmed));
        }
    }

    None
}

#[cfg(windows)]
fn detect_from_processes() -> Vec<PathBuf> {
    use windows_sys::Win32::{
        Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
        System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
            TH32CS_SNAPPROCESS,
        },
        System::Threading::{
            OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
        },
    };

    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return Vec::new();
    }

    let mut paths = Vec::new();
    let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
    entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
    let mut ok = unsafe { Process32FirstW(snapshot, &mut entry) };
    while ok != 0 {
        let name = decode_wide(&entry.szExeFile);
        let name_lower = name.to_ascii_lowercase();
        if name_lower == "antigravity.exe" {
            let pid = entry.th32ProcessID;
            let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
            if !handle.is_null() {
                let mut buffer = vec![0_u16; 32_768];
                let mut size = buffer.len() as u32;
                let ok_path = unsafe { QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut size) };
                unsafe { CloseHandle(handle) };
                if ok_path != 0 {
                    let full_path = PathBuf::from(decode_wide(&buffer[..size as usize]));
                    if let Some(parent) = full_path.parent() {
                        paths.push(parent.to_path_buf());
                    }
                }
            }
        }
        ok = unsafe { Process32NextW(snapshot, &mut entry) };
    }
    unsafe { CloseHandle(snapshot) };
    paths
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

    #[cfg(windows)]
    {
        candidates.extend(detect_from_registry());
        candidates.extend(detect_from_processes());
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
                Component::Prefix(value) => {
                    Some(value.as_os_str().to_string_lossy().to_ascii_lowercase())
                }
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
