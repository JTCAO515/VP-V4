# VPJ 产品与开发入口

开发阶段以 [2026-09-12接入规则](../../agents/development-integration-policy.md)为准：不等待第三方、法务或产品许可。任务定义中的依赖用于真实接口与验收，不恢复历史审批阻塞。

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) 是唯一活动 Program：中英原生 iOS 完整旅程、同 Trip 轻量 Web Studio、一个 VP 与受控技能。完整范围、商业试验和客户交付由[主报告](../../VISEPANDA-MASTER-PLAN-2026-09-05.md)与 ADR-0023 定义。

本目录始于 2026-09-05，持续接纳已批准增量；目录日期不是当前状态日期。2026-09-10 本地规划为 **73 项子任务、212 条直接依赖**；该数值描述任务图，不描述完成率。最初 PR #253 的 65 项/198 条依赖、旧 20 项迁移结果保留在[历史验证](VERIFICATION.md)。

## 从哪里开始

日常只看[六个交付阶段](DELIVERY-STAGES.md)、当前阶段的里程碑和正在执行的 Issue。
先完成一个可在指定环境亲手验证的用户结果，再扩大工作面；完整任务定义保留供按需查阅。
阶段是现有任务的验收分组，不能代替单票完整验收。当前只开一条集成主线和一条独立准备线，
已在执行的工作先安全交付或交接。后续扩展仍由各票的 activationEvidence 决定。

首次进入或产品范围变化时读主报告；执行单项任务从根 [AGENTS.md](../../../AGENTS.md)、[CONTEXT.md](../../../CONTEXT.md)、[开发流程](../../agents/development-workflow.md)、当前 Issue/PR 及其[执行行](EXECUTION-CONTRACT.md)开始，再读受影响的接口、代码和测试。历史审计与无关模块按需读取。复制任务提示可用 [AGENT-KICKOFF.md](AGENT-KICKOFF.md)。

| 要确认的内容 | 权威来源与用途 |
| --- | --- |
| 产品、商业与安全决定 | [主报告](../../VISEPANDA-MASTER-PLAN-2026-09-05.md)、[ADR-0023](../../adr/ADR-0023-vpj-integrated-native-journey-baseline.md)；品牌变更按 [ADR-0025](../../adr/ADR-0025-brand-service-task-and-response-semantics.md)及其三份契约 |
| 开发、准备范围与验证方法 | [开发流程](../../agents/development-workflow.md) / ADR-0024；替代冲突的旧操作流程，不替代产品验收与安全合同 |
| 任务身份、计划依赖与验收要求 | [issue-plan.json](issue-plan.json) 是规划源；生成[任务队列](ISSUES.md)、[执行行](EXECUTION-CONTRACT.md)和 `issue-bodies/`。本地清单未勾选、`planned` 状态不表示远端没有进展 |
| 接口与模块责任 | [INTERFACES.md](INTERFACES.md) 和受影响的 `docs/contracts/`；规划类型由真实生产者/消费者接入前版本化 |
| 当前进度、依赖与就绪 | 当前 GitHub Issue 正文/评论、原生依赖、相关 PR/CI，以及实际代码与环境；标签和历史快照仅供导航 |
| 交接与完成证据 | [docs/handoff.json](../../handoff.json) 生成根 CONTEXT/HANDOFF；关键结论回到 Issue/PR 和 `artifacts/<VPJ-ID>/`，核对版本、环境与未验项 |

历史研究是决策输入；归档、候选拆分和旧 AI/V4/LAUNCH 队列不产生第二套任务或当前操作授权。

## 当前增量与对应入口

2026-09-13 知识升级增加 VPJ-74…76 并补充 #207/#211/#248；当前为 76 项、217 条直接依赖。见[具体执行方案](../../knowledge-upgrade/README.md)。规划合并前保留原运行接口；当前 SIM 主线先安全交付，新票按真实 frontier 接续。

| 工作 | 使用的契约与完成边界 |
| --- | --- |
| 品牌方向接入 | [增量开发计划](BRAND-ALIGNMENT-EXECUTION.md)串联[基础跨 Trip 偏好](../../contracts/basic-preferences-cross-trip.md)、[ServiceTask 计量](../../contracts/service-task-metering.md)、[响应规范](../../contracts/vp-response-policy.md)。Free/Pass 共享明确保存的基础偏好；必要澄清和系统修复不新增用户消费。新计量先只记录归属，未决容量、partial/改稿/TTL/跨期及 Q38 不因规划而启用 |
| Harness 真实集成 | [Harness 计划](../../harness/README.md)。VPJ-66 #263 的[离线准备](../../../artifacts/VPJ-66/verification.md)已有完成记录；VPJ-67…71 的 provider、真实 Trip/worker、故障恢复及最终回归分别验收 |
| 两项独立准备 | [HF 复用计划](../../harness/hf-reuse/README.md)：[VPJ-72 #287](https://github.com/JTCAO515/VP-V4/issues/287) 准备中英判分/盲评包，[VPJ-73 #288](https://github.com/JTCAO515/VP-V4/issues/288) 评估 Docling 合成材料解析。核实输入、契约与本地条件后可并行；后者与材料运行票是研究关系，没有新增阻塞边 |
| 运营与客户交付 | [OPERATIONS-AND-RELEASE.md](OPERATIONS-AND-RELEASE.md)。技术发布 VPJ-45 与商业生命周期 VPJ-47 是各自的完成条件；模型、数据、Store、真人及客户结果不能由 Web 发布或准备 PR 代替 |

以上为工作路由，不是新的整批等待顺序。按实时依赖、接口、环境及文件协作状态选取可推进任务；`expand` 仍需其 activationEvidence。可独立验证的准备片段按开发流程记录范围，父 Issue 保留未完成的运行验收；Issue 全部验收完成后才关闭。

## 验证与更新

```bash
# 本地规划、文档与归档检查；不访问或修改远端
pnpm docs:check
git diff --check
# GitHub 只读核对；结果仍需结合相关接口与环境判断就绪
node scripts/vpj-program.mjs verify-remote
```

更新规划先改 `issue-plan.json`，再用 `node scripts/vpj-program.mjs render` 生成派生文件并审查 diff；保留远端已有评论、勾选与实施证据。仅共享阶段、决定、阻塞或下一动作变化时更新 `docs/handoff.json`，运行 `node scripts/vpj-program.mjs render-handoff`；启动任务无需重生成。`package.json` 是可运行检查命令源。

`publish / close-old / sync-*` 修改 GitHub，只在对应 tracker 授权范围使用；文档生成不等于远端同步。既有授权按对象、环境和范围持续有效，规划及命令示例本身不新增生产、账户、付款或数据权限。

## 历史与恢复

[旧 Issue 映射](ISSUE-MIGRATION.md)、[归档/恢复](ARCHIVE.md)及[规划验证](VERIFICATION.md)记录当时的操作与证据。旧项按 `not planned` 关闭表示已被替代；历史 UNRUN 也不否定后来独立取得的实际验证。

回滚只撤销对应规划增量，必要时按保存的快照恢复 tracker 关系和源码，保留后续实施进展；不覆盖用户工作树、改写已应用迁移或恢复被撤回的数据权限。
