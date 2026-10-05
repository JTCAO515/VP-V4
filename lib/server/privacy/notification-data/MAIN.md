# Main readback / precise dependencies

First own runtime write: contract.ts; rows.ts/protocol.ts/export.ts/http.ts and
new POST route implemented. WIRE.md is one closed SQL/Native wire for review.
Shared files unchanged; no new SQL, runtime flags/config, target operation or other
thread message. Original material HEAD f1f065c8 used, no dirty copy.

Required Main decisions before dependent implementation:
1. Review closed WIRE (full eight-table+legacy/new inventory, three explicit scopes,
   exact JSON shapes, root order and permanent producer/worker fence/drain design).
2. Verify unused new migration slot and create independent official SQL owner.
   This session will not write runtime SQL or reuse another task's SQL session.
3. Obtain exact release/lease original notifications scheduler/delivery-contract/
   APNs + travel_reminders_v2 fence seam, old coverage/new module entries, native
   Session/PBX/registry. Current session only owned files until then.
4. Relay WIRE to sole Native owner. Data-token preview is explicit private owner
   export; token must never reach general logs or persisted test artifacts.

Full #239/ALL1 missing/ALL2 OPEN. Own TS source isn't complete scoped runtime
until SQL + mandatory sender fence + caller integration are implemented/verified.

## Main a033c5 follow-up closed (v2)

No guessed clock-skew constant. WIRE v2 defines begin_fenced + exact leaseBudgetMs,
RPC-start monotonic process permit through actual APNs leaf writes; old begin
blocked. Owned send-budget.ts implements nonrenewable single-send permit and
monotonic barrier, drain.ts implements bounded service-only generation/nonce
finalization using EXISTING NativeConfig local service credential (no key/role
creation or activation). SQL does not fabricate an elapsed proof from wall-clock
expiry or pg_sleep. Two-phase ordinary-owner atomic fences/body erase -> trusted
monotonic barrier -> actual SQL terminal receipt, all within new request record,
no queue. Missing drain authority/ACK leaves original-op fenced/unknown. Full DTO/
minimal shared hunks/retained state inventory updated once in WIRE.

Requires Main review of this exact narrow service finalization seam, mandatory
sender lease before new SQL. Shared worker files still unchanged. Target/actual
PG/APNs/Native execution not claimed from fixture tests.

Validation: focused HTTP/permit/controller tests 10 PASS, 0 FAIL, 0 SKIP (synthetic
RPCs; one actual process minimum5s duration); pnpm typecheck PASS after fixing local
BigInt target syntax and decoder narrowing; source-policy lint PASS. Shared
notifications/coverage/SQL/scripts/ios diff EMPTY versus immutable base. New
route integration build, actual PG/RLS/GoTrue, APNs leaf write, native file consumer
and target/ALL2 UNRUN pending required SQL/sender lease/Native integration.

Final wire additionally preserves erased outbox reminder-parent and
watch+semantic unique identities; deleting original unique rows alone could let
poll synthesize old delivery with a new random UUID. No source-body tombstone.
