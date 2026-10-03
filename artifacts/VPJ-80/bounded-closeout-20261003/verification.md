# VPJ-80 complete TS controlled worker batch checkpoint

Branch codex/vpj80-bounded-planning-closeout-20261003, original exclusive vpj80-bounded-execution worktree; origin/main #628 merged base. Contract checkpoint f6d9f346 plus Main-reviewed execution/principal/currency/request and budget bridge clarifications in the same feature batch. No SQL/registry/Swift edit.

## Implemented

- Explicit default-disabled bounded v2 worker uses existing work/lease identity and exact020000 qualification. Strict server execution snapshot/registered price expectations; four bounded steps, one model, map cap13,120s deadline,15s cleanup. Started/unknown checkpoints reconcile without resend; completed same-basis fresh place and SQL-qualified settled output can be reused. No model confirm/booking/payment actions or new coordinator.
- Real protocol/usage/price/durable-budget primitives reused. Frozen canonical request constructor before effect; reserve and dispatch current-source checks;050000 bind while reserved before dispatch; sameattempt immutable binding; unknown usage price/over-limit does not settle as zero. Audit usage callback plus primary private SQL output usageWire/hash persistence precede settlement. Lost output ACK reads same hashes only; no repeat send/write.
- Hosted composition uses existing real provider HTTP and AMap per-leaf adapter, exact destination/recipient configuration and per-attempt closures. After credential retrieval, configured collector receipt must commit current authority/one-shot invocation before fetch. Request ID/digest/payload bytes tied to original attempt, not global/latest. No local fixture executor/070/080 permission promotion.
- V2 budget RPC maps exclusively to new default-closed planning_intake_budget_v1 bridge. No old service ledger RPC/table write fallback or privilege grant. Existing durable algorithm unchanged.
- Current-source recheck, strict030000 prepared projection/result action, atomic v2 completion API dependency. Completion ACK loss reads dedicated current-readable completed receipt, does not call accepted-only020000 after completion or replay publication/provider.
- v6 first_party preview/selected-source content is not sent to provider. Only current020000 goal/delegation/typed intake and allowed fresh observation enters the prompt. Existing completion fence remains intact.

## Checks and actual limits

PASS24/24 full affected contract files:8 new TS worker/mock SQL/provider cases plus complete existing durable-budget, planning usage and HTTP transport suites. Negative cases cover defaultoff zero credentials/I/O, foreign binding/output ACK, false local permit, changed source/dispatch, unknown tool/price, caller budget override and configured recipient rejection after credential before supplier HTTP. Full-flow mock cases assert bind→dispatch→provider→usage/output→settle→completion and exact ACK recovery, plus completed state reuse. Mocks are explicit; no SQL or signed principal validation is claimed by them.

PASS typecheck, staged-source policy lint, docs and diff. Initial generic inference/ES2017 BigInt and a host mapper typo were fixed. Early mock Qwen response omitted required index/role/finish_reason; protocol rejection was correct, fixture repaired without weakening validation. No unrelated/unchanged13tuple/NULL PostgreSQL matrix repeated.

UNRUN: actual new150000 SQL integration (sole owner559 implementing), deployed signed collector identity/ACL, real provider/map fees, host activation/scheduler/target/App-closed/device acceptance. Every new function is default disabled; no live caller, seeded profile activation, role creation, JWT issuance, credentials install, grant, target migration/deployment or fee action. This is the complete owned TS implementation checkpoint, not full #561 development closure until real SQL interfaces are integrated and checked. Main coordinates the single feature batch/registry/CI.
