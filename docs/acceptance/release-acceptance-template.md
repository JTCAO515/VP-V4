# Release Acceptance — `<release/id/date>`

## Scope and traceability

- Objective / Issue / ADR:
- Changed modules/contracts:
- Do-not-touch confirmed:
- Build SHA / migration head / config and flag version:
- Provider requested and returned model / region:

## Eight dimensions

- Functional: command, scenario, output, artifact.
- Interface: contract/conformance result.
- Data: migration, compatibility, restore, postconditions.
- Security: authz/RLS/secret/injection/upload result.
- Performance: environment, sample, p50/p95/p99.
- UX: desktop/mobile/locales/RTL/accessibility evidence.
- Observable: trace/metric/log/alert lookup.
- Compliance: policy/licence/retention/attribution review.

## Red lines

- Named suite and fixture count:
- Runtime invariant:
- Observed violations / total fixtures:

## Evidence ledger

- Command / exit code / environment / timestamp / artifact path:

## Actor and fault matrices

- RLS actor x operation:
- Disconnect/cancel/idempotency/concurrency:
- Queue crash/duplicate/poison/version:

## Unrun checks and blockers

- Command / reason / owner / unblock condition:

## Rollback

- Flag/revert/migration/data purge:

## Observation window

- SLI/SLO, owner, cadence, start/end, error budget:

## Verdict

- `accepted`, `degraded`, or `blocked` with evidence and residual risk.
