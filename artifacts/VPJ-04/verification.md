# VPJ-04 native identity preparation verification

Related to #191; recorded scope comment 5605678206. Worktree
`/Users/jtcao/Documents/VP-V4-Native-Identity`, branch `codex/vpj-04-native-identity-prep`.
Preserved the earlier uncommitted implementation, then fast-forwarded through merged `db347bc`
to final merged base `272ca7db99c5ee63878602c476c78d86b7d3bdf7`. No unmerged upstream code used.

## Outcome

A bounded Bearer parser uses the existing Supabase SDK to verify the JWT before exposing its
ordinary-user client. The exact JWT used for verification is used by SDK query/RPC requests.
Native clients do not persist/refresh a session or write Cookie responses. The native adapter
reuses one extracted data-operation closure and always fails its actor gate because the mobile
epoch authority is missing. Existing routes and Origin/CSRF logic were not changed.

Web Cookie-only authentication/query and SDK refresh/queued Set-Cookie behavior pass regression
tests. Authorization-bearing Web requests reject without consulting cookies; native mixed,
missing, malformed, forged, expired, wrong-project, anonymous, privileged and incomplete claims
reject. The same-Origin guard still rejects missing/hostile Origin even with Bearer.

## Observed checks

- Initial complete identity contract/security: 30/30 PASS, zero skips (`identity.log`).
- Full contract on db347bc-based source: 179/179 PASS, zero skips (`contract.log`).
- Unit on that source: 38/38 PASS, zero skips (`unit.log`).
- `pnpm check` on that source: lint/typecheck/build/static 22/22 PASS (`check.log`).
- After final fast-forward (pairing-only upstream additions), identity suite: 30/30 PASS,
  zero skips (`identity-final.log`); final typecheck PASS (`typecheck-final.log`).
- Final full contract: 181/181 PASS (`contract-final.log`); final unit: 45/45 PASS
  (`unit-final.log`), both zero skips. Final docs/diff PASS (commands.jsonl).
- Log trailing whitespace/progress carriage returns are normalized for repository diff hygiene.

The 12 added identity tests include matrices and use the real pinned Auth SDK with process-local
fetch interception and ephemeral synthetic JWTs. `t.after` restores mocks even on failure;
test files have Node's process isolation and tests within each file are sequential. The explicit
two-user concurrency test uses only its own isolated transport. Unexpected targets/paths throw,
so no HTTP request can escape the test double. No real environment file or account is loaded.

Query/RPC probes validate request construction/JWT binding against synthetic empty responses;
they do not establish database RLS. Native adapter reads and representative write/confirm methods
return UNAUTHENTICATED without dispatch. No true mobile-session or write-authority claim is made.

See [module scope](../../docs/benchmarks/vpj-04/native-identity-preparation.md) and
[unrun.md](unrun.md). #191 stays OPEN; exact-HEAD independent review and required CI pending.
