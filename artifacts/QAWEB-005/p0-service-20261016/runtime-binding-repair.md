# Approved tuple runtime repair

Stable source: `5b82f71665f3ef59b976e1f2a1d0f15740ed7aec`.
Native-PG lane follow-up: `27873cf6` (explicit opt-in only, case assertions unchanged).
Normal merge of QA `c0ef6edefcc2ac63ed665d14305cca1ad541504f` retained this
owner's prior diagnosis commits; merge base before implementation was `1a938b7c`.
Exact before/patch/after hashes: `runtime-binding-pins.json` (17 scoped paths).
Patch SHA256: `319df3bd0be362f5e18cdb57b073f117e993023369f237fb39afaaaf2fca1d67`.

## Behavior and source boundary

Before: target/2's actor tuple stopped at offline validation. The real planner
accepted another qualified owner/policy/scope with groupLimit1; local zero-network
reproduction is in runtime-target-gap.md. The pipeline existed but lacked the
deployment authorization binding. Prior composition-only findings do not prove
approved-actor isolation and are superseded by this repair on that point.

After: validated target/2 emits profile, endpoint, and one closed immutable
`qa-runtime-binding/1` JSON value. QA installer passes it as
`VISEPANDA_QA_RUNTIME_BINDING`; `/4` CLI rejects absent/malformed/project-mismatched
binding before secret or DB access. Shared hosted dependencies supply it
independently to planner and QA worker. Neither derives it from returned groups
or job IDs. Foreign owner/policy/scope/notice fails without claim/budget/provider.

New `20261016040522_qa_runtime_binding.sql` is append-only, with only the two
Main-allocated public functions. `qa_ready_groups_v3` filters approved owner,
policy and real immutable `text_policies.notice_hash` before LIMIT, preserves
original uniqueness/eligibility, verifies the sole scope ID and returns the
actual policy hash. `qa_authorize_dispatch_v2` locks/reads original protected
lease and policy, verifies tuple and original scope ownership, then delegates
to unchanged v1 in the same transaction. Original reserve/dispatch/settle,
unknown ACK and source/consent semantics remain authoritative.

Context's logical v1 authorization port is unchanged: QA worker injects the
independent tuple and maps only that logical request to physical v2. Local
direct target continues using original v1; /1-/2 hosted modes and historical /3
parse/audit behavior remain separate. No old migration, function, ACL, global
CI, context source, real target or credential file changed.

The approved usage-audit seam now shares one pure job/target/price validator
with runtime instead of constructing an execution worker. Original transport
configuration and receipt/fee checks remain, and forbidden callbacks cannot
read keys or send. Historical audit GREEN and missing-runtime execution
zero-I/O rejection GREEN were verified together. No trusted tuple is fabricated
from journal metadata.

## Verification of the stable source bytes

- QA service/security + discovery/profile: **71/71 PASS**, no skipped.
  `node --experimental-strip-types --test tests/security/qa-agent-service/*.test.mjs tests/security/qa-hosted-installer/profile.test.mjs tests/security/qa-hosted-installer/discovery.test.mjs`
- Offline canonical target/emit-runtime plus actual QA shell parsing: **2/2 PASS**.
  `node --experimental-strip-types --test --test-name-pattern='QA package emits|actual QA installer parsing' tests/security/qa-hosted-installer/target.test.mjs`
  Includes exact emitted tuple and one intact env value; absent/empty/extra runtime
  lines refuse. This executes the real parsing hunk, not Docker or ECS startup.
- Original hosted CLI/S1: **18/18 PASS** with permitted local test sockets.
  `node --experimental-strip-types --test tests/security/turn/hosted-text-worker.test.mjs tests/security/turn/hosted-secret-profile.test.mjs`
- Actual isolated native PG17, Unix-only: **PASS**, five named proof groups:
  old catalog exact; older foreign actor vs exact actor with LIMIT1; foreign
  tuple/notice/ambiguous scope negatives; dispatch mismatch with unchanged
  reservation/receipt; original v1 success once and full caller rollback.
  Both new functions postgres-owned SECURITY DEFINER with empty search_path,
  service_role-only EXECUTE; anon/authenticated actually denied. All 161 prior
  migration source bytes replayed; original-source manifest SHA256
  `fd875c0a7dde5a09b4f5e4a4b3b5fd229006095e40aa3dcd692e522069eacf71`.
  `QA_RUNTIME_BINDING_PG=1 node --experimental-strip-types --test tests/integration/qa-runtime-binding/postgres.test.mjs`
  Core proof own instance `/private/tmp/qrb-JNPpMo` stopped; no TCP/target/Auth/provider.
- Gate follow-up actual PG run: **1/1 PASS, zero skip**, own instance
  `/private/tmp/qrb-DM2QrK` stopped. Without opt-in the expected single SKIP was
  separately verified. Main alone registers the mandatory native17 lane.
- TypeScript `tsc --noEmit`, policy lint (892 files), `bash -n`, diff check: PASS.

Retained failures: old planner's approved-tuple gap reproduction; the first
binding-required patch made old audit fail RED before the approved pure-validator
adaptation; test development had an omitted readFile import and was corrected.
Unprivileged PG initdb was blocked by sandbox; the authorized native-PG run above
passed. No test assertion, safety gate or timeout was weakened to pass.

Docker-dependent installer test is **UNRUN for this repair**, per Main's explicit
no-container scope. Earlier daemon-unavailable failure remains in hosted-composition.md.
Target migration/apply, Vercel env, ECS/image/install/start, real provider cost,
real login/answer/persist/reopen/multi-turn/device/TF: **UNRUN / STOP**.
Code must not be activated without the reviewed new RPCs and validated exact
target package; flags alone still do not establish service readiness.

Implementation and required local checks are complete. No source process,
in-flight edit, planned or successor writer remains for this repair. Future
ownership of the delegated QA4/CLI/deployment hunks returns to Main; this owner
will not modify them again without a new exact lease. Main owns formal review,
CI registration, PR/normal merge, target migration plan and activation package.
