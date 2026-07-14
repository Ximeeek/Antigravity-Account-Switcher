/**
 * WebView2 Runtime installer helper for Windows.
 * Automatically checks if WebView2 is installed, prompts the user,
 * downloads the bootstrapper and runs it if required.
 */

#[cfg(windows)]
use std::ptr;

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
fn query_registry_value(
    hkey_root: windows_sys::Win32::System::Registry::HKEY,
    subkey: &str,
    value_name: &str,
) -> Option<String> {
    use windows_sys::Win32::System::Registry::{
        RegOpenKeyExW, RegQueryValueExW, RegCloseKey, KEY_READ, REG_SZ, REG_EXPAND_SZ, HKEY
    };

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
        let val_str = decode_wide(u16_slice);
        let val_str_trimmed = val_str.trim().trim_matches('"');
        if !val_str_trimmed.is_empty() {
            return Some(val_str_trimmed.to_string());
        }
    }

    None
}

#[cfg(windows)]
fn is_webview2_installed() -> bool {
    let keys = [
        (windows_sys::Win32::System::Registry::HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"),
        (windows_sys::Win32::System::Registry::HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"),
        (windows_sys::Win32::System::Registry::HKEY_CURRENT_USER, r"Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"),
    ];
    for (root, subkey) in keys {
        if query_registry_value(root, subkey, "pv").is_some() {
            return true;
        }
    }
    false
}

#[cfg(windows)]
pub async fn check_and_install_webview2() -> Result<(), String> {
    if is_webview2_installed() {
        return Ok(());
    }

    // Determine system language
    let is_polish = unsafe {
        windows_sys::Win32::Globalization::GetUserDefaultUILanguage() == 0x0415
    };

    // MessageBox Title & Text
    let (title, prompt) = if is_polish {
        (
            "Wymagany składnik WebView2",
            "Ta aplikacja wymaga biblioteki Microsoft Edge WebView2 do prawidłowego działania.\n\nCzy chcesz ją teraz pobrać i zainstalować?",
        )
    } else {
        (
            "WebView2 Runtime Required",
            "This application requires the Microsoft Edge WebView2 Runtime to function properly.\n\nWould you like to download and install it now?",
        )
    };

    use windows_sys::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, MB_ICONQUESTION, MB_YESNO, IDYES, MB_ICONERROR, MB_OK, MB_ICONINFORMATION
    };

    let title_wide = encode_wide(title);
    let prompt_wide = encode_wide(prompt);

    let choice = unsafe {
        MessageBoxW(
            ptr::null_mut(),
            prompt_wide.as_ptr(),
            title_wide.as_ptr(),
            MB_YESNO | MB_ICONQUESTION,
        )
    };

    if choice != IDYES {
        std::process::exit(0);
    }

    // Notify user about download starting
    let (dl_title, dl_msg) = if is_polish {
        (
            "Pobieranie instalatora",
            "Pobieranie instalatora WebView2 w tle. Proszę czekać na uruchomienie oficjalnego instalatora...",
        )
    } else {
        (
            "Downloading Installer",
            "Downloading WebView2 installer in the background. Please wait for the official installer to launch...",
        )
    };
    let dl_title_wide = encode_wide(dl_title);
    let dl_msg_wide = encode_wide(dl_msg);

    unsafe {
        MessageBoxW(
            ptr::null_mut(),
            dl_msg_wide.as_ptr(),
            dl_title_wide.as_ptr(),
            MB_OK | MB_ICONINFORMATION,
        );
    }

    // Download the installer to temp directory
    let temp_dir = std::env::temp_dir();
    let installer_path = temp_dir.join("MicrosoftEdgeWebview2Setup.exe");

    let client = reqwest::Client::new();
    let url = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

    let response = client.get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to send download request: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download request failed with status: {}", response.status()));
    }

    let bytes = response.bytes().await.map_err(|e| format!("Failed to read response bytes: {}", e))?;
    std::fs::write(&installer_path, bytes).map_err(|e| format!("Failed to save installer file: {}", e))?;

    // Execute the installer
    let status = std::process::Command::new(&installer_path)
        .status()
        .map_err(|e| format!("Failed to execute installer: {}", e))?;

    // Cleanup installer
    let _ = std::fs::remove_file(&installer_path);

    if !status.success() {
        let (err_title, err_msg) = if is_polish {
            (
                "Instalacja nie powiodła się",
                "Instalacja WebView2 została anulowana lub nie powiodła się. Aplikacja zostanie zamknięta.",
            )
        } else {
            (
                "Installation Failed",
                "WebView2 installation was cancelled or failed. The application will close.",
            )
        };
        let err_title_wide = encode_wide(err_title);
        let err_msg_wide = encode_wide(err_msg);
        unsafe {
            MessageBoxW(
                ptr::null_mut(),
                err_msg_wide.as_ptr(),
                err_title_wide.as_ptr(),
                MB_ICONERROR | MB_OK,
            );
        }
        std::process::exit(1);
    }

    // Verify it is actually installed now
    if !is_webview2_installed() {
        let (err_title, err_msg) = if is_polish {
            (
                "Brak biblioteki",
                "Po zakończeniu instalacji nadal nie wykryto WebView2 w systemie. Aplikacja zostanie zamknięta.",
            )
        } else {
            (
                "Runtime Missing",
                "WebView2 Runtime was not detected even after running the installer. The application will close.",
            )
        };
        let err_title_wide = encode_wide(err_title);
        let err_msg_wide = encode_wide(err_msg);
        unsafe {
            MessageBoxW(
                ptr::null_mut(),
                err_msg_wide.as_ptr(),
                err_title_wide.as_ptr(),
                MB_ICONERROR | MB_OK,
            );
        }
        std::process::exit(1);
    }

    Ok(())
}

#[cfg(not(windows))]
pub async fn check_and_install_webview2() -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
pub fn check_single_instance() {
    use windows_sys::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS, HANDLE};
    use windows_sys::Win32::System::Threading::CreateMutexW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_OK, MB_ICONERROR};

    let mutex_name: Vec<u16> = "Local\\AntigravityAccountSwitcherUniqueMutexLockName\0".encode_utf16().collect();

    unsafe {
        let handle: HANDLE = CreateMutexW(ptr::null(), 0, mutex_name.as_ptr());
        if handle != ptr::null_mut() {
            let err = GetLastError();
            if err == ERROR_ALREADY_EXISTS {
                let is_polish = windows_sys::Win32::Globalization::GetUserDefaultUILanguage() == 0x0415;
                let (title, msg) = if is_polish {
                    (
                        "Aplikacja już działa",
                        "Inna instancja Antigravity Account Switcher jest już uruchomiona.",
                    )
                } else {
                    (
                        "Application Already Running",
                        "Another instance of Antigravity Account Switcher is already running.",
                    )
                };

                let title_wide = encode_wide(title);
                let msg_wide = encode_wide(msg);

                MessageBoxW(
                    ptr::null_mut(),
                    msg_wide.as_ptr(),
                    title_wide.as_ptr(),
                    MB_OK | MB_ICONERROR,
                );

                std::process::exit(0);
            }
        }
    }
}

#[cfg(not(windows))]
pub fn check_single_instance() {}
