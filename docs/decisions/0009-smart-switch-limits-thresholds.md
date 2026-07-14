# ADR-0009: Smart Switch Quota Engine and Thresholds

- Status: Accepted
- Date: 2026-07-14

## Context

Users run resource-intensive, long-running agent tasks that can exhaust Google Gemini API limits. When rate limits or quotas are hit, tasks fail. Manually checking quotas and swapping accounts interrupts the agent workflow. We need a way to swap accounts automatically when limits run low without disrupting active agent operations.

## Decision

We implement a background "Smart Switch" quota monitoring and switching engine. The engine operates under the following rules:

1. **Quota Monitoring**: The background service queries and decrypts the quotas of all saved profiles in the background by periodically calling Google's API endpoints using their stored refresh tokens.
2. **Threshold Triggering**: A switch is triggered when:
   - The active profile's 5-hour limit drops below **10%**.
   - OR the active profile's weekly limit drops below **5%**.
3. **Safety Interlock**: Before executing a swap, the engine verifies that the Antigravity agent process is NOT actively executing a task. If the agent is busy (e.g., executing code or running a loop), the automatic switch is blocked and queued to prevent environment disruption and state corruption.
4. **Target Profile Selection**: The engine evaluates all other saved profiles and selects the profile with the highest remaining 5-hour quota.
5. **Switch Execution**: Once the safety conditions are met, the engine performs a standard profile switch (utilizing the configured switch level).

## Consequences

- Multi-account setups can run continuously in the background, automatically transferring tasks to fresh accounts when quotas dry up.
- Network overhead is slightly increased due to background quota checks, which is minimized by polling only at 5-minute intervals when idle.
- Safe execution is guaranteed, preventing active sessions from being interrupted mid-process.
