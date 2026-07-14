# ADR-0004: OAuth Refresh Engine Disabled (Superseded by ADR-0006)

- Status: Superseded
- Date: 2026-07-11

## Context

The token refresh engine for inactive profiles requires exact parameters and behaviors of the OAuth client used by Antigravity. The client ID, client secret usage, support for refresh token rotation, and required request payload fields had not been verified based on authorized captures of the actual flow.

Guessing these values or using an arbitrary client could invalidate profiles, leak secrets, or disrupt the expected user authentication experience.

## Decision

The Background Token Refresh Engine will remain disabled. The application will not send requests to `oauth2.googleapis.com/token`, will not include mock client identifiers, and will not attempt to fetch them from unverified sources.

Until this ADR is replaced, the application can only display the stored token expiration time and prompt the user to manually log in again when necessary.

Enabling this feature requires:

1. Confirming the client parameters on a controlled account and documenting their source.
2. Testing successful refreshes, handling expired/revoked refresh tokens, and managing rotation.
3. Writing a secure, transactional mechanism to update credentials on disk.
4. Reviewing logs to ensure no tokens or plaintext email addresses are leaked.
5. Drafting a new ADR to supersede this decision.

## Consequences

- Inactive profiles left unused for extended periods may require browser re-authentication.
- The absence of background refresh is expected behavior and will not trigger automatic account switches.
- The codebase, configuration examples, fixtures, and logs must not contain real OAuth client IDs or secrets.
