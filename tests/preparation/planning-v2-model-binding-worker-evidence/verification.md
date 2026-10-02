# Private050000 → frozen worker seam verification

2026-10-03. Dedicated validation branch codex/vpj78-v2-model-binding-worker-test-20261003 from clean integration c309ff63afdadbb9b972bd7b54c2bb0451eef4a3 (base626 e6f66d70). Original554 binding and c309 PR-wait branches remain clean/unchanged. Worker is imported normally from this checkout; Git blob90a63e1846d58ad3dc8038137d7e517d3018d411. No snapshot-code replacement or Git SQL injection.

PASS actual network-none PostgreSQL5/5,0skip. All actual checkout migrations applied, including020000/03030000/40000/050000. Ordinary synthetic owner/context/lease and existing legal reserve/dispatch/finish primitives only fixture setup. Real13tuple private binding read returns its actual22-key object; real40000 read supplies current worker snapshot. No hand-written binding JSON stands in for either read.

- Reserved stays reserved (actualMicros:null); worker blocked. Dispatched/pending stay those exact enums with unknown_effect; settled, including real fixture actualMicros0, stays settled and blocked. NULL money never becomes0/none.
- Sticky unknown across reserved/dispatched/pending/settled/released has no exact enum in the existing modelAttempt protocol. Test-only adapter explicitly throws, worker blocked before permit, rather than discarding the marker or inventing pending/none/released.
- Clean released stays released/actualMicros:null. Original protocol still requires its separate independent permit for a new place request. This test supplies no permit, so blocked; it does not mint one from qualification/binding/false flags.
- Real missing/ambiguous binding reads are blocked, never missing/none fallback. Completed place records seeded via actual40000 before model reservation do not bypass any reserved/dispatched/pending/settled/sticky-released restriction.

Every run asserts no new claim/place/provider/save/unknown/prepare/verify call, no result/execution flag raised, and unchanged ledger/correlation rows after worker verification. Actual SQL helpers do not grant paid processing. Synthetic fixture settlement is a recorded row only, not real provider billing/output. No external provider/network/port/Simulator, no new runtime adapter/API/SQL/registry/output/dispatch/completion capability.

Command: VP_TURN_DB_TEST=1 node --experimental-strip-types --test tests/preparation/planning-v2-model-binding-worker.test.mjs. Both new mjs syntax checks and staged diff PASS. Random owned PostgreSQL vpj78-model-worker-e9751735 used networknone/socket0700 and was removed by the fixture after-hook. Dependency symlink removed before freeze.

This is test-only safe mapping evidence, not production adapter authorization. A future live adapter must preserve the unknown/reconciliation semantics and current exact private call/lease provenance; JSON read does not echo lease or independently prove it. No exact unknown enum exists today, so that integration state must remain blocked until an explicit reviewed contract exists. Formal union CI, production worker/provider/model output/result completion/API/native/device/user/full-parent acceptance remain UNRUN. The underlying11 binding and560 completion cases were not repeated.

## Source fingerprints

- tests/preparation/planning-v2-model-binding-worker.test.mjs: `4479d3cdd86a42e5d430f030ac83e97d5fbec13e036eaa5a1cd5e3eeb32f6ebc`
- tests/preparation/planning-v2-model-binding-worker-adapter.mjs: `975518aeeb5bea0d81ce2f0059778383206aefcd59e0901c45187b97cfa47394`
