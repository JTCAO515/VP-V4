# Qualified intake comparison — independent preparation

Branch `codex/vpj79-qualified-intake-comparison-20261003`; base `80fa7862060f9549e0665a2c818667f4955fd3a1`.

Implemented: one result-domain pure projection/closed content validator, independent contract negatives and [binding proposal](../../../docs/contracts/qualified-intake-comparison-binding-proposal.md). No live module imports it; no unmerged intake code is imported. Current input/rail observations in tests are explicit synthetic contract objects, not actual producer results or storage receipts.

PASS: focused contract5/5 across zh/en, ten-day and corrected/cleared input, strict missing/extra/scalar/date/duplicate/readiness checks, binding ID/revision/Memory/digest mismatch, observation source/bounds/freshness/nulls and arbitrary prose/action/URL/label inference negatives. Existing generic comparison parser accepts the generated inert content structure; this does not prove stored publication.

PASS: typecheck/lint/diff after the initial TS18046 narrowing repair. SQL/Auth/storage/worker/consumer/provider/target/full-loop integration remains UNRUN because authoritative post-admission intake binding has not been frozen. Existing completed HTTP/SQL evidence is not substituted for this missing connection.

Resource footprint: original isolated worktree, no port/service lease, no Simulator or target/provider/cost operation. Planned reserved migration010000 is not created or applied; no registry/ACL/200000/native/admission/worker edits. Preserve prior branches/evidence. Scope remains the current qualified-comparison batch; do not claim a standalone pure function closes the parent or the complete flow.

## Private SQL preparation — 03030000

Main approved two strict private projection/validator functions consuming frozen bridge9570497c. Actual network-none pinned PostgreSQL fixture loads main migrations, then unchanged FULLSHA intake4728c18f/bridge9570497c dependency SQL, then this owner's03030000 transactionally. No dependency runtime source is copied into this branch or modified. 200000 has subsequently entered actual main via #623;020000 remains fixture-only pending its normal integration.

PASS: `VPJ79_QUALIFIED_COMPARISON_PREP=1 node --experimental-strip-types --test tests/preparation/qualified-intake-comparison-postgres.test.mjs` —4/4,8266ms,0skip. Tests assert complete en/zh SQL/TS equality, no artifact/event/capacity/cost effects, BEGIN/ROLLBACK/COMMIT; wrong owner/turn/lease/double digest/locale, source/environment/freshness/schema/range/forged content return NULL/false; actual ordinary full correction, source hide and text consent withdrawal remove old-binding eligibility. All API roles lack EXECUTE. A synthetic valid v2 lease plus valid prepared content still cannot call legacy completion, mutate state, publish an artifact/event or finish the accepted Turn.

Original run:2PASS/2FAIL from fixture JSON.parse(empty psql output for correct SQL NULL). Fixed only NULL result decoding, retained original failure log, reran four affected groups with4PASS. No guard/role/trigger/completion change. The fixture removes only its own container;63420 and all Simulators remain unused.

UNRUN: actual claim/dispatch/checkpoint/settled-attempt/publication, real producer/consumer integration, CI/target migrations and provider/cost operations. The observation argument is not a persisted tool receipt. This preparation cannot bypass the remaining v2 executor/completion seam; false readiness/execution flags remain. Local test remains opt-in preparation outside CI; CI registration is Main integration work, not claimed as integrated pipeline evidence.


## Formal integration on merged main

Rebased successfully onto actual main `a9e02f3a196b8c299f79e680ace7cdac0f26c5c2` (#623 intake + #624 bridge). The formal test now loads **all actual current-checkout migrations** in filename order (this owner migration additionally checked with rollback then commit). No git-object replacement or skipped dependency. The earlier fixed-fixture logs remain historical evidence.

PASS: the same four affected PostgreSQL groups, 4/4, zero skips, 8215ms, using the opt-in command above; no unchanged TS/typecheck/lint suites were rerun. Full zh/en projection equality, invalid-source/digest/lease/correction/consent cases, API role EXECUTE denial and the existing v2 completion hard fence all hold on merged dependencies. `private-pg-current-main-pass.log.gz` contains this run. Container cleanup succeeded.

Dependency Git blob provenance (both files byte-identical to earlier frozen sources): intake200000 `35da6ecb49f1eb34ba1c881b22bc0d6efe5076d6`; bridge020000 `f269bffd62184576b1a1014b15013b5afc7fa6cc`. Own SQL blob `2a377ad243e0c121a6d97bc7c028013311b7cad5` is unchanged from private preparation. Scope and all execution/publication/target/provider UNRUN limits above remain. No producer/claim/public permission wiring was added.


## Standard postgres gate adaptation

Main requested the existing four cases be moved to `tests/integration/turn/qualified-intake-comparison.test.mjs` and gated by the standard `VP_TURN_DB_TEST=1`. Only the file path, two relative imports and opt-in environment name changed. The four test bodies, actual-current-checkout migration loader, pinned network-none database, private SQL and product TS are unchanged; prior evidence remains valid.

PASS: `node --check tests/integration/turn/qualified-intake-comparison.test.mjs`; direct gate execution `VP_TURN_DB_TEST=1 node --experimental-strip-types --test tests/integration/turn/qualified-intake-comparison.test.mjs` — 4/4, zero skipped/cancelled/todo/fail, 8383ms, own container removed. Log: `private-pg-standard-gate-pass.log.gz`. Diff reviewed and whitespace check passed.

Registration handoff: add this exact test path to `LANES.postgres.steps[name=isolated-postgres].files` in `scripts/ci-suites/db-integration.mjs`. Existing lane environment already sets `VP_TURN_DB_TEST: "1"` and its Node command already uses `--experimental-strip-types`; no new runner switch or image is required. This shared registry file is assigned to HTTP owner and was not edited here. Full registered lane/CI remains UNRUN pending their one registration and Main combined integration. No broad lane or unchanged product suite was rerun.
