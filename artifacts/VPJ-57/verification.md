# VPJ-57 local request/access slice — 2026-09-22

Base: `origin/main 7a05827`. Branch: `codex/vpj57-case-access-grants`. Related to #222; do not close the Issue from this slice.

## Implemented

Native Profile support entry, private request recording, exact one-field preview, named staff and bounded expiry, version-fenced replacement/revocation, owner paging and immutable uncertain-create retries. Fixed local-only native API. Private RLS tables and authenticated RPC; no existing staff accounts provisioned. No Trip/Brief/customer-profile data is fetched. Requests always remain requested/unaccepted.

## Observed

| Check | Result |
| --- | --- |
| Dedicated Supabase stack, real synthetic GoTrue login → native HTTP → PostgreSQL | PASS 6/6, no skips; unique `vp-service-cases-*` project, ports 581xx; runner removed only its stack |
| Same-request replay / changed-payload conflict / unknown fields / no implicit share | PASS |
| Exact minimal fields / recipient / replacement / old-version rejection / server-clock expiry | PASS |
| Revocation / stale grant replay / other owner / inactive employee / revoked session | PASS |
| Anonymous JWT-context direct RPC / anonymous API / private table access / RLS | PASS |
| More than 50 requests: older request remains reachable by owner paging | PASS |
| Injected audit trigger error: grant mutation rolls back | PASS |
| Native HTTP contracts including transient session failure as 503, never logout | PASS 5/5 (mocked transport, not DB evidence) |
| `pnpm check` | PASS lint, TypeScript, optimized build and 22 static/design tests |
| `pnpm test:unit` | PASS 114/114 |
| `pnpm test:contract` | PASS 587/587 before adding the separately passed 5 HTTP cases |
| `pnpm test:security` final run | PASS executed 149; 1 existing explicit-target test SKIP |
| `pnpm test:integration` generic run | PASS executed 39; 80 explicit environment tests SKIP, including this ticket's test in the generic run; separately executed above |
| Xcode project/scheme list and available-device enumeration | PASS with per-command DEVELOPER_DIR |
| Native generic iOS Simulator build | PASS, including final retry changes; no simulator reset or device launch |
| Docs check and diff check | PASS |
| `pnpm db:verify` | Command PASS; configured target probes report NOT CONFIGURED; not used as DB acceptance |

## Failures retained and resolved

- Initial disposable stack copied migration before independent-review fixes. Its late-added anonymous direct-RPC regression reproduced `anonymous bypass` (FAIL); four other subtests passed. A fresh stack with final migration passed every subtest. No applied shared migration was edited.
- Initial full security run had existing CLI tests time out at 10/15 seconds during concurrent local work. The relevant 17 tests passed unchanged in isolation; final full security run passed all executed tests. Resource contention was suspected, not established as sole cause.
- Initial xcodebuild used system CommandLineTools and failed. Re-ran using `/Applications/Xcode.app/Contents/Developer` scoped to each command; no global developer setting change.

## Independent review

Permission/migration review by separate agent found and rechecked: anonymous direct RPC guard, access to old requests beyond first page, immutable request retry after ambiguous success, and editable recovery after definitive input rejection / Unicode scalar limit. All identified findings closed; no remaining P1/P2 in static re-review. Runtime evidence remains the tests above; reviewer did not claim execution.

Global handoff/queue updates and merge sequencing belong to Overall. Client/API rollback and direct RPC revoke procedure are in `docs/contracts/vpj-57.md`.

Final local migration SHA-256: `035fadace0c096b96ba1e18566e51ffd60c704fadb57fa5b958e279d3926efb1`.
