# VPJ-07 remaining acceptance

- No deployed worker, real durable prompt/output path, final answer/native read, provider/budget/policy end-to-end integration or Ask consumption acceptance. #195 and Harness parents remain open.
- No new remote database migration. Isolated PostgreSQL uses minimal Auth/session fixtures, not GoTrue/JWT; sequential revocation/replacement checks are not full Auth concurrency acceptance.
- Explicit Supabase integration/security suites remain skipped where no test target is configured; `db:verify` is configuration reporting, not a live database pass.
- No production data/recipient permissions, team CRUD, retention/delete semantics or paid provider calls are enabled by this preparation.

- Full signed native suite:21 passed/8 explicit environment-dependent skips/0 failures; no new live native identity/Trip/Ask or minimum-iOS/physical-device acceptance is claimed.

The usage-basis guard has real local SQL/controlled HTTP coverage but no new real-provider,
invoice, qualified-recipient, remote-worker or native acceptance. Default environment-dependent
security/integration skips remain explicit; see usage-basis/commands.jsonl. Existing settlements
are not rewritten and conservative pending amounts require their own authoritative evidence.
