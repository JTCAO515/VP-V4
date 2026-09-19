# #360 target-environment readiness observation — 2026-09-19

## Scope and observed facts

This companion observation shares the real Staging checks recorded for #359.
No database, credential, deployment, Ask request, Trip, or publication was
changed.

- The intended Staging Supabase project is `VP - V4`
  (`dzqdzetcctkhbrhlxxgn`). The CLI connection terminates before either
  migration inspection or a dry-run can read its database state.
- The deployed Preview environment lacks the exact Ops and grounded-Ask
  activation/configuration variables required by the Web and native handlers.
- `/ops` review is deliberately Preview-only for the pinned Staging project.
  It cannot be configured as a production Ops surface without changing its
  explicit authority boundary.
- The Web shell explicitly disables `groundedRead` when `VERCEL_ENV` is
  `production`; a production Web readback would not exercise the requested
  #360 path.

## Result

No real iOS or Web Ask request, EvidencePack readback, Trip-preservation
comparison, rollback exercise, or billing reconciliation has occurred.
All #360 target-environment acceptance rows remain UNRUN.
