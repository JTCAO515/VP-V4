# DB-REBUILD-20261017 — empty local PostgreSQL baseline

Decision: business label DB-REBUILD-20261017. Main formally relayed original
BestJ→Mac→Main and JT's reported 2026-10-17 06:22+08 message
Sentinel_7260334327208191be0cd46bbac5a719: “那就重新写数据库吧”. This is the
reported source chain; no new SDK fields, signatures or upstream read are invented.
It authorizes this local synthetic implementation, not a target cutover.

QA base actually fetched: 813f9d7fdf956e84fe769e823850e79b79508bf4 on
codex/qaw005-independent-target-20261013. Later QA7093 changes are unrelated host
controller/locks. The service contract is pinned to
648f02240faa802ca93276a1b43202215c0affd6, copied unchanged as service-ports.json.
Native contract reference: dda77a991cda08d5397e52f1fa34d4dca3a2d75f. Existing
Go2China/dzqd target and origins are unchanged; no connector is used here.

## Runnable first increment

`PYTHONDONTWRITEBYTECODE=1 python3 scripts/qa-agent-db-baseline/run.py --run`

Uses only the fixed locally cached image, a new nonce-labelled container, Unix
socket, network none, no ports/mounts and bounded CPU/memory/processes. It builds
two fresh databases, runs contracts via separate SQL connections, compares
function catalog fingerprints, then removes only the inspected immutable owned
container ID. No DSN, archive, identity, old container or target option exists.
`Fixture.start/sql/close` and `assemble.build` are the reusable test interface:
a service owner must instantiate a new Fixture, never attach to this owner's
container. Do not run any unsupported command against a shared database.

platform.sql is a **separate synthetic Auth/session/claims adapter**, not deployable
application schema or GoTrue/JWT acceptance. baseline.sql contains selected
application objects and is also not a target migration. assemble.py materializes
pinned current source declarations plus an explicit overlay; it does not replay
historical migrations. Original append-only migration files are untouched.
reuse-map.json lists source/blob hashes and coverage. This is selected-port
compatibility, not whole-catalog or whole-history equivalence.

Current SQL slice covers original Native session/profile/policy/consent, atomic
message admission and byte-sensitive idempotency, scoped claim/context, tuple-bound
budget reserve/dispatch, synthetic usage settlement, durable completion/reopen,
follow-up history, unknown ACK/reconciliation and cancellation. Answers are written
by qa_complete_work_v1 after dispatch/settlement, not fixture-seeded. See WRITE-SEED.md
for exact consumer input. Real Auth/provider/target/device remain UNRUN.

Browser auxiliary relations and non-QA product writers are outside this baseline.
Private empty anchors satisfy read-only conditional dependencies; no fake success
functions or whole-catalog fingerprint bypasses are installed. Existing function
bodies are selected from pinned source; two historical schema/rename operations
are materialized explicitly. This does not claim the full original catalogue or
its broad product lifecycle graph is recreated. TripProposal writers stay absent
and ordinary clients cannot write Trips. Target migration remains a separate scope.

## Non-destructive transition plan — not executed

1. Finish the exact Native write ports and independent service fixture contract
   checks, including duplicates, cross actor/epoch, revoked consent, budget caps,
   tuple-before-LIMIT and unknown dispatch/result reconciliation.
2. Separately authorize a bounded current-target metadata/data audit. Preserve
   existing Auth identities, IDs, original Session/Task/Turn lineage, pending ACK
   bytes, consent and budget/dispatch ledgers. Never auto-rePOST unknown requests.
3. Review an explicit forward mapping and compatibility contract for the same
   existing target. No drop/truncate, global permission widening, new project or
   implicit full-history apply. Existing failed restore is not a proven rollback.
4. Before any switch, independently prove non-destructive mapping and reversal
   including writes made after switch; keep a single writer, explicit rollback
   trigger and original API/identity semantics. Trip changes retain Proposal→diff→
   confirmation. If reversible mapping is unavailable, do not switch.
5. Target writes/cutover, worker enablement, real provider fees, credentials and
   device acceptance need their own explicit scope. None is performed by this code.
