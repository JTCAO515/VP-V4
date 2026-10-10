# Main one-batch review / exact final1b8 dependency

Status: complete reviewable SQL candidate + owned isolated PostgreSQL source proofs; product append slot/shared definitions/triggers/ACL/pins NOT leased. Branch remains base6e; dependency1b8 is a stable PR source, not falsely claimed merged. Only this artifact directory changed.

## Exact source and candidate order

151 original SQL migrations taken directly from git object1b8efcbc174bc116cd3b85524525b1d538fafe45; sorted full file/SHA list final-source-manifest.json. This includes0800 (in original base6e but omitted by an initial inherited cutoff; that earlier phase is not final proof). No old migration edits.

1. events-core.candidate.sql: 2 private RLS tables, strict typed payload/discriminator checks, private source tuples, head allocation, canonical link/source/text_content hooks, bounded full backfill.
2. events-reader.candidate.sql: bounded current Native reader, anchor/page/sentinel qualification and original result_state_v2 availability.
3. events-lifecycle.candidate.sql: current original Conversation/Result/Turn/D3 proof-bound retirement, immutable scrub, same-counter idempotent notification, original permanent source fences on the derived tables. No parent-domain enlargement.
4. events-witness.candidate.sql: bounded selected turn/artifact index witness, exact digest/CAS, original source locks then head locks, no later source lock.
5. privacy-handlers.candidate.sql: six exact final original Conversation/Result source/lock/erase definitions; private sourceDigest witness, unchanged public counts and erasure selection. source-catalog.candidate.sql: exact two relation PK registrations and owned-witness classification, no namespace exclusion.
6. d3-handlers.candidate.sql: exact linked Trip graph and original executor; witness enters existing graph digest, original source graph locks then heads; retirement after existing execution-xid authority, before original deletes.
7. turn-handlers.candidate.sql: exact four current Turn source/lock/erase/write-hook definitions; only selected Turn/artifact graph witness; retained parent data and other/new Task authority preserved.
8. terminal-helper.candidate.sql + writers.candidate.sql: current three effective claimers have exactly one added internal helper call on lock_turn=false. Original terminal function emits actual cancellation atomically; body/money/unknown charge untouched. Worker current explicit release must be converted by Main into exact shared lease.
9. schema-pins.candidate.sql + turn-schema.candidate.sql + runtime-pins.candidate.sql: full exact predecessor guards asserted, explicitly selected candidate literals and reviewed actual delta. Final global catalog75695f..→01fd3f.. from exactly2newtables; original table column/PK/check/FK delta0. Conversation incoming FK delta2; Profile original table trigger delta1 (text_content insert hook). Runtime retains original105 definitions (94 unchanged,11 precise changed) +15 explicitly named delivery helpers; original43 Turn module function count and three supported Auth variants unchanged. No automatically accepted harvested pin.

## Actual proof / limits

- bootstrap-final1b8.log / final-source-manifest.json: full exact151 baseline replay exit0.
- baseline-final1b8-guards.json: 8 original schema/runtime/D2/hooks TRUE.
- runtime-final1b8.log: 8 candidate guards TRUE; own fixture only.
- handler-proof-final1b8.log: original Result preview→source-boundCAS→erase→ordinal replay; retained conversation/Task/Turn/Trip; no source ID retained in index.
- conversation-proof-final1b8.log: original Conversation preview/CAS/delete; whole-parent cascade clears both tables, original unrelated Trip survives, reader denies.
- turn-proof-final1b8.log: original selected Turn preview/CAS/delete; source rows retired, parent conversation/goal/task/thread/Turn preserved; cursor0/deleted anchor/already-acked replay; same-conversation fresh canonical Task appended/read at sequence7.
- baseline6e owns previous canonical source/link/status/result/dedup,50+1 paging and actual source rollback/reuse checks. Its source behavior evidence is reused, not presented as full final integration or signed Auth proof.

SQL claims and privileged synthetic fixtures are clearly distinct from ordinary signed GoTrue/HTTP/native/device/target acceptance. Actual executed command exits are recorded in tool evidence/logs; scripts with earlier failures are not passed off as suite completion. Initial witness alias ambiguity was fixed before final original handler proof; a test's wrong receipt.decision.kind assertion was corrected to the actual original state/sourceResult contract. No weakened original assertion, role/grant workaround or target permission change.

concurrency-proof-final1b8.log proves genuine canonical terminal transactions serialize through the head without commit inversion, uncommitted head remains invisible, and changed native epoch denies stale SQL-claims scope. retirement-race-proof-final1b8.log proves an admitted page/locked source cannot be partly erased, then original Result erase atomically retires and exact artifact GET is empty. acl-proof-final1b8.log proves narrow candidate execute/table ACL and RLS negatives. goal-proof-final1b8.log proves original Goal amendment preserves authorized historical Task hints while old artifact is unavailable/current=false, new Task/reconnect remain admissible, revoked consent is denied.

Remaining owned pre-product action: Main frozen-candidate full batch review and exact current owner leases. Main current owner releases/unused future append slot precede product implementation. TS remains sole integrated PR owner and signedAuth/SSE handoff owner; Native remains sole current GET/lifecycle consumer owner. No Issue closure or complete parent claim from this candidate phase. Final source is frozen for review; remaining signedAuth/SSE/native/device/target acceptance is owned by the integrator/Native after the approved append implementation.
