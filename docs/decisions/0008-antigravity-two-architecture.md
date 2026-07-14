# ADR-0008: Standalone Antigravity 2.0 Architectural Alignment

- Status: Accepted
- Date: 2026-07-14

## Context

Early iterations of this project included configuration and files referencing VS Code extensions (such as `.vscodeignore`, `extension.json`, and VS Code-specific extension host calls). Google Antigravity 2.0 is a standalone desktop application orchestrating multiple autonomous AI agents from its own Electron-based GUI. It has no integration with VS Code, and does not host VS Code extensions. Keeping legacy VS Code files in the codebase is misleading, creates architectural drift, and confuses developers and AI subagents.

## Decision

We align the repository strictly with the standalone architecture of Google Antigravity 2.0. We:

1. Purge all legacy IDE extension files, VS Code integration configurations, and redundant workspace templates.
2. Formulate explicit developer guidelines stating that this tool operates as an external Windows process switcher interacting with Tauri 2.x and Antigravity 2.0.
3. Validate that the application logic only reads settings from `%APPDATA%\antigravity` and `.gemini/` directories, completely separating it from old editor contexts.

## Consequences

- The codebase is significantly cleaned, removing dead configurations and preventing confusion.
- System prompts and AI coding rules strictly enforce that the project represents a Tauri 2.x Windows application independent of VS Code or visual editors.
