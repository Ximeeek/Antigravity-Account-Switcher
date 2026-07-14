# Architecture Decision Records

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-dpapi-profile-credentials.md) | Accepted | Inactive profile credentials are encrypted using Windows DPAPI. |
| [0002](0002-same-volume-hard-fail.md) | Accepted | Cross-volume path configuration triggers a hard fail before filesystem mutation. |
| [0003](0003-per-move-operation-journal.md) | Accepted | A transaction log (`switcher.lock`) acts as a durable mutation journal. |
| [0004](0004-oauth-refresh-disabled.md) | Superseded | Token refresh is kept disabled pending client parameter verification. |
| [0005](0005-dynamic-process-tree.md) | Accepted | Process tree is terminated dynamically based on canonical paths and session contexts. |
| [0006](0006-oauth-refresh-enabled.md) | Accepted | Enable background token refresh using verified OAuth parameters. |
| [0007](0007-switch-levels.md) | Accepted | Support four switch levels (1, 1+, 2, 2+) with custom `app.asar` patching for Level 2+. |
| [0008](0008-antigravity-two-architecture.md) | Accepted | Align codebase with standalone Antigravity 2.0 and remove legacy editor code. |
| [0009](0009-smart-switch-limits-thresholds.md) | Accepted | Implement Smart Switch background quota monitoring and safety interlocks. |

These records document our architectural decisions, their rationale, and consequences. Changing an accepted decision requires drafting a new ADR that supersedes the previous one rather than silently editing history.
