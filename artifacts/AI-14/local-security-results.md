# AI-14 local security results — 2026-08-25

- Authenticated owner created one trip; another authenticated user read `0` rows and updated `0` rows.
- An anon Data API read returned HTTP `401`.
- `private.ai14_fault_probe(..., true)` raised `AI14_FAULT_PROBE`; the inserted probe trip count after failure was `0`.
- An author could not self-approve a review probe; a separate JWT with `app_metadata.role=reviewer_probe` approved exactly one row.
- Temporary Auth users were deleted at the end of the probe.
