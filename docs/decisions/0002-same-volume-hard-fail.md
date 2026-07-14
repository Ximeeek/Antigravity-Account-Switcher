# ADR-0002: Same-Volume Constraint and Hard Fail

- Status: Accepted
- Date: 2026-07-11

## Context

Rollback guarantees rely on fast, atomic `rename/move` operations within a single volume. Windows may execute moves between different volumes as a copy-and-delete sequence, which is slow, non-atomic, and highly susceptible to interruption. Directories like `%LOCALAPPDATA%`, `%APPDATA%`, and `%USERPROFILE%` can be redirected to different physical or logical drives.

## Decision

Before writing the transaction journal and initiating any mutation, the application determines the actual volume identifier for the profile storage, active sources, and targets. This comparison resolves the Windows volume identity (e.g., volume serial number or volume path name) rather than relying solely on drive letters or path strings.

If all participating paths do not reside on the same drive volume, the operation terminates with a hard, explicit error before modifying any data. The implementation does not fall back to `copy + delete` automatically, does not migrate the storage autonomously, and does not attempt partial execution.

## Consequences

- Non-standard Windows configurations with redirected AppData directories will be unsupported.
- The diagnostic UI displays detected volume roots and properties without exposing account details.
- Testing must cover directory junctions, UNC paths, missing paths, and multi-volume setups.
- Any future cross-volume protocol will require a separate ADR and a complete design for a staged write (stage/copy/fsync/verify/delete/recovery).
