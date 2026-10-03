# #632 PostgreSQL fixture migration-order repair

Original formal failure: head efa9e16a, job111131895262, Main log /tmp/vp632-postgres.log. All11 cases fail in before hook because150000's complete function declares040000 planning_v2_place_checkpoints rowtype before that table exists.

Actual cause: fixture applied every current migration except040000, including all its successors, then attempted the040000 transactional rollback proof and commit. Before150000 existed, this erroneous ordering happened not to expose a compiled rowtype dependency.

Only fixture order changed: lexically sorted current checkout predecessors; actual040000 BEGIN/ROLLBACK; unchanged assertions that table and public export procedure do not exist; actual040000 BEGIN/COMMIT; every lexically sorted current checkout successor, including130000 and150000. Nothing skipped; no SQL/type/permission/runtime/assertion/timeout change. Main #631/af50b6b2 normally merged into this PR branch, preserving other owner files.

PASS11/11 affected tests via `VP_TURN_DB_TEST=1 node --experimental-strip-types --test tests/integration/turn/planning-v2-durable-checkpoints.test.mjs`. Pinned owned network-none PostgreSQL, all current migrations installed in dependency order. Syntax/diff checks PASS. No unrelated wide suites repeated. Remote new-head CI remains pending; original formal FAIL preserved. #561 remains Closed; no target/fees/role activation.
