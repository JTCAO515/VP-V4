# PR668 exact6eef PostgreSQL concurrency regression

Official run37593146257/job112699341680: setup/install/classification/images PASS;
Run lane failed. Annotation only exit1 (Node20 deprecation warning unrelated).
isolated-postgres result658 tests/656 PASS/2 FAIL/0 skipped,todo,cancelled,696s.
Own conversation source-audit parent is PASS. Preserve this exact old FAIL.

1. tests/integration/privacy/trip-deletion.test.mjs:130 original Trip/chat race:
exactly one transaction succeeds, but loser did not return either original
TRIP_HAS_CHAT_REFERENCES or TRIP_DELETION_PENDING_OR_COMPLETED. Original lifecycle
queued-delete trigger uses owner34 try-lock. New chat before-source guard holds
owner34 and can make that original lifecycle guard reject before accepted Trip
guard/denial semantics.
The CI assertion does not print loser stderr; do not claim its raw error was
observed. The source explains the preemption and sole SQL should confirm actual
outcomes with this affected original race, without changing the assertions.

2. tests/integration/turn/text-work.test.mjs:391 original capacity insert versus
held task relabel: pg_stat_activity Lock wait never appears (3s barrier timeout).
Original guard_text_capacity_scope locks task FOR SHARE. The new guard_source_v1
on service_tasks UPDATE holds owner34; its capacity INSERT trigger alphabetically
precedes the old guard and tries that same owner34, rejecting instead of reaching
the required original blocking lock. Also inspect added entity/parent NOWAIT
where it can similarly preempt original guards.

Root source boundary is new060000 guard_source_v1: unconditional owner34 try-lock
and parent key-share NOWAIT on original writers; appended triggers include task/
capacity/chat. Actor/admission/erasure guards can retain their own bounded NOWAIT,
but unrelated original writers must preserve their accepted lock/error semantics.
Minimal sole SQL fix must retain current erasure source-CAS and permanent old/new
parent denial while avoiding preemption of unrelated original concurrency flows.
Do NOT accept CONVERSATION_CONFLICT in the old oracle, weaken actual Lock-wait
assertion, enlarge timeouts, disable source fences or blindly retry CI.

Hand to current sole SQL01a1154f for minimal same-task source correction and the
two affected original scenarios (plus any directly affected fence negative).
TS does not modify migration or original PG fixtures in parallel. Green lanes
are not rerun locally. New fixed head requires Main formal/all applicable CI;
MERGEHOLD remains. No target/provider/data action or new scope.

## Actual targeted diagnostics (original assertions untouched)

Temporary copies outside repository add diagnostic output only; original migration
and test files compare unchanged. Original two failing names selected, no matrix.
Local same-head diagnostic completed with both original assertions FAIL:
- controlled Trip iteration0: request TRIP_HAS_CHAT_REFERENCES, chat exit0;
- concurrent Trip iteration1: request LIFECYCLE_LOCK_CONFLICT from
  trip_lifecycle_private.lock_owner_v1 -> deletion_queued_v1 -> original
  request_trip_deletion_v1 inserting trip_deletions; chat exit0;
- capacity marker pg_stat_activity snapshot=[] (no backend waiting on a lock),
  raced INSERT exit3, CONVERSATION_CONFLICT from guard_source_v1 line24 at RAISE,
  i.e. unconditional owner34 TRY before old guard_text_capacity_scope FOR SHARE.
Both temporary tests' original owned containers removed by their unchanged hooks.
Candidate root cause is now directly observed rather than inferred from CI timeout.

Same-batch official NativeHTTP2 job112699341785/run37593146257 exact6eef:
native-text-http.test.mjs:269/:434 concurrent publish loser actual500/code55P03/
CONVERSATION_CONFLICT, violating original REVISION_CONFLICT or artifact PK CAS
outcome. The original test group is8 tests/7PASS1FAIL/zeroSkip/cleanupPASS; first
HTTP shard remains SUCCESS, second and aggregate FAIL. This complements the two
PG outcomes. Source result/artifact guard takes the same broad owner34/entity
NOWAIT path before original writer serialization. Current sole SQL consumed all
three; TS records evidence and does not modify source/old PG fixtures or weaken
oracles. Core regression requires source correction before protected merge.
