# ADR-0001: DPAPI for Profile Credentials

- Status: Accepted
- Date: 2026-07-11

## Context

Inactive profiles need a copy of OAuth credentials, but tokens must not be stored as plaintext. The application operates exclusively on Windows, and there is no requirement to transfer profiles between users or computers. AES-256-GCM alone does not solve the problem of secure master key storage.

## Decision

We protect the serialized profile credentials using Windows Data Protection API (DPAPI) via `CryptProtectData` in the current user context, saving it as a versioned envelope in `credentials.enc`. Decryption utilizes `CryptUnprotectData` in the same user context.

The envelope contains only the format version, the protection mechanism identifier, and the ciphertext. It never contains an alternative copy of the plaintext or the key. Plaintext buffers have the shortest possible lifespan and are zeroed out after use. Any DPAPI error aborts the operation; there is no weaker fallback mechanism.

The active token is still stored in the Windows Credential Manager according to the format required by Antigravity. DPAPI protects the profile storage; it does not replace the active editor credential entry.

## Consequences

- A profile is tied to the Windows user and typically cannot be copied to another account or computer.
- A Windows/DPAPI profile reset may prevent the recovery of stored tokens; the UI must then require the user to log in again.
- Platform tests must use synthetic secrets and remove artifacts upon completion.
- Logs may contain the `profile_id` and the flag `credential_present=true`, but never any bytes of the token, ciphertext, or API secrets.
