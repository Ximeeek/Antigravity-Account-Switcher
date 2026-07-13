/**
 * Uninstall and Wipe utilities.
 * Handles system clean-up by spawning a detached PowerShell script that waits for the
 * app to exit, removes cache directories, deletes registry keys, clears active credentials,
 * and either relaunches the app (wipe) or deletes the executable (uninstall).
 */

use std::process::Command;
use std::os::windows::process::CommandExt;

// CREATE_NO_WINDOW flag for Windows process creation (0x08000000)
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Performs a complete wipe of application cache, config files, registry entries,
/// credentials, and then restarts the application.
pub fn wipe_app_data_and_relaunch() -> Result<(), String> {
    let current_exe = std::env::current_exe()
        .map_err(|e| format!("Failed to get current executable path: {}", e))?;
    let exe_path = current_exe.to_string_lossy().to_string();

    let script = format!(
        "Start-Sleep -Seconds 2; \
         Remove-Item -Path 'HKCU:\\Software\\com.ximeeek.antigravity-account-switcher' -Recurse -ErrorAction SilentlyContinue; \
         Remove-Item -Path 'HKLM:\\Software\\com.ximeeek.antigravity-account-switcher' -Recurse -ErrorAction SilentlyContinue; \
         Remove-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\antigravity-account-switcher' -Recurse -ErrorAction SilentlyContinue; \
         Remove-Item -Path 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\antigravity-account-switcher' -Recurse -ErrorAction SilentlyContinue; \
         Remove-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.ximeeek.antigravity-account-switcher' -Recurse -ErrorAction SilentlyContinue; \
         Remove-Item -Path 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.ximeeek.antigravity-account-switcher' -Recurse -ErrorAction SilentlyContinue; \
         cmd.exe /c \"cmdkey /delete:gemini:antigravity\"; \
         cmd.exe /c \"cmdkey /delete:LegacyGeneric:target=gemini:antigravity\"; \
         Remove-Item -Path \"$env:LOCALAPPDATA\\com.ximeeek.antigravity-account-switcher\" -Recurse -Force -ErrorAction SilentlyContinue; \
         Remove-Item -Path \"$env:LOCALAPPDATA\\AntigravitySwitcher\" -Recurse -Force -ErrorAction SilentlyContinue; \
         Remove-Item -Path \"$env:LOCALAPPDATA\\AntigravitySwitcherDev\" -Recurse -Force -ErrorAction SilentlyContinue; \
         Start-Process -FilePath '{}';",
        exe_path
    );

    Command::new("powershell.exe")
        .creation_flags(CREATE_NO_WINDOW)
        .args(&["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
        .spawn()
        .map_err(|e| format!("Failed to spawn cleanup script: {}", e))?;

    std::process::exit(0);
}

/// Wipes all application data (cache, config, registry, credentials) and then
/// deletes the application executable itself.
pub fn uninstall_app_and_self_delete() -> Result<(), String> {
    let current_exe = std::env::current_exe()
        .map_err(|e| format!("Failed to get current executable path: {}", e))?;
    let exe_path = current_exe.to_string_lossy().to_string();

    let script = format!(
        "Start-Sleep -Seconds 2; \
         Remove-Item -Path 'HKCU:\\Software\\com.ximeeek.antigravity-account-switcher' -Recurse -ErrorAction SilentlyContinue; \
         Remove-Item -Path 'HKLM:\\Software\\com.ximeeek.antigravity-account-switcher' -Recurse -ErrorAction SilentlyContinue; \
         Remove-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\antigravity-account-switcher' -Recurse -ErrorAction SilentlyContinue; \
         Remove-Item -Path 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\antigravity-account-switcher' -Recurse -ErrorAction SilentlyContinue; \
         Remove-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.ximeeek.antigravity-account-switcher' -Recurse -ErrorAction SilentlyContinue; \
         Remove-Item -Path 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.ximeeek.antigravity-account-switcher' -Recurse -ErrorAction SilentlyContinue; \
         cmd.exe /c \"cmdkey /delete:gemini:antigravity\"; \
         cmd.exe /c \"cmdkey /delete:LegacyGeneric:target=gemini:antigravity\"; \
         Remove-Item -Path \"$env:LOCALAPPDATA\\com.ximeeek.antigravity-account-switcher\" -Recurse -Force -ErrorAction SilentlyContinue; \
         Remove-Item -Path \"$env:LOCALAPPDATA\\AntigravitySwitcher\" -Recurse -Force -ErrorAction SilentlyContinue; \
         Remove-Item -Path \"$env:LOCALAPPDATA\\AntigravitySwitcherDev\" -Recurse -Force -ErrorAction SilentlyContinue; \
         Remove-Item -Path '{}' -Force -ErrorAction SilentlyContinue;",
        exe_path
    );

    Command::new("powershell.exe")
        .creation_flags(CREATE_NO_WINDOW)
        .args(&["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
        .spawn()
        .map_err(|e| format!("Failed to spawn uninstall script: {}", e))?;

    std::process::exit(0);
}
