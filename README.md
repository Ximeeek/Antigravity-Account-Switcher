# Antigravity Account Switcher

> A secure, high-performance Windows desktop application built with Tauri 2.x and Rust to manage and swap between multiple Google accounts in Google Antigravity 2.0.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](#development)
[![Early Development](https://img.shields.io/badge/Status-Early_Development-orange.svg)](#development)



> [!CAUTION]
> **LEGAL DISCLAIMER & TERMS OF USE**
>
> **1. Educational Use Only:** This application is provided strictly for educational, research, and personal demonstrational purposes.
> **2. Commercial Use Prohibited:** Commercial use or monetization of this software is prohibited.
> **3. Disclaimer of Liability:** Under no circumstances shall the developers or contributors be liable for any direct, indirect, incidental, special, or consequential damages (including, but not limited to, loss of data, loss of access, account bans, or service disruptions) arising in any way out of the use, abuse, or misuse of this software. The user accepts all risks and sole responsibility for running this software.
> **4. Compliance with Third-Party Terms:** The user is solely responsible for ensuring compliance with all applicable terms, including the [Google Terms of Service](https://policies.google.com/terms), [Google Gemini API Terms of Service](https://ai.google.dev/gemini-api/terms), and [Google Anti-Abuse Policies](https://policies.google.com/terms). Programmatic switching of accounts to bypass usage limits or quotas violates Google's policies and may result in the termination of your Google accounts.
>
> By using this software, you agree to these terms and waive any and all claims against the developer(s).

---

## Why This Exists

Google Antigravity 2.0 reads and caches your Google OAuth token *only once* at startup. If you use multiple paid PRO accounts, switching between them manually requires signing out, signing in, and losing your agent conversation history or settings.

**Antigravity Account Switcher** automates this lifecycle. It handles shutting down the editor gracefully, backing up and swapping database states (`state.vscdb`) and agent folders (`.gemini/`), updating the Windows Credential Manager under the hood, and relaunching the app with the target account context intact.

---

## Switching Levels (Restart Modes)

Determines the scope and speed of the restart sequence when switching active profiles:

| Level | Name | Est. Time | Speed Multiplier | Mechanism Description |
|---|---|---|---|---|
| **Level 1** | Full Restart | ~17s | *Baseline* | Completely closes and restarts the entire Antigravity 2.0 application. |
| **Level 1+** | Optimized Restart | ~8s | **3x Faster** | Closes the GUI gracefully but instantly terminates background zombie processes to bypass long OS timeouts. |
| **Level 2** | Reload | ~5s | **4x Faster** | Keeps the open GUI window and chat history active, terminating and restarting only the language server process (`language_server.exe`). |
| **Level 2+** | Fast Reload | ~3s | **6x Faster** | Patches the Antigravity installation's `app.asar` archive to reduce the language server's `RESTART_COOLDOWN_MS` constant. |

---

## Key Features

*   **Smart Switch Engine**: Automatically switches to the saved account with the highest remaining Gemini API limits when the active profile's limits run low (5h limit < 10% or weekly limit < 5%). The switch is automatically blocked if the Antigravity agent is actively running a task.
*   **Authentication Auto-refresh**: Automatically manages and renews Google sessions in the background. The application renews OAuth access tokens before they expire, avoiding browser login prompts during account swaps.
*   **Mini Mode Widget**: A compact, always-on-top window interface. Designed to be pinned over other windows for quick, single-click account swaps.
*   **Durable Failure Recovery**: If a filesystem or API swap operation is interrupted (e.g. power failure), a dedicated **Recovery Screen** blocks access at next startup, allowing the user to safely complete or roll back the transaction.

---

## Security & Architecture

*   **Token Protection**: Active credentials are stored securely in the Windows Credential Manager under `gemini:antigravity`. Inactive profiles are encrypted locally on disk via **Windows DPAPI** (`CryptProtectData`) tied to the active Windows user context. Plaintext tokens are never written to log files.
*   **Localhost Binding**: The background HTTP server binds strictly to `127.0.0.1`. Requests from the editor plugin are authenticated via a secure `Bearer` transport token.
*   **Anonymized Logs**: Application logs (`logs/switcher.log`) only use UUIDs (`profile_id` / `operation_id`). Plaintext credentials and email addresses never enter the logs.
*   **Same-Volume Constraint**: Swapping operations require source and destination folders to reside on the same drive volume to ensure atomic directory moves (blocking slow, non-atomic cross-volume copy operations).

---

## Architecture Decision Records (ADRs)

Detailed rationale for our design and security decisions can be found in our ADR registry:

*   [ADR-0001: DPAPI for Profile Credentials](docs/decisions/0001-dpapi-profile-credentials.md) — Protecting inactive tokens using Windows DPAPI.
*   [ADR-0002: Same-Volume Constraint and Hard Fail](docs/decisions/0002-same-volume-hard-fail.md) — Enforcing single-volume operations to ensure atomic renames.
*   [ADR-0003: Durable Journal for Move Operations](docs/decisions/0003-per-move-operation-journal.md) — Transaction logs via `switcher.lock` for failure recovery.
*   [ADR-0004: OAuth Refresh Engine Disabled](docs/decisions/0004-oauth-refresh-disabled.md) — *Superseded by ADR-0006*.
*   [ADR-0005: Dynamic Process Tree Management](docs/decisions/0005-dynamic-process-tree.md) — Dynamic PID resolving to identify and terminate instances.
*   [ADR-0006: Enabling OAuth Background Refresh Engine](docs/decisions/0006-oauth-refresh-enabled.md) — Secure, background OAuth token renewal.
*   [ADR-0007: Four-Tier Switch Levels & ASAR Patching](docs/decisions/0007-switch-levels.md) — Switch speed tiers and patching `app.asar`.
*   [ADR-0008: Standalone Antigravity 2.0 Architectural Alignment](docs/decisions/0008-antigravity-two-architecture.md) — Purging legacy editor code and VS Code extensions.
*   [ADR-0009: Smart Switch Quota Engine and Thresholds](docs/decisions/0009-smart-switch-limits-thresholds.md) — Background quota checks and safety interlocks.

## Changelog

### v0.1.2-nightly.20260714 (Recent Changes)

- **Security & Privacy (Encryption at Rest)**
  - Implemented secure profile locking and encryption at rest using Windows Data Protection API (DPAPI).
  - Added a global master password lockdown mechanism.
  - Implemented active profile lock toggling, visual security status cards, and a quick lock widget.
- **Tauri & Windows Integration**
  - Added a WebView2 auto-installer for Evergreen bootstrapper support.
  - Implemented a local single-instance application lock to prevent multiple concurrent instances.
  - Hide flashing console windows on CLI process executions to improve UX and security.
  - Localized native Win32 dialogs dynamically using JSON locale files.
- **Smart Switch Engine & Performance**
  - Asynchronous live quota fetching running inside background Tokio tasks.
  - Stale-while-revalidate caching for quota endpoints to prevent high CPU / API rate limits.
  - Reduced CPU-heavy scans by caching `app.asar` modification times.
  - Bypassed unnecessary process polling to optimize the fast switch sequence.
- **UI & UX Refinements**
  - Redesigned switch mode selector by relocating it to the active account card header popover.
  - Added holographic gold glows and debounced sliding animations for Reload (Level 2) and Fast Reload (Level 2+).
  - Added drifting background glows behind settings cards.
  - Prevented duplicate Google account additions with auto-detection validation error mappings.
- **Code Cleanups**
  - Purged all legacy VS Code extension and third-party manager modules to align with the standalone Antigravity 2.0 application layout.

#### Commit History:
- `fix(uninstall): isolate wipe and uninstall folder deletions`
- `fix(service): make sync_active_profile_on_read non-blocking using try_lock`
- `fix(quota): fetch quota asynchronously to prevent switch hang`
- `fix(paths): restore production active paths and deselect mismatched profiles`
- `fix(uninstall): delete development credential targets during wipe`
- `fix(profiles): prevent concurrent auto-import race condition`
- `feat(paths): isolate dev and release switcher environments`
- `feat(feedback): add google forms reporting and devtools overrides`
- `feat(ui): add 3 random drifting background glows to settings cards`
- `feat(ui): add first-time warning for level 2 and 2+ switch`
- `fix(ui): resolve account card badge layout shift and switch progress timing`
- `fix(service): allow metadata.enc for encrypted profile validation`
- `ui(dashboard): position security widget above quota limits and support collapse`
- `ui(dashboard): make security status widget dismissible`
- `ui(dashboard): add premium quick lock status widget`
- `feat(security): implement global master password lockdown`
- `ui(settings): add profile security card and active account lock toggle`
- `feat(security): implement secure profile locking and encryption at rest`
- `feat(devtools): add forced smart switch command and UI panel`
- `perf(patch): cache app.asar modification time to prevent CPU-heavy scans`
- `perf(quota): fetch live quotas asynchronously in tokio background tasks`
- `perf(switch): optimize fast switch sequence by bypassing process polling`
- `perf(quota): prevent thundering herd and high CPU usage via stale-while-revalidate caching`
- `fix(switch): prevent missing database crash during active state repair`
- `ui(profile): map and localize duplicate google account error`
- `feat(profile): prevent duplicate google accounts in switcher`
- `fix(switch): prevent crash when active database or gemini files do not exist yet`
- `fix(error): translate OAuth token errors and recovery error in backend and UI`
- `fix(switch): decouple session activation from active profile presence`
- `feat(i18n): load native Win32 dialog strings dynamically from JSON locale files`
- `ui(error): localize backend error messages in React interface`
- `fix(profile): check active credentials before session preflight`
- `fix(windows): hide flashing console windows during CLI executions`
- `feat(windows): add WebView2 auto-installer and single-instance lock`
- `docs(readme): remove interactive demo.html and links`
- `docs(adr): remove emojis from interactive demo and readme`
- `docs(adr): translate decisions to english and add interactive demo`
- `docs(switch): rename Level 2 to Reload and Level 2+ to Fast Reload`
- `ui(switch): adjust slider snap positions and update speed multipliers`
- `feat(switch): add Level 1+ optimized full restart mode`
- `feat(ui): add minimalist info button to active account header`
- `feat(ui): add feature guide tab to about modal`
- `ui(switch): restrict golden glow styling exclusively to the '+' character`
- `ui(switch): add holographic gold glow and animated plus for Level 2+`
- `fix(ui): enable responsive sliding with debounce and state sync`
- `fix(ui): disable slider interactions and sync badge during settings save`
- `fix(ui): disable closing-app warning and optimize labels for Level 2+`
- `feat(switch): add Level 2+ switch level with app.asar patching`
- `chore(i18n): translate comments, logs, and internationalize polish strings`
- `feat(settings): extract and show Antigravity 2.0 version`
- `ui(settings): move version switcher info to a tabbed About modal`
- `fix(switcher): terminate all language server instances on fast switch`
- `chore(cleanup): remove VS Code extension and legacy third-party manager`
- `fix(switch): add sleep delay to prevent fast switch GUI glitch`
- `fix(switch): prevent fast switch race condition and optimize sleeps`
- `fix(switch): execute fast switch steps chronologically and eliminate race condition`
- `fix(switch): force full restart and remove fast switch UI selector`
- `ui(dashboard): relocate switch mode to active account card header popover`

---

## Development & Setup

### Prerequisites

*   Windows 10 / 11
*   WebView2 Runtime
*   Stable Rust (MSVC toolchain)
*   Node.js (v18+) & npm

### Getting Started

1.  Install dependencies:
    ```powershell
    npm install
    ```
2.  Start the Tauri development server:
    ```powershell
    npm run tauri dev
    ```

To run quality checks (frontend build + Rust cargo checks and unit tests):
```powershell
npm run check
```

Or run Rust unit tests separately:
```powershell
cargo test --workspace
```

---

## License

MIT © [Antigravity Account Switcher contributors](LICENSE)
