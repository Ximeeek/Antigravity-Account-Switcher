# ADR-0006: Enabling OAuth Background Refresh Engine

- Status: Accepted
- Date: 2026-07-13
- Supersedes: [ADR-0004](0004-oauth-refresh-disabled.md)

## Context

ADR-0004 deferred enabling the background token refresh engine due to unverified OAuth client parameters. Since then, the exact OAuth parameters (`client_id`, client token exchange schemas, and refresh request formats) utilized by Google Antigravity 2.0 have been reverse-engineered and verified under controlled conditions. Swapping between accounts is much more seamless when inactive profile sessions do not expire silently on disk.

## Decision

We enable the Background Token Refresh Engine in the Rust core switcher. The application now manages session validity in the background by:

1. Binding to Google's standard OAuth token endpoints (`oauth2.googleapis.com/token`) with the verified client parameters.
2. Checking the token status locally using stored timestamps. If a stored refresh token is present, the engine automatically triggers a refresh cycle when the token's remaining validity drops below a 15-minute threshold.
3. Writing the updated token payload back to the DPAPI-encrypted credential store on disk (`credentials.enc`) inside a transactional file update envelope.
4. Ensuring that no sensitive credentials (e.g., plaintext access tokens, refresh tokens, or client secrets) are written to the application's logs or stdout.

## Consequences

- Users are no longer forced to re-authenticate via browser when switching to a profile that has been inactive on disk, provided the refresh token itself remains valid on Google's authorization servers.
- Application robustness is increased, and the active token status is displayed transparently in the dashboard and the mini switcher.
- Strict security boundaries are maintained by keeping all token exchange processes local to the user's machine (binding to `127.0.0.1` and using secure process environments).
