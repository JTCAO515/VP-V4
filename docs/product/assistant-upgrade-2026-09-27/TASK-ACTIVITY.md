# Owner task activity read contract

Related to #561 and #562. This backend slice does not close either issue.

`GET /api/chat/native/v5/conversations/{conversationId}/tasks/{taskId}/activity`
requires the active native Bearer session. No query parameters, cookie or Origin.
The authenticated RPC is `read_assistant_task_activity_v1(policyId, conversationId, taskId)`.
The server supplies its current text policy; no owner or Turn ID is accepted from the client.

```json
{"version":5,"kind":"task_activity","conversationId":"uuid","taskId":"uuid","turnId":"uuid","turnStatus":"cancelled","limit":4,"recording":"recorded","actions":[{"tool":"place.read","state":"unknown"}]}
```

- Membership uses the latest conversation association and the Task's canonical `last_turn_id`; root/older Turns cannot supply fallback progress.
- Current text and planning policy/consent, active thread, visible root/latest content, current Goal scope and accepted Memory revisions are mandatory. Goal Trip links/terminal state retain the existing planning exclusion. An absent matching planning job or stale receipt basis is unavailable.
- Fixed tools: `evidence.lookup`, `place.read`, `constraints.evaluate`, `result.prepare`. Receipt states are exactly `started`, `completed`, `unknown`; a terminal Turn does not rewrite receipts. Job execution state is not read authority: queued, paused and completed jobs use the same authority checks.
- The writer's entire-Task hard limit is four. The reader examines at most five indexed Task rows and rejects overflow. It returns only canonical-Turn receipts, ordered by creation (ties have no semantic ordering). No all-owner scan.
- `unrecorded` with an empty array means no eligible receipt was recorded. It proves neither completion nor that a tool was never executed. Four completed receipts alone do not prove Task completion. No percentage, Online state or retry action is inferred.
- Uniform `DATA_POLICY_BLOCKED` (403) omits all activity on foreign, revoked, hidden or stale authority. Invalid request is 400, missing/replaced session 401, dependency unavailable 503. Responses use `private, no-store`.
- Only the fields above cross HTTP. No receipt key, digest, lease, Memory text/basis, provider input/output, cost or timestamps. Private tables retain their existing service-only writer surface; only this authenticated read RPC is added.

Rollback disables/removes this route and RPC; no state migration or producer change is needed.
Native attachment, real provider chain, shared Staging and production acceptance remain UNRUN.
Local tests use real disposable Auth, HTTP and migrated PostgreSQL with explicitly synthetic receipt fixtures.

## Local verification (2026-10-02)

- PASS: disposable `run-native-http.mjs --assistant-rollback`, 2/2 tests, zero skipped (activity and existing producer rollback). Ordinary-owner native JWT, real Auth session and HTTP route exercise migrated PostgreSQL; fixture receipts are synthetic.
- PASS: `db-integration.mjs --lane supabase-rls`, 23/23, zero skipped, including repository-wide function EXECUTE allowlist and default privilege checks.
- PASS: dedicated activity HTTP security tests, 4/4 (closed input, unknown/terminal preservation, private-field allowlist, malformed responses, session failures).
- PASS: docs check, lint, typecheck, diff whitespace; contract 722/722.
- INCOMPLETE: ordinary integration 39 passed / 149 gated skips; security 203 passed / 1 explicit disposable-target skip before the fourth new HTTP security test was added. The new fourth test separately passed. No skipped test is counted as target acceptance.
- UNRUN: native attachment, real provider/tools, shared Staging/production, restart delivery or full #561/#562 acceptance.
