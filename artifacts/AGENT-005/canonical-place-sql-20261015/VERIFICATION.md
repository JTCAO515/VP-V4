# Canonical Place Ask SQL candidate

Owner: chat 01a13ea8-0517-7213-9422-09b3ebfbe70a, actual VP-V10 project 4f2191db-3e04-4042-94b5-ec94ff67b427. Exclusive seed 20261015083120 and tests/integration/canonical-place-ask-sql. Effective model UNKNOWN. Full base 774a04573088306160908a8bae73cfd125bb6294; this checkpoint precedes the accepted 707 metadata composition.

The ordinary authenticated selected_submit calls the real submit_service_task_turn exactly once, then persists a nullable selected_place_request on that same grounded Turn in the same transaction. It keeps the original Task identity, expected_result=text_answer, policy=current_input_v1, relationship, parent and input. Receipt version2 follows the existing HTTPv2 Task port. Assistant and task_history modes remain unsupported; no replacement Goal/Task/thread, history dataflow, model route or grant is introduced. R1 Native adoption is an explicit consumer of the existing HTTPv2 port, coordinated by Main.

The original reviewed mapping/source bodies are reused as private post-auth qualification helpers after original Root/session locks. No identity substitution occurs. All helpers are denied to anon/authenticated/service_role. The ordinary Place/Guide/Privacy RPC ACLs stay denied. Synthetic source review and lifecycle/D2 calls use their existing postgres permissions with explicit Auth claim stubs; they do not prove ordinary ingress or real GoTrue.

Run: `node tests/integration/canonical-place-ask-sql/run.mjs`. The runner owns one PG17 private 0700 nonce/socket, disables TCP, uses UTC to match the accepted timestamp hashes, applies full accepted migration history, and removes only its own nonce. Optional CANONICAL_PLACE_PG_BIN and CANONICAL_PLACE_PG_MODULE select the existing PG17 runtime/library; no installation or global database is used.

Observed on local PostgreSQL17.11:

- Whole append/rollback preserves exact old catalog, ACL, roles, policies, default privileges and memberships. Only declared existing function bodies, 19 denied private helpers, one nullable column and one strict CHECK change. No new table, trigger, queue, bucket or ledger.
- All nine lifecycle guards TRUE. Exact authored definitions and metadata are pinned; original source dependencies, unknown schema additions and source drift reject instead of being adopted.
- A real original legacy grounded producer captured before append has identical complete Turn, Conversation and export JSON afterward, including all fingerprints and reverse references.
- Ordinary same-Task/Turn admission, exact raw UTF8 SHA256, byte-conflicting replay, concurrent one-admission, original resolver/current read, source withdrawal, policy/consent/cancel/session/mobile-epoch denial and old-worker bypass rejection are exercised by the targeted tests.
- Actual original erasure removes the proof; original recovery remains exact. Missing erased proof yields unknown rather than false not_submitted. Original permanent source-PK fences reject late restoration.
- Actual original D2 request/claim/turn_page emits the complete 38-source Place-only turn-core-export/3 page. Ordinary service_role ingress remains denied. The TS owner directly validated the actual page with its fixed124 decoder and recomputed its canonical sourceDigest.
- The same real SQL version2 fixture is saved in wire-positive.json and was directly consumed by the TS owner's real HTTP/SDK tests. Native verification belongs to its owner; no device claim is made here.

Current boundary: the final migration must incorporate Main's accepted707 QA ead1efc19f2f540d9056eb37ed90333388b0c8a9 definitions and retain pure-Trip literal turn-trip-core-export/1. Mixed Trip/Place43-source export, the applied export3 consumer, final independent review/CI/merge and target/provider/device acceptance are not established by this checkpoint. No parent Issue is closed and no helper-only PR is created.
