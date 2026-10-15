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
