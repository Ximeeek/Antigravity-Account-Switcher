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
