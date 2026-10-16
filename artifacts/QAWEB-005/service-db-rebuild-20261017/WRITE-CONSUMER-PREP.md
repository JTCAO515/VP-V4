# Native write consumer preparation — WAIT_BASELINE

Own WT: `/Users/jtsm5p/Documents/Codex/VP-V10-worktrees/db-rebuild-service-write-20261017`.
Branch: `codex/db-rebuild-service-write-20261017`; fixed base
`d517fb5095d1115127bba94d9676e6ae36f59a87`, initially tracked/staged clean.
Original read-slice WT, node_modules, 4d5d tests/proof and d517 documents preserved.
No application/DB/shared/config file changed; no container or test matrix run.

**Status: necessary verification preparation only; positive write tests UNRUN /
WAIT_BASELINE.** No new stable write baseline has been supplied. c66's missing
functions are already proven technical42883; do not mechanically run them again,
change their assertions, or claim another implementation line.

## Minimal high-value cases after a new stable source is fixed

| Case | Actual calls / assertions, not mocked success |
| --- | --- |
| Native admission | Original prepare/login + policy/explicit consent → POST sessions{} → POST messages{requestId,text}. Expect actual SQL accepted/reused:false, HTTP202 pending, original Session/request/Turn IDs and persisted same Task lineage. Read the original request before any result and preserve exact input bytes; no fixture-seeded success for this case. |
| Byte idempotency | Explicitly repeat exactly the same requestId/text: reused:true, same original Turn/Task/queue item. Same key with changed whitespace/Unicode/text bytes must409 without another admission. Use qa_read_session_v1's protected Task/Turn projection; do not guess newly added private table schemas. |
| Lost submit ACK | Let the real SQL admission commit, then inject only response loss. Expect503/unknown; retain the original byte buffer. Recovery GETs that same request/Session; exactly one physical POST before explicit retry, no new UUID, no fake not_submitted. This is transport fault injection over committed SQL, not a success stub. |
| Isolation / revocation | Same-policy accepted actorB cannot read/write actorA Session; actual stale/replaced mobile epoch refuses side effects, withdrawal blocks fresh generation. Reuse unchanged-source identity/custody evidence; add only negatives affected by the new baseline's write implementation. |
| Conditional full worker result | Only if the new source explicitly covers worker/budget/result ports: actual qualified claim/read → original tuple-bound dispatch → explicitly synthetic provider + validated usage → settle → complete → protected reopen + bounded followup. Check one attempt/canonical scope/Task, ledger and output coherent; unknown dispatch/settle/complete keeps original pending/reconciliation, no blind resend or0-charge fallback. |

The final case is **not** enabled by catalog-name existence or an unsupported
port returning truthy data. New baseline declaration plus actual authority/negative
behavior must support it. Synthetic provider/fixture, real Managed Auth, AppVault,
real supplier billing, device and first-answer UAT remain distinct evidence classes.

## Smallest input needed from the original DB owner via Main

1. Exact immutable public Git SHA and declared port coverage. For admission:
   qa_submit_message_v1 plus its Native atomic action and original Session/Task/
   Turn/idempotency/queue authority. Keep the existing 21-port signatures/DTOs.
2. A committed materialized baseline SQL + actual hash, and explicit synthetic
   platform adapter. Existing Fixture.start/sql/close is sufficient; **no lifecycle
   method change is currently required**. Continue using new nonce-owned resources,
   read-only fixed source, no borrowed container/dirty and verified cleanup.
3. Minimal seeding facts, not a fake-ready function: two original synthetic active
   Native sessions with valid epochs; immutable QA policy/notice and independent
   actor consent. If admission additionally needs budget/capacity seeds, identify
   their exact source-owned required fields or a documented fixture-only seed entry.
   Do not grant a new client privilege or let this consumer invent hidden schema.
4. For the conditional worker case: exact existing model/endpoint/configuration/
   price-version/scope/currency tuple, synthetic sufficient limits, disabled-first
   control and covered reserve/dispatch/usage/settle/complete semantics. Actual
   context eligibility stays with its original owner. No real keys, funding or fees.
5. An original protected receipt/query to prove no duplicate admission/attempt if
   public read projections do not expose the necessary count. Prefer existing
   qualified QA ports; if a fixture introspection helper is needed, Main sends the
   exact missing method to Astra. No shared SQL/source rewrite by this owner.

## Reuse / stop boundary

The existing read consumer provides original route exports, SDK crypto fixture,
actual RPC→PG encoding, source hashes, owned resource lifecycle and cleanup. Use
that design for a separate fixed-write test once the stable SHA exists; keep the
c66 test and its accepted first-slice PR unchanged. Do not generalize it to latest
branch/working-tree fallback or turn an unimplemented-write expectation into PASS.

There is no independent service/adapter gap to implement now. This preparation
requires no database execution, mock provider, new product feature or full21/old
SCALE matrix. Deliver this minimal dependency list and STOP; original owner resumes
actual write verification only after Main supplies the stable source/fixture facts.
