# 198 public SQL compatibility

Tested product ref198c66bf644483da97b7663cc06e321d4747f1fb, canonical migration SHA256208472a066b9d8aa4ae1b06953448ed6eed362f85449dd71dadd9b78c1bb1ac7.

The accepted707 original run-native-legacy.mjs was read and used unchanged with exactly turn/text-work.test.mjs (34 cases) and scoped-edit/scoped-edit-postgres.test.mjs (25 cases). Git diff against accepted QAead confirms both suites, runner and native adapter are byte-identical. Each original suite replays all migration files, including the current canonical seed; the original bootstrap/rollback and retained-state assertions remain in place.

One execution on self-created native PostgreSQL17.11 clusters:59/59 PASS,0 FAIL,0 SKIP, exit0,54265.466084ms. Coverage includes ordinary NULL text read/list/work, consent and late writes, roles, task/Turn identity, last capacity slot, answer settlement, partial release, cancellation, clarification/repair, history bounds, source and budget guards, scoped edit/Proposal confirmation, and concurrent source/lease behavior. The original test bodies, grants, assertions, timeouts, policies and historical migrations were not edited. There was no retry or reduced matrix.

The original runner prepends its strict native test adapter. That adapter accepts only the known network-none fixture command shapes and directs them to its new0700 private Unix-socket PG directories with no TCP. It has no fallback to a real Docker daemon. Both unchanged suite cleanup assertions and the runner finally completed successfully. No Main/f4/peer/target database or cluster was used.

The raw output is preserved in legacy198-first.log.raw.gz; readable output and exact input hashes are beside it. Existing21-case evidence is reused without rerun, not added to59 as a claim of complete product acceptance. The unchanged9-minute expiry and Web/device/provider matrices were not rerun. Real Auth/provider/managed-target17.6 acceptance is not established here.

No product SQL/source fix was needed. This evidence expires for changed legacy bodies/guards, canonical migration, the original test/adapter inputs, or PostgreSQL behavior incompatible with the accepted17.11 catalog. Main retains formal review/CI/integration responsibility. This owner stops writing after the evidence commit until explicit further repair.
