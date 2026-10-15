# Retained diagnostic history

Earlier failures remain in this chat's tool outputs. This records their actual causes; later PASS does not erase those observations.

- Provider mapping fixture omitted required raw_name; fixed the synthetic fixture.
- NativePG inherited Asia/Shanghai while source helpers use UTC; canonical to_jsonb timestamps hashed differently and current sources became empty. The owned fixture now starts in UTC; no hash/currentness guard was relaxed.
- read_grounded_work initial patch matched `p.id` while the actual definition uses `id`; corrected the authored branch.
- Counting fixture assumed model_budget_attempts.owner_id; corrected its original Task join. A withdrawal fixture attempted unsupported mapping status revoked; replaced with the original publication revocation RPC.
- Lifecycle claim fixture omitted role in JWT JSON; corrected the synthetic claims. Original ACTIVE_WORK correctly blocked erase until original completion. Original erase returns kind receipt/state erased; corrected the assertion.
- Initial full append retained a prior core-page version fingerprint; rebuilt only the known authored fixed pin.
- Old NULL projection was initially removed from primary hashes but not reverse scans, causing an extra CROSS_TURN_REFERENCE. Normalized each original scan before fingerprinting; actual before/after legacy JSON now compares exactly.
- First real D2 page exposed ambiguous alias g colliding with generation; renamed the local query aliases and repeated that affected actual boundary.
- Main found missing proof could become false not_submitted after erase. Recovery now checks retained original operations/Turn/fences and returns unknown without reconstructing private proof.

These are local synthetic PG findings, not target/provider incidents. No permission, clock deadline, capacity, source-currentness or assertion was weakened to obtain PASS.

Accepted707 composition and review repairs:

- The original Trip runtime's296-member fixed metadata map correctly refused the modified Root definitions. Only known authored source/definition hashes were replaced; the rest and all metadata remained unchanged.
- Actual mixed D2 initially hit the original Trip-private grounded export restriction. The new proof/basis exception was added only for nonNULL selected rows; original NULL and pureTrip behavior remain.
- A first Trip fixture had no lineage because it had no selected Proposal. The accepted original producer was run with its actual Proposal path to create all five nonzero sources; no assertion or source row was fabricated.
- Main's fixed review found capacity finalization and the generic claimer omitted by the first checkpoint. Enabled reservation/terminal/rollback/grant tests and actual generic-claim races now cover the repaired boundaries.
- The first complete portable run was16 PASS/1 FAIL with a real cancellation/completion deadlock. The original cancel acquired34 before text_owner/mobile, opposite the selected completion. Only the selected same-actor cancel branch now acquires account/mobile before34. The exact first failure log is retained; the subsequent deterministic blocked-mobile lock observation and full18-case run pass.
- Missing new CHECK could make the new SQL schema predicate NULL. It now returns false explicitly and all final guards use IS NOT TRUE; the constraint-drop negative is exercised without accepting unknown metadata.
