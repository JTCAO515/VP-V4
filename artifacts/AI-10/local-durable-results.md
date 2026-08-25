# AI-10 local durable results — 2026-08-25

- Pending proposal confirmed once: `applied`, resulting version `1`.
- Same idempotency key/digest returned `already_applied`; changed digest returned HTTP `400`.
- Trip title/version became `After`/`1`; exactly one event and one audit row existed.
- Stale proposal returned `version_conflict` and persisted status `conflicted`.
- Temporary Auth users and all test rows were deleted.
