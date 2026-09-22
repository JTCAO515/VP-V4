# Triage labels

A label is navigation, never an approval, a readiness proof or a capability result. Judge
readiness from interfaces, environment, ownership and external conditions, then reconcile the
label using ordinary tracker authority.

| Role | Label | Meaning |
| --- | --- | --- |
| Triage | `needs-triage` | Scope/readiness needs evaluation |
| Missing information | `needs-info` | A specific unanswered question remains |
| Agent ready | `ready-for-agent` | The selected scope is independently actionable |
| Human ready | `ready-for-human` | A named operator decision/action remains |
| Not planned | `wontfix` | Explicitly not planned |

Task state uses one current `status:*` label per Issue: `status:planned`, `status:ready`,
`status:blocked`, `status:in-progress` or `status:superseded`. `priority:P0`/`P1`/`P2` is current
outcome priority — a blocking defect can be P0 in any phase. `phase:R0`–`phase:R5` remains only as
the historical technical grouping; user-facing scheduling uses `deliveryStage` in `issue-plan.json`
and the VPJ S1–S6 milestones.

2026-09-17 JT 要求尽量不用 `status:blocked`：开放任务默认 `status:planned`（已定义、待排期），
从执行行的首个切片和实际可用输入开始。仅当整张票确实没有可独立推进的工作，且已记录具体阻碍、
解除动作与责任人时才使用 blocked；“上游 Issue 仍 open”本身不成立。业务结果 `blocked` 不受标签策略影响。
`status:planned` 不等于 ready 或验收通过；`status:in-progress` 需要有实际进行中的切片；
`status:ready` / `ready-for-agent` 仍需输入、环境与范围证据。

An operator step blocks its own path: record it in `docs/operator-actions.json`, set
`ready-for-human`/`needs-info`, and continue independent work. A bounded preparation slice may have
its own ready Issue/PR while its parent waits for runtime acceptance. Future expand tasks retain
their activation gate. Closed work keeps no `status:*` or `ready-for-*` label.

GitHub 的红色 `Blocked` 图标来自原生依赖，与 `status:blocked` 标签不同：原生关系表示开工硬依赖，
`acceptanceDependencies` 用普通引用保留最终集成输入。按 manifest 和实际输入判断进度，不按图标数量判断。

Scope and evidence: [`development-workflow.md`](development-workflow.md). Scheduling and authority:
[`continuous-afk-execution.md`](continuous-afk-execution.md).
