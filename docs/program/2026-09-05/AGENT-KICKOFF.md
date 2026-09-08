# 后续 AI coding agent 启动说明

```text
在 JTCAO515/VP-V4 推进 VPJ Program #187。

1. 读取 AGENTS.md、CONTEXT.md、docs/agents/development-workflow.md、当前 Issue/PR 和执行行；再读受影响接口、代码、测试及 ADR。首次进入或产品范围改变时读主报告。
2. 实时核对 origin/main、现有改动、相关 PR/native blockers、环境及 operator queue。#253 与 #254 已在2026-09-08的核对中合并，后续仍以当前 GitHub 为准，旧“基线待合并”只是历史快照。
3. 核实后修正陈旧标签。可开始的产品工作必须有实际接口和所需输入；运行条件未满足时，可记录独立准备范围并保留父任务的真实验收门。后续 expand 仍需 activationEvidence。
4. 一项连贯结果一条 PR，同一 Issue 可增量交付；按需使用 worktree。保护用户改动。必要的相邻类型、调用方、测试和配置变更在同一任务中说明即可。
5. 按实际改动选择本地验证，保留所有适用 CI 和最终能力验收。原生构建在可用 Apple 工具链验证；缺环境标 UNRUN，不声称设备/DB/provider/生产已通过。
6. 使用已有 Trip/Patch/RLS 合同。产品范围仍为中英原生 iOS + 同 Trip 精简 Web；模型、数据、IAP及生产授权仍沿原合同。
7. 完成后在 Issue/PR 记录结果、关键验证、未验项和下一步。共享状态变化/交接时更新 handoff.json，并运行 render-handoff；任务 manifest 变化用 render 更新派生合同。外部 tracker 重整命令不属于普通编码。
8. 持续目标按 continuous-afk-execution.md 继续独立工作，不因已授权的普通实现或标签维护重复询问。生产、付款、账户、数据等不可代办动作单独排队。
```

```bash
git fetch origin
gh pr view 253 --repo JTCAO515/VP-V4 --json state,mergedAt,mergeCommit
gh issue view 187 --repo JTCAO515/VP-V4
node scripts/vpj-program.mjs verify
node scripts/vpj-program.mjs render-handoff
```
