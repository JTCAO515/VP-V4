# #636 exact6b1 PostgreSQL zero-skip failure

Formal job111193387591 isolated-postgres reported272tests266PASS0FAIL6skipped; strict lane correctly rejected. All six skipped cases belonged to the new source-impact-outbox.test.mjs, whose VP_TAKEDOWN_DB_TEST opt-in was never set by the existing runner.

Only gate name changed to existing postgres VP_TURN_DB_TEST, already set to1 by isolated-postgres. No runner zero-skip/FAIL/cancel/todo rule, assertion, SQL authority, runtime or scope change. No old-wide matrix repeated.

Actual affected-file command `VP_TURN_DB_TEST=1 node --experimental-strip-types --test tests/integration/takedown/source-impact-outbox.test.mjs`: PASS6/6,0skipped,11.313s; source capture/review/actualeffect ACK, negative/retry/history privacy and precise lifecycle all executed. Diff check PASS. New formal remote head still needs normal CI and Main review. No signed-ops/deployment/grant/fee claim; whole207 stays Open, support200 remains separate.
