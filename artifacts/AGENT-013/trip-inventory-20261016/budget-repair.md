# Spec P2 repair: irreversible cumulative byte exhaustion

Independent Spec review at Main head `185c2397` identified that `inventoryBudget` raised MODEL_OUTPUT_INVALID after exceeding the cumulative byte bound, but its next `check()` did not retain that condition. The existing Ask driver correctly treats submit transport/parser failure as unknown ACK and tries readback; the new shared transport incorrectly allowed that readback to dispatch after its total was exhausted.

Owned repair source: `96dc291b890014f0b4cbde74d5bef6b6aec39598`, only `evals/harness/runtime-trip-inventory/transport.ts` and its dedicated security test. No old Ask driver, grader, threshold, bound or identity/SQL code changed.

RED: `budget-red.log`, 1/1 failed. A valid H04 plan with maxTotalBytes=8192 and maxResponseBytes=8192 completes before acquisition and pre-submit reads. Submit returns a no-Content-Length stream of two 4096-byte chunks (within the single-response cap, above the remaining shared total). After the total-overrun exception the transport actually dispatches one further session request, violating the asserted empty post-submit call list.

GREEN: `budget-green.log`, 1/1 passed. `totalExhausted` is now permanent and checked before later dispatch/read/response disclosure. Crossing the total budget sets it before throwing; a subsequent dispatch with exactly zero total bytes remaining also closes permanently. The first crossing chunk is already received and counted; it is cancelled/discarded and does not authorize another read/request. The discriminating test observes exactly two chunk pulls and one cancellation, zero subsequent actual transport calls, exactly one POST, unknown original ACK retained, after=null and tripCollectionUnchanged=unknown.

Regression: `budget-regression.log`, 46/46 PASS, zero skips (26 inventory contract/security cases and 20 unchanged original Ask cases). Targeted route-inclusive strict TSC, source lint and diff whitespace PASS. PG and unchanged canonical reader/HTTP were not rerun for this transport-only defect; their original 8/8 evidence remains separately scoped, and Main handles exact-head integrated CI/review.

Only controlled in-memory transport was used. No real H04, credential refresh, model/provider, target database or TestFlight action. Whole #264 remains open. After this evidence commit the owner is stopped again, with no in-flight/planned/future writes; same-scope defects return through Main.
