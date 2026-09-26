# VPJ-80 planning-chain evidence

Branch `codex/vpj80-planning-chain-20260927`, initially from main `972cfdb01b35217a09ce7644acd39d524ce2305d`. Rebase to current main and final SHA checks are pending. Related to #561; parent remains OPEN.

## Implemented

- Versioned planning consent and owner-scoped native admission feed an existing ServiceTask/Turn/work lease, with planning-only claim routing.
- #571 durable action claims and atomic validated checkpoints feed a fixed tool sequence. A fresh worker instance can resume completed steps; an unknown effect cannot re-execute.
- A bounded Qwen selection goes through fresh SQL authorization and #194 budget. Deterministic content is checked against the place observation before #560 comparison/1 publication and owner native readback.

## Local observations

- PASS: disposable PostgreSQL planning test: migration rollback/reapply; direct owner admission/lease/checkpoint/budget/publication/readback; worker function provider fixture; expired lease recovery; concurrent claim; goal and Memory revision changes; cancellation, planning consent withdrawal and unknown provider cost stop; late stale-basis publication rollback.
- PASS: disposable PostgreSQL `postgres` lane before final rebase, 16 files / 131 tests / 0 skip or fail. Final-code rerun pending.
- PASS: local real Auth + native HTTP + migrated PostgreSQL + worker function + owner result HTTP with synthetic model/place fixtures. The title and test state identify synthetic content. Final-code rerun pending.
- PASS: TypeScript typecheck, source-policy lint and feature-flag check on the development branch before final rebase. Final checks pending.

## UNRUN / limits

- No actual Qwen or AMap credentials are present in this checkout. Real provider calls, supplier cost reconciliation and live route availability are UNRUN.
- No hosted planning scheduler or named Staging policy/worker activation has been installed. App closure, actual worker process restart and same-version native device read are UNRUN. Local tests simulate a new worker instance and lease, not a deployed process restart.
- No Production migration, payment, booking, Trip write or release was performed.
- `paused_unknown` is fail closed. Operator/provider reconciliation and user-visible pause/resume flow remain future work; the synthetic chain does not close #561.
