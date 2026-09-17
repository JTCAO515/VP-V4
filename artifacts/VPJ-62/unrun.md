# Unrun and explicitly excluded outcomes

- No hosted/production migration or activation, public production smoke, real participant
  collection, email delivery or mailbox verification. The new intake is disabled by
  default; the PR delivers a tested deployable research flow, not a production launch.
- No production backup restore/expiry drill. Withdrawal is proven on the active database;
  recovery must replay withdrawal fences before enabling contact (operations runbook).
- No actual researcher enrollment or participant first value. Synthetic records test
  the event transitions; they do not establish business funnel performance.
- Global integration suite: 77 environment-gated skips; the one new intake suite was
  subsequently run with its real DB environment and passed. The other 76 are existing,
  unrelated identity/native/provider/runtime scenarios. Security retains 1 existing skip.
- `db:verify` has no linked remote database configuration. Its exit code is not a remote
  PASS; the isolated PostgreSQL/PostgREST migration/rollback/restart tests did run.
- No native iOS code changed; native build/device checks are not applicable to this
  standalone pre-App Web research intake.

These limits do not remove any #202 code acceptance. A release/real-customer claim requires
its own environment observations. Merge the tested PR before closing the implementation
issue; preserve the separate ongoing VPJ-02/45/75/76 work.
