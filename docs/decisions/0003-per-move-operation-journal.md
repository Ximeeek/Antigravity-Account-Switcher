# ADR-0003: Durable Journal for Move Operations

- Status: Accepted
- Date: 2026-07-11

## Context

A simple `current_step` state indicator is insufficient if the process terminates abruptly mid-way through a series of directory move operations. A recovery engine must distinguish between planned, executed, and rolled-back file mutations, especially if a crash occurs between the filesystem modification and the update of the lock/journal file.

## Decision

The `switcher.lock` file serves as a versioned, durable transaction journal. It contains at least:

- `schema_version`, `operation_id`, `from_profile_id`, `to_profile_id`, `started_at`,
- The current step and overall status of the switch operation,
- An ordered list of mutations, including type, canonical source, target path, expected manifest, and state (`planned`, `applied`, or `rolled_back`),
- Safe diagnostic metadata required to resume or roll back the operation without exposure of tokens or email addresses.

Each directory move is first recorded in the journal as `planned`. Only after the journal is flushed to disk is the directory move executed. Once the move succeeds, the journal entry is updated to `applied`. Lock updates are performed using a temporary file on the same volume, followed by a flush (`fsync`) and an atomic file replace. If recovery encounters an unresolved `planned` state, it checks the actual directory structure and manifests to verify if the move happened, rather than executing blindly.

Rollback traverses the `applied` list in reverse order and durably records each rollback step. The journal is deleted only after a consistency check succeeds for both the active profile and the Windows Credential Manager.

## Consequences

- Recovery is deterministic even after a crash mid-step.
- The implementation requires a durable file write helper and testing using fault-injection before and after I/O boundaries.
- Pre-existing files at targets, missing sources, or manifest mismatches halt automatic recovery, requiring developer/manual intervention.
- A global process mutex is still required; the journal file alone does not prevent race conditions if multiple application processes run concurrently.
