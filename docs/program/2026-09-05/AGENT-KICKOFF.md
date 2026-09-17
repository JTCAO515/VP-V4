# 后续 AI coding agent 启动说明

填写当前任务与交付范围后复制下段。已有进行中的任务直接接续；本文不指定固定的“下一张票”。完整文档权威与专题入口见 [Program README](README.md)，共享工作方式见[开发流程](../../agents/development-workflow.md)。

```text
在 JTCAO515/VP-V4 推进 VPJ Program #187。
当前任务：<Issue/PR 编号，或明确授权的维护任务>
本次交付：<一个可审阅结果及范围>
当前阶段与验收动作：<S1–S6；用户在指定版本/环境中要亲手完成的行为>

1. 读 AGENTS.md、CONTEXT.md、docs/agents/development-workflow.md 和当前 Issue/PR；产品任务读对应执行行，明确授权的维护任务使用本次 brief。再读受影响接口、代码、测试与 ADR；首次进入或范围改变时读主报告。
2. 核对当前 checkout、用户改动、origin/main、相关 PR、原生依赖和所需环境。历史基线、manifest planned 状态和 blocked 标签不是当前就绪结论；按已有 tracker 授权核实并修正陈旧状态。
3. 明确本次是准备、运行集成还是发布验收。准备须有可用契约/输入并记录范围，保留父票运行门；完整验收不能由 fixture 或已合并代码替代。expand 仍需 activationEvidence。
4. 产品仍是中英原生 iOS + 同 Trip 轻量 Web。保留 TripProposal/diff/确认/原子 Patch、身份/RLS、数据/接收方、许可、删除及迁移合同。涉及偏好、计量、响应或 HF 资源时，按 Program 入口读取对应最新契约。
5. 一项连贯结果一条 PR，同一 Issue 可增量交付；按需隔离 worktree，保护已有改动，协调实际文件冲突。按影响选择本地检查，保留适用 CI 与最终能力验收；缺环境记 UNRUN。
6. Issue/PR 记录结果、实际检查、未验项和下一步；准备 PR 不自动关闭运行父票。共享状态变化时更新 docs/handoff.json 后 render-handoff；规划源变化时 render，保留远端进展。
7. 继续本次范围及已有授权中的独立工作。持续目标遵循 continuous-afk-execution.md；具体外部动作缺少权限/决定时记录对应 operator 项，不把该阻塞扩张到无关准备工作，也不从历史授权推定新对象或新环境获准。
8. 先接通当前阶段的真实用户结果；本轮按TEAM-PLAN-2026-09-17.md的三个团队分工，每队一个主要交付，已分配五票不接管。新准备工作须解除具体阶段阻塞、交付同一结果的可验证部分或修复已观察缺陷，不因等待而无限追加加固。阶段演示与单票完整验收分开记录。
```

开始前的事实核对，在实际 checkout 根目录运行；将编号替换为本次任务：

```bash
git status --short --branch
git fetch origin
git log -1 --oneline origin/main
gh issue view <ISSUE_NUMBER> --repo JTCAO515/VP-V4 --comments
# 仅存在相关 PR 时读取它；不要默认反复查询已结束的基线 PR
gh pr view <PR_NUMBER> --repo JTCAO515/VP-V4
node scripts/vpj-program.mjs verify
```

选任务或依赖变化时可运行 `node scripts/vpj-program.mjs verify-remote`，它只读核对 GitHub，不修改标签或关闭任务。计划生成、交接生成、tracker 写入分别按需执行，均不是启动必做动作。
