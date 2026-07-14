# ADR-0005: Dynamic Process Tree Management

- Status: Accepted
- Date: 2026-07-11

## Context

Google Antigravity 2.0 launches a main process, renderers, helper processes, and a background language server. The list of process names and the parent-child hierarchy can change between versions. Terminating all processes named `Antigravity.exe` or `language_server.exe` indiscriminately could kill unrelated applications, whereas a static checklist might leave zombie processes holding file locks on our profile databases.

## Decision

The Process Manager resolves the canonical installation path of the active application. It dynamically enumerates the root process and its child processes by taking a process snapshot and walking the PID/Parent PID relationship tree. The snapshot is updated during the shutdown process, as active processes could spawn new sub-processes.

Processes detached from the main process tree (including background language servers) are only included in the termination target set if they match the canonical path of the installation, belong to the current Windows user, and belong to the same Windows session. File name matching alone is never sufficient.

First, a graceful window-close command is sent to the root process windows. After a controlled waiting period, all resolved processes are re-evaluated. A forceful termination (`TerminateProcess`) is applied only to the remaining processes within the verified set. The action is logged per PID without logging full command-line arguments to prevent leakage of user data.

## Consequences

- The specific process names are treated as compatibility test fixtures, not as hardcoded assumptions in the logic.
- Integration tests of the process tree and graceful shutdown behaviors must run before each major release.
- Lack of access to process path, owner, or session details triggers a safe abort rather than falling back to a generic process-name kill.
- Workspace recovery arguments are captured only in memory and never written to regular application logs.
