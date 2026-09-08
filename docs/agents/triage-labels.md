# Triage labels

| Role | Label | Meaning |
| --- | --- | --- |
| Triage | `needs-triage` | Scope/readiness needs evaluation |
| Missing information | `needs-info` | A specific unanswered question remains |
| Agent ready | `ready-for-agent` | The selected scope is independently actionable |
| Human ready | `ready-for-human` | A named operator decision/action remains |
| Not planned | `wontfix` | Explicitly not planned |

Use `status:ready`, `status:blocked`, `status:in-progress` or `status:superseded` for task state;
`phase:R0`–`phase:R5` for scheduling; and `priority:P0`/`P1`/`P2` for current outcome priority.
Priority is not permanently tied to a historical release: a blocking defect can be P0 in any phase.

VPJ's native graph and current scope govern readiness. The old AI-01/15/21/29/34/41 release-gate
table is archived in `docs/archive/2026-09-05/baseline/triage-labels.md`; it adds no edges to VPJ.
Use current task phase and dependencies, not an old milestone title, to schedule work.

After a baseline/upstream merge, inspect interfaces, environment and ownership, then reconcile
stale labels using normal tracker authority. A label is not an independent source of approval.
Closed work must not retain `status:ready`, `status:in-progress` or `ready-for-*` labels.

An operator step blocks its own path. Record it in `docs/operator-actions.json` and continue
independent work. A bounded preparation slice may have its own ready Issue/PR while its parent
waits for actual runtime acceptance. Future expand tasks retain their activation gate.

See `development-workflow.md` for scope and evidence, and `continuous-afk-execution.md` for
scheduling. Do not turn a stale label or absent label into an invented capability result.
