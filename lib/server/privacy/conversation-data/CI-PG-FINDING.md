# PR668 exact6eef PostgreSQL concurrency regression

Official run37593146257/job112699341680: setup/install/classification/images PASS;
Run lane failed. Annotation only exit1 (Node20 deprecation warning unrelated).
isolated-postgres result658 tests/656 PASS/2 FAIL/0 skipped,todo,cancelled,696s.
Own conversation source-audit parent is PASS. Preserve this exact old FAIL.

1. tests/integration/privacy/trip-deletion.test.mjs:130 original Trip/chat race:
exactly one transaction succeeds, but loser did not return either original
TRIP_HAS_CHAT_REFERENCES or TRIP_DELETION_PENDING_OR_COMPLETED. Original deletion
uses owner34 advisory barrier. New before-source guard gets owner34 by TRY and
can return CONVERSATION_CONFLICT before original Trip guard/denial semantics.
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
