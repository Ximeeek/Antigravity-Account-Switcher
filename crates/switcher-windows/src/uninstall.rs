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
    let current_pid = std::process::id();

    let relaunch_cmd = if cfg!(debug_assertions) {
        "".to_string()
    } else {
        format!("Start-Process -FilePath '{}';", exe_path)
    };

    let script = format!(
        "$parentPid = {}; \
         $targetDir = \"$env:LOCALAPPDATA\\com.ximeeek.antigravity-account-switcher\"; \
         while (Get-Process -Id $parentPid -ErrorAction SilentlyContinue) {{ Start-Sleep -Milliseconds 100 }} \
         $processes = Get-CimInstance Win32_Process -Filter \"Name = 'msedgewebview2.exe'\" -ErrorAction SilentlyContinue; \
         if (-not $processes) {{ \
             $processes = Get-WmiObject Win32_Process -Filter \"Name = 'msedgewebview2.exe'\" -ErrorAction SilentlyContinue; \
         }} \
         if ($processes) {{ \
             $processes | Where-Object {{ $_.CommandLine -like \"*$targetDir*\" }} | ForEach-Object {{ \
                 Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; \
             }} \
         }} \
         $appProcesses = Get-CimInstance Win32_Process -Filter \"Name = 'app.exe'\" -ErrorAction SilentlyContinue; \
         if (-not $appProcesses) {{ \
             $appProcesses = Get-WmiObject Win32_Process -Filter \"Name = 'app.exe'\" -ErrorAction SilentlyContinue; \
         }} \
         if ($appProcesses) {{ \
             $appProcesses | ForEach-Object {{ \
                 if ($_.ProcessId -ne $parentPid) {{ \
                     Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; \
                 }} \
             }} \
         }} \
         Start-Sleep -Milliseconds 500; \
         Remove-Item -Path 'HKCU:\\Software\\com.ximeeek.antigravity-account-switcher' -Recurse -ErrorAction SilentlyContinue; \
         Remove-Item -Path 'HKLM:\\Software\\com.ximeeek.antigravity-account-switcher' -Recurse -ErrorAction SilentlyContinue; \
         Remove-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\antigravity-account-switcher' -Recurse -ErrorAction SilentlyContinue; \
         Remove-Item -Path 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\antigravity-account-switcher' -Recurse -ErrorAction SilentlyContinue; \
         Remove-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.ximeeek.antigravity-account-switcher' -Recurse -ErrorAction SilentlyContinue; \
         Remove-Item -Path 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.ximeeek.antigravity-account-switcher' -Recurse -ErrorAction SilentlyContinue; \
         cmd.exe /c \"cmdkey /delete:gemini:antigravity\"; \
         cmd.exe /c \"cmdkey /delete:LegacyGeneric:target=gemini:antigravity\"; \
         cmd.exe /c \"cmdkey /delete:gemini:antigravity_dev\"; \
         cmd.exe /c \"cmdkey /delete:LegacyGeneric:target=gemini:antigravity_dev\"; \
         $folders = @( \
             \"$env:LOCALAPPDATA\\com.ximeeek.antigravity-account-switcher\", \
             \"$env:LOCALAPPDATA\\AntigravitySwitcher\", \
             \"$env:LOCALAPPDATA\\AntigravitySwitcherDev\" \
         ); \
         foreach ($folder in $folders) {{ \
             if (Test-Path $folder) {{ \
                 for ($i = 0; $i -lt 5; $i++) {{ \
                     Remove-Item -Path $folder -Recurse -Force -ErrorAction SilentlyContinue; \
                     if (-not (Test-Path $folder)) {{ break; }} \
                     Start-Sleep -Milliseconds 500; \
                 }} \
             }} \
         }} \
         {}",
        current_pid, relaunch_cmd
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
    let current_pid = std::process::id();

    let script = format!(
        "$parentPid = {}; \
         $targetDir = \"$env:LOCALAPPDATA\\com.ximeeek.antigravity-account-switcher\"; \
         while (Get-Process -Id $parentPid -ErrorAction SilentlyContinue) {{ Start-Sleep -Milliseconds 100 }} \
         $processes = Get-CimInstance Win32_Process -Filter \"Name = 'msedgewebview2.exe'\" -ErrorAction SilentlyContinue; \
         if (-not $processes) {{ \
             $processes = Get-WmiObject Win32_Process -Filter \"Name = 'msedgewebview2.exe'\" -ErrorAction SilentlyContinue; \
         }} \
         if ($processes) {{ \
             $processes | Where-Object {{ $_.CommandLine -like \"*$targetDir*\" }} | ForEach-Object {{ \
                 Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; \
             }} \
         }} \
         $appProcesses = Get-CimInstance Win32_Process -Filter \"Name = 'app.exe'\" -ErrorAction SilentlyContinue; \
         if (-not $appProcesses) {{ \
             $appProcesses = Get-WmiObject Win32_Process -Filter \"Name = 'app.exe'\" -ErrorAction SilentlyContinue; \
         }} \
         if ($appProcesses) {{ \
             $appProcesses | ForEach-Object {{ \
                 if ($_.ProcessId -ne $parentPid) {{ \
                     Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; \
                 }} \
             }} \
         }} \
         Start-Sleep -Milliseconds 500; \
         Remove-Item -Path 'HKCU:\\Software\\com.ximeeek.antigravity-account-switcher' -Recurse -ErrorAction SilentlyContinue; \
         Remove-Item -Path 'HKLM:\\Software\\com.ximeeek.antigravity-account-switcher' -Recurse -ErrorAction SilentlyContinue; \
         Remove-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\antigravity-account-switcher' -Recurse -ErrorAction SilentlyContinue; \
         Remove-Item -Path 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\antigravity-account-switcher' -Recurse -ErrorAction SilentlyContinue; \
         Remove-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.ximeeek.antigravity-account-switcher' -Recurse -ErrorAction SilentlyContinue; \
         Remove-Item -Path 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.ximeeek.antigravity-account-switcher' -Recurse -ErrorAction SilentlyContinue; \
         cmd.exe /c \"cmdkey /delete:gemini:antigravity\"; \
         cmd.exe /c \"cmdkey /delete:LegacyGeneric:target=gemini:antigravity\"; \
         cmd.exe /c \"cmdkey /delete:gemini:antigravity_dev\"; \
         cmd.exe /c \"cmdkey /delete:LegacyGeneric:target=gemini:antigravity_dev\"; \
         $folders = @( \
             \"$env:LOCALAPPDATA\\com.ximeeek.antigravity-account-switcher\", \
             \"$env:LOCALAPPDATA\\AntigravitySwitcher\", \
             \"$env:LOCALAPPDATA\\AntigravitySwitcherDev\" \
         ); \
         foreach ($folder in $folders) {{ \
             if (Test-Path $folder) {{ \
                 for ($i = 0; $i -lt 5; $i++) {{ \
                     Remove-Item -Path $folder -Recurse -Force -ErrorAction SilentlyContinue; \
                     if (-not (Test-Path $folder)) {{ break; }} \
                     Start-Sleep -Milliseconds 500; \
                 }} \
             }} \
         }} \
         $exePath = '{}'; \
         for ($i = 0; $i -lt 5; $i++) {{ \
             Remove-Item -Path $exePath -Force -ErrorAction SilentlyContinue; \
             if (-not (Test-Path $exePath)) {{ break; }} \
             Start-Sleep -Milliseconds 500; \
         }}",
        current_pid, exe_path
    );

    Command::new("powershell.exe")
        .creation_flags(CREATE_NO_WINDOW)
        .args(&["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
        .spawn()
        .map_err(|e| format!("Failed to spawn uninstall script: {}", e))?;

    std::process::exit(0);
}
