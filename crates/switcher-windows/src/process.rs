use crate::{AuditLogger, SwitcherPaths};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    process::Command,
    thread,
    time::{Duration, Instant},
};
use switcher_core::{Result, SwitcherError};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AntigravityProcess {
    pub pid: u32,
    pub parent_pid: u32,
    pub name: String,
    pub executable_path: Option<PathBuf>,
}

#[derive(Debug, Clone)]
pub struct ProcessManager {
    installation_path: PathBuf,
    logger: AuditLogger,
}

impl ProcessManager {
    pub fn new(installation_path: PathBuf, logger: AuditLogger) -> Self {
        Self { installation_path, logger }
    }

    pub fn installation_path(&self) -> &Path {
        &self.installation_path
    }

    pub fn enumerate(&self) -> Result<Vec<AntigravityProcess>> {
        #[cfg(windows)]
        {
            enumerate_windows_processes(&self.installation_path)
        }
        #[cfg(not(windows))]
        {
            Err(SwitcherError::UnsupportedPlatform)
        }
    }

    pub fn is_running(&self) -> bool {
        self.enumerate().map(|items| !items.is_empty()).unwrap_or(false)
    }

    pub fn close_all(&self, operation_id: Uuid) -> Result<()> {
        let processes = self.enumerate()?;
        if processes.is_empty() {
            self.logger.info(Some(operation_id), "process", "Brak uruchomionych procesów Antigravity");
            return Ok(());
        }
        for process in &processes {
            self.logger.info(
                Some(operation_id),
                "process",
                format!("Closing process pid={} name={}", process.pid, process.name),
            );
        }
        #[cfg(windows)]
        request_graceful_close(&processes);

        let deadline = Instant::now() + Duration::from_secs(8);
        while Instant::now() < deadline {
            let remaining = self.enumerate()?;
            if remaining.is_empty() {
                for process in &processes {
                    self.logger.info(
                        Some(operation_id),
                        "process",
                        format!("Process pid={} closed gracefully", process.pid),
                    );
                }
                return Ok(());
            }
            thread::sleep(Duration::from_millis(200));
        }

        let remaining = self.enumerate()?;
        for process in &remaining {
            #[cfg(windows)]
            terminate_process(process.pid).map_err(|error| {
                self.logger.error(
                    Some(operation_id),
                    "process",
                    format!("Force-kill failed pid={}: {error}", process.pid),
                );
                SwitcherError::ProcessShutdown(format!("pid={} ({})", process.pid, process.name))
            })?;
            self.logger.warn(
                Some(operation_id),
                "process",
                format!("Process pid={} force-killed after timeout", process.pid),
            );
        }

        thread::sleep(Duration::from_millis(250));
        if self.enumerate()?.is_empty() {
            Ok(())
        } else {
            Err(SwitcherError::ProcessShutdown(
                "część procesów pozostała aktywna po force-kill".to_owned(),
            ))
        }
    }

    pub fn wait_until_unlocked(&self, paths: &SwitcherPaths, operation_id: Uuid) -> Result<()> {
        let checks: Vec<PathBuf> = paths
            .artifacts()
            .into_iter()
            .map(|artifact| artifact.active)
            .filter(|path| path.exists())
            .collect();
        let delays = [200_u64, 400, 800, 1_600, 3_200];
        for (index, delay) in delays.into_iter().enumerate() {
            let mut blocked = None;
            for path in &checks {
                self.logger.debug(
                    Some(operation_id),
                    "process",
                    format!("File lock check attempt {}/5 for {}", index + 1, path.display()),
                );
                if !can_open_exclusive(path) {
                    blocked = Some(path.clone());
                    break;
                }
            }
            if blocked.is_none() {
                return Ok(());
            }
            if index < 4 {
                thread::sleep(Duration::from_millis(delay));
            } else {
                return Err(SwitcherError::FilesLocked(blocked.unwrap()));
            }
        }
        Ok(())
    }

    pub fn launch(&self, operation_id: Option<Uuid>) -> Result<u32> {
        let executable = self.installation_path.join("Antigravity.exe");
        if !executable.is_file() {
            return Err(SwitcherError::InvalidConfiguration(format!(
                "Nie znaleziono {}",
                executable.display()
            )));
        }
        self.logger.info(
            operation_id,
            "process",
            format!(
                "Launching Antigravity executable={} working_directory={} arguments=[]",
                switcher_core::sanitize_path(&executable),
                switcher_core::sanitize_path(&self.installation_path),
            ),
        );
        let child = Command::new(&executable)
            .current_dir(&self.installation_path)
            .spawn()
            .map_err(|source| SwitcherError::io(&executable, source))?;
        let pid = child.id();
        self.logger.info(
            operation_id,
            "process",
            format!("Antigravity relaunched, pid={pid}"),
        );
        Ok(pid)
    }
}

#[cfg(windows)]
fn enumerate_windows_processes(installation_path: &Path) -> Result<Vec<AntigravityProcess>> {
    use std::mem::{size_of, zeroed};
    use windows_sys::Win32::{
        Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
        System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
            TH32CS_SNAPPROCESS,
        },
    };

    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return Err(SwitcherError::Windows(format!(
            "CreateToolhelp32Snapshot: {}",
            std::io::Error::last_os_error()
        )));
    }
    let mut raw = Vec::new();
    let mut entry: PROCESSENTRY32W = unsafe { zeroed() };
    entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
    let mut ok = unsafe { Process32FirstW(snapshot, &mut entry) };
    while ok != 0 {
        let name = utf16z(&entry.szExeFile);
        let path = query_process_path(entry.th32ProcessID);
        raw.push(AntigravityProcess {
            pid: entry.th32ProcessID,
            parent_pid: entry.th32ParentProcessID,
            name,
            executable_path: path,
        });
        ok = unsafe { Process32NextW(snapshot, &mut entry) };
    }
    unsafe { CloseHandle(snapshot) };

    let install = installation_path.to_string_lossy().to_ascii_lowercase();
    let mut selected: HashSet<u32> = raw
        .iter()
        .filter(|process| {
            let name = process.name.to_ascii_lowercase();
            let by_name = matches!(name.as_str(), "antigravity.exe" | "language_server.exe");
            let by_path = process
                .executable_path
                .as_ref()
                .map(|path| path.to_string_lossy().to_ascii_lowercase().starts_with(&install))
                .unwrap_or(false);
            by_name || by_path
        })
        .map(|process| process.pid)
        .collect();

    loop {
        let before = selected.len();
        for process in &raw {
            if selected.contains(&process.parent_pid) {
                selected.insert(process.pid);
            }
        }
        if selected.len() == before {
            break;
        }
    }
    Ok(raw
        .into_iter()
        .filter(|process| selected.contains(&process.pid))
        .collect())
}

#[cfg(windows)]
fn query_process_path(pid: u32) -> Option<PathBuf> {
    use windows_sys::Win32::{
        Foundation::CloseHandle,
        System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW},
    };
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle.is_null() {
        return None;
    }
    let mut buffer = vec![0_u16; 32_768];
    let mut size = buffer.len() as u32;
    let ok = unsafe { QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut size) };
    unsafe { CloseHandle(handle) };
    if ok == 0 {
        None
    } else {
        Some(PathBuf::from(String::from_utf16_lossy(&buffer[..size as usize])))
    }
}

#[cfg(windows)]
fn utf16z(value: &[u16]) -> String {
    let length = value.iter().position(|item| *item == 0).unwrap_or(value.len());
    String::from_utf16_lossy(&value[..length])
}

#[cfg(windows)]
fn request_graceful_close(processes: &[AntigravityProcess]) {
    use windows_sys::Win32::{
        Foundation::{BOOL, HWND, LPARAM},
        UI::WindowsAndMessaging::{
            EnumWindows, GetWindowThreadProcessId, SMTO_ABORTIFHUNG, SendMessageTimeoutW, WM_CLOSE,
        },
    };
    unsafe extern "system" fn callback(window: HWND, data: LPARAM) -> BOOL {
        let pids = unsafe { &*(data as *const HashSet<u32>) };
        let mut pid = 0_u32;
        unsafe { GetWindowThreadProcessId(window, &mut pid) };
        if pids.contains(&pid) {
            let mut result = 0_usize;
            unsafe {
                SendMessageTimeoutW(window, WM_CLOSE, 0, 0, SMTO_ABORTIFHUNG, 1_000, &mut result);
            }
        }
        1
    }
    let pids: HashSet<_> = processes.iter().map(|process| process.pid).collect();
    unsafe { EnumWindows(Some(callback), &pids as *const HashSet<u32> as isize) };
}

#[cfg(windows)]
fn terminate_process(pid: u32) -> Result<()> {
    use windows_sys::Win32::{
        Foundation::CloseHandle,
        System::Threading::{OpenProcess, PROCESS_TERMINATE, TerminateProcess},
    };
    let handle = unsafe { OpenProcess(PROCESS_TERMINATE, 0, pid) };
    if handle.is_null() {
        return Err(SwitcherError::Windows(format!(
            "OpenProcess({pid}): {}",
            std::io::Error::last_os_error()
        )));
    }
    let ok = unsafe { TerminateProcess(handle, 1) };
    unsafe { CloseHandle(handle) };
    if ok == 0 {
        Err(SwitcherError::Windows(format!(
            "TerminateProcess({pid}): {}",
            std::io::Error::last_os_error()
        )))
    } else {
        Ok(())
    }
}

fn can_open_exclusive(path: &Path) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::{
            Foundation::{CloseHandle, INVALID_HANDLE_VALUE, GENERIC_READ, GENERIC_WRITE},
            Storage::FileSystem::{
                CreateFileW, FILE_FLAG_BACKUP_SEMANTICS, OPEN_EXISTING,
            },
        };
        let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
        wide.push(0);
        let handle = unsafe {
            CreateFileW(
                wide.as_ptr(),
                GENERIC_READ | GENERIC_WRITE,
                0,
                std::ptr::null(),
                OPEN_EXISTING,
                if path.is_dir() { FILE_FLAG_BACKUP_SEMANTICS } else { 0 },
                std::ptr::null_mut(),
            )
        };
        if handle == INVALID_HANDLE_VALUE {
            false
        } else {
            unsafe { CloseHandle(handle) };
            true
        }
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        true
    }
}
