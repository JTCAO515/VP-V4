# VPJ-07 remaining acceptance

- No deployed worker, real durable prompt/output path, final answer/native read, provider/budget/policy end-to-end integration or Ask consumption acceptance. #195 and Harness parents remain open.
- No new remote database migration. Isolated PostgreSQL uses minimal Auth/session fixtures, not GoTrue/JWT; sequential revocation/replacement checks are not full Auth concurrency acceptance.
- Explicit Supabase integration/security suites remain skipped where no test target is configured; `db:verify` is configuration reporting, not a live database pass.
- No production data/recipient permissions, team CRUD, retention/delete semantics or paid provider calls are enabled by this preparation.
