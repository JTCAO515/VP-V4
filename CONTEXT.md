# Context

Generated from [docs/handoff.json](docs/handoff.json). Full decisions, blockers and evidence: [HANDOFF.md](HANDOFF.md).
This entry is a navigation summary, not a grant of authority or a capability acceptance report. Historical records never override the current user request.

Program: [VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · Source updated: 2026-09-18

目标：交付中英原生iOS的一站式陪伴Journey Agent，全程Trip、知识、现场能力、IAP、运营、用户交付和可维护系统；以VPJ-00#187统筹。

阶段：三队并行：A平台/商业/交付，B行程/地图/原生体验，C AI/知识/质量。VPJ-04/08/07/75/76保持既有分配，阶段仍以单票实际验收判断。#359本轮新增真实模型注入抵抗力证据（6/6抵御），票仍open。

## 源记录状态（执行前核对 GitHub）

2026-09-17团队规划：71张开放Issue中，Program #187由Overall统筹，5张既有任务排除；其余65张归属A20/B31/C14。分工和标签不证明ready或完成；核最新Issue/PR、接口和环境。既有Wiki进展及未验项保留在证据栏与固定commit历史链接，不把原单线程下一动作当全项目排期。并行round22（worktree ../vp-v4-work-round22，分支codex/vpj-75-76-round22-20260917）仍按既有指示只聚焦#359/#360：重新实测（非假设）本沙盒是否有可用真实LLM凭据——lib/server/jobs/.local/.env三把key里Qwen真实有余额，GLM key有效但账户真实零余额（真实429），DeepSeek key有效但配置的providerModelId对照真实API确认已过期（真实400，复现wiki-real-model-probe-20260915早先点名的同一bug，本轮不修，shared模块超出#359范围）；用真实Qwen对evals/wiki-statement-proposals-safety/injection-cases.ts全部6个场景跑通runWikiStatementProposalJob真实路径，6/6抵御住注入，详见verification数组与artifacts/VPJ-75/wiki-statement-proposals-injection-real-model-20260917/verification.md。

## 下一动作

用户启动三个新团队后，A从#225开发权益规则开始，B从#363地点与地图同选中未验收切片开始，C从#204受保护Ops候选流程开始。各队按TEAM-PLAN-2026-09-17.md推进，不改派五张已分配票。Overall协调共享文件与Staging写窗口并汇总交接；各队在Issue/PR及既有artifacts报告结果和FAIL/UNRUN。round22线程（#359/#360专用）：本PR CI通过后停下，不合并不关票。真实、可继续的下一步：(1) provider-protocol.ts的MODEL_OUTPUT_INVALID从不记录原始模型响应，本轮再次真实撞到（4/6因scope.cities:[]被拒），需谨慎地只在必要调用点加日志，因该模块被全部model-gateway任务共用；(2) MODEL_PROFILES.deepseek_flash.providerModelId对照真实API确认已过期，同样是shared模块，需谨慎处理；(3) VPJ-76 2026-09-16两条后续（place语料补地点名、同上MODEL_OUTPUT_INVALID日志缺口）仍未做；(4) #359其余缺口（多来源页面真正整合、真实RMB费用对账、Docling、wiki-generation任务自身注入抵抗力）要么明确超出范围（Docling REJECT维持、无billing console访问），要么单纯还没做——凭据已确认可用，不再是阻塞。

## 开工入口

- [docs/agents/development-workflow.md](docs/agents/development-workflow.md)
- [docs/program/2026-09-05/README.md](docs/program/2026-09-05/README.md)
- [docs/program/2026-09-05/TEAM-PLAN-2026-09-17.md](docs/program/2026-09-05/TEAM-PLAN-2026-09-17.md)
- [当前决定与授权边界](HANDOFF.md#当前决定)；行动前核对当前任务和已有授权，不从历史验证推导新权限。
- [未决与运行证据](HANDOFF.md#未决与运行证据)；完整 blockers / UNRUN 在此保留，不因摘要省略而视为通过。
- [验证记录](HANDOFF.md#验证) · [回滚与观察](HANDOFF.md#下一动作与回滚)。
