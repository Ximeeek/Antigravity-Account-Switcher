# ADR-0007: Four-Tier Switch Levels & ASAR Patching

- Status: Accepted
- Date: 2026-07-13

## Context

Swapping active Google accounts in Google Antigravity 2.0 requires reloading the environment and database states. A full application restart guarantees complete UI and session refresh but takes ~17 seconds. Users require faster options for quick account swapping when only the backend language models need to be redirected to a different token context.

## Decision

We implement four distinct "Switch Levels" that allow users to choose between restart scope and speed:

1. **Level 1 (Full Restart)**: Slower (~17s) but safe. Completely closes and restarts the Antigravity application.
2. **Level 1+ (Optimized Full Restart)**: Faster full restart (~8s) that gracefully closes the GUI windows but instantly force-kills remaining background services and zombie processes to prevent shutdown lock delays.
3. **Level 2 (Reload)**: Fast switch (~5s) that keeps the main application window open and active, while terminating and reloading only the backend language server process (`language_server.exe`).
4. **Level 2+ (Fast Reload)**: Blazing fast switch (~3s) that patches the Antigravity installation's `app.asar` archive under the hood. Specifically, it extracts `app.asar`, modifies the `RESTART_COOLDOWN_MS` constant in the compiled `languageServer.js` (from default 2000ms to a custom configured value, e.g., 100ms), and repacks it.

When Level 2+ is selected, the application validates the installation path, closes Antigravity if running to unlock `app.asar`, backs up the original untouched archive to `app.asar.backup`, performs the extraction/regex modification/repacking via `npx asar`, and verifies the structure before replacing the live archive.

## Consequences

- Users gain granular control over switching speed, enabling near-instantaneous switches (Level 2+) without losing active GUI states (chat history, open files).
- Level 2+ requires Node.js/`npx` to be installed on the host machine to execute `npx asar` operations. If not available, it fails gracefully and falls back to standard reloading.
- Patching `app.asar` creates a risk of file corruption if interrupted. This is mitigated by taking a reliable backup of the original `app.asar` first, and implementing an automatic restore routine if validation of the repacked archive fails.
