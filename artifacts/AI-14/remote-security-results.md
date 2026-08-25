# AI-14 remote security results — 2026-08-25

Target project: `dzqdzetcctkhbrhlxxgn`.

- Owner created a trip with HTTP `201`; other-user read and update each returned `0`; anon read returned `401`.
- Authenticated access to `fact_records` returned `403`, because no public or authenticated grant exists.
- Author self-approval returned `0`; an independent `reviewer_probe` JWT approved exactly `1` change row.
- `private.ai14_fault_probe(..., true)` returned nonzero exit code `1`; resulting fault-probe trip count was `0`.
- Temporary Auth users and test rows were deleted after every remote probe.

No key, token, database password, email address, or user ID is retained.
