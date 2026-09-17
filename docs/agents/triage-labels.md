# Triage labels

| Role | Label | Meaning |
| --- | --- | --- |
| Triage | `needs-triage` | Scope/readiness needs evaluation |
| Missing information | `needs-info` | A specific unanswered question remains |
| Agent ready | `ready-for-agent` | The selected scope is independently actionable |
| Human ready | `ready-for-human` | A named operator decision/action remains |
| Not planned | `wontfix` | Explicitly not planned |

Use `status:planned`, `status:ready`, `status:blocked`, `status:in-progress` or `status:superseded` for task state;
`phase:R0`–`phase:R5` for the retained technical grouping; and `priority:P0`/`P1`/`P2` for current outcome priority.
Priority is not permanently tied to a historical release: a blocking defect can be P0 in any phase.

2026-09-17 JT要求尽量不用`status:blocked`：开放任务默认使用`status:planned`（已定义、待排期），
从执行行的首个切片和实际可用输入开始。仅当整张票确实没有可独立推进的工作，且已记录具体阻碍、
解除动作与责任人时才使用blocked；“上游Issue仍open”本身不成立。业务结果`blocked`不受标签策略影响。
`status:planned`不等于ready或验收通过；`status:in-progress`需要有实际进行中的切片，
`status:ready`/`ready-for-agent`仍需输入、环境与范围证据。一个Issue只保留一个当前`status:*`标签。

VPJ's native graph and current scope govern readiness. The old AI-01/15/21/29/34/41 release-gate
table is archived in `docs/archive/2026-09-05/baseline/triage-labels.md`; it adds no edges to VPJ.
Use current delivery-stage membership and actual dependencies to schedule work.

2026-09-11起，用户验收按 `issue-plan.json` 的 `deliveryStage` 与 GitHub 的 VPJ S1–S6
里程碑查看；旧 `phase:R0`–`phase:R5` 标签保留作历史技术分组，不再代表新的阶段顺序。
后续 expand 单列，不进入当前活跃清单。依赖及实际可执行性仍须单独核实，里程碑本身不授予就绪或完成状态。

After a baseline/upstream merge, inspect interfaces, environment and ownership, then reconcile
stale labels using normal tracker authority. A label is not an independent source of approval.
Closed work must not retain `status:planned`, `status:blocked`, `status:ready`, `status:in-progress` or `ready-for-*` labels.

An operator step blocks its own path. Record it in `docs/operator-actions.json` and continue
independent work. A bounded preparation slice may have its own ready Issue/PR while its parent
waits for actual runtime acceptance. Future expand tasks retain their activation gate.

See `development-workflow.md` for scope and evidence, and `continuous-afk-execution.md` for
scheduling. Do not turn a stale label or absent label into an invented capability result.
