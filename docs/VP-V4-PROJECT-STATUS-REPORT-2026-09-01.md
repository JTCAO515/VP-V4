# VP-V4 项目全景状态报告

日期：2026-09-01
权威代码基线：`JTCAO515/VP-V4@fb8d2ba`
当前执行 Program：[LAUNCH-00 #149](https://github.com/JTCAO515/VP-V4/issues/149)
报告性质：代码、Tracker、测试、Vercel、Supabase 与本地工作区的重新核验，不是发布批准

## 1. 执行摘要

VP-V4 已经从单一落地页原型推进为一个具备大量生产边界、数据库合同、用户身份边界、
Trip/Proposal 主链和多层测试的 closed-beta 候选系统。当前最准确的成熟度描述是：

> 仓库实现和确定性合同已显著领先，但真实 Staging、真实 Provider、完整 RLS/E2E、独立
> Production、发布回滚与真实用户观察仍未闭环。

项目目前不应继续把“增加更多能力”作为第一优先级。真实控制点是：

1. 完成 LAUNCH-02 Staging 身份、迁移、RLS、测试账号和 Preview 绑定；
2. 选择一个真实文本 Provider 并建立受控 Staging 调用；
3. 跑通唯一黄金路径；
4. 完成隐私、可观测、Production 隔离、发布和 canary 门禁。

## 2. 产品目标与边界

VisePanda 面向来中国独立旅行的国际游客。核心产品不是“聊天框生成行程”，而是：

```text
旅行意图
  → 有依据的对话与规划
  → 不可变 TripProposal
  → Canvas 可见差异
  → 用户明确确认
  → 原子 TripPatch
  → Today 给出可信下一步或诚实降级
```

Closed Beta 的承诺范围：

- 邀请制密码登录，无公开注册、Magic Link、社交登录或自助找回；
- 创建、选择、读取和持久化 Trip；
- 一个真实文本 Provider；
- 可输入、取消、恢复的 Chat；
- Day + ordered Item 的完整 Trip 内容；
- Proposal diff、confirm、reject、revise 和版本恢复；
- 基于 confirmed Trip 的 Today MVP；
- Profile/Memory 已有安全边界；
- 数据导出/删除、隐私政策、可观测、预算、kill switch；
- Staging、独立 Production、回滚、canary 和 72 小时观察。

本轮明确不承诺：

- Explore 和公共 Knowledge/POI 扩张；
- 实时天气、航班、铁路、地图或外部库存；
- 购买、预订、支付或 Human Help；
- 语音、OCR、图片识别、实时翻译；
- Guide Import、Offline Pack；
- 全国覆盖、SLA、医疗/法律建议或自动修改 Trip。

## 3. 规划体系与权威顺序

项目当前有四层规划，必须按以下顺序解释：

1. **AI Core Program #2**：长期总体架构与领域边界。
2. **V4-01～V4-31**：Demo 到正式产品的能力等价与有界合同路线。
3. **LAUNCH-00～19 / Program #149**：当前唯一 accepted closed-beta 产品化路线。
4. **EXPAND-01～10**：LAUNCH-19 后根据真实用户证据重新排序的扩展路线。

`docs/vp-v4-closed-beta-launch-issue-plan.md` 是当前执行权威。早期 launch readiness audit、
旧编号或历史 handoff 与其冲突时，以 accepted LAUNCH plan、当前 Issue 状态和 execution contract
为准。

## 4. 分期开发与当前成熟度

| 阶段 | 目标 | 当前状态 | 发布判断 |
| --- | --- | --- | --- |
| R0 / G0 | 架构、决策、合同、Issue 和证据体系 | 基本完成 | engineering baseline |
| R1 / G1 | Auth、Trip、Proposal、持久化骨架 | 仓库实现深入；Staging/RLS/E2E 未闭环 | blocked |
| R2 / G2 | 真实 Provider、worker、stream、Chat | worker/SSE/消息合同已准备；无真实 Provider | blocked |
| R3 / G3 | 完整 Proposal、Today、Staging 黄金路径 | Proposal/Canvas/Today 已有代码；黄金路径未通过 | blocked |
| R4 / G4 | 可观测、预算、隐私、删除执行 | fail-closed 合同/内存实现存在；政策和实际执行未完成 | blocked |
| R5 / G5 | Production、资产、域名、回滚 | 尚无独立 Production Supabase 和 release evidence | blocked |
| G6 | Canary、72 小时观察、最终交接 | 未开始 | non-release |

当前所有 R1–R5 release audit 的正确 verdict 仍是 `blocked / non-release`。这不否定已完成的
工程工作，只表示 fixture、合同、Preview 或部署成功不能替代真实产品验收。

## 5. 已进入 main 的主要能力

### 5.1 Web 与身份

- Next.js 16 App Router、React 19、strict TypeScript、Tailwind v4；
- 五语 `zh/en/es/ru/ar`，Arabic document-level RTL；
- VisePanda VI、Golden Route Homepage、Login 和 Product Shell；
- 密码登录、登出、server-side private-page guard、安全 `returnTo`；
- Magic Link initiation/callback 已移除；
- owner 数据通过受保护 API 获取，匿名请求 fail closed。

### 5.2 Trip 与 Canvas

- Owner-scoped Trip 创建、列表、读取；
- versioned Day/Item TripPatch；
- append-only snapshot/event/audit；
- immutable TripProposal 与 child revision；
- Proposal read、create、revise、reject、confirm；
- CAS、幂等、防 cross-owner、显式 same-origin mutation；
- Canvas 完整 diff 和 rollback-as-new-Proposal；
- 模型或客户端不能直接更新 Trip。

### 5.3 Chat、Turn 与 Today

- Durable thread/Turn 状态边界；
- 状态事件、取消、结构化反馈、SSE replay 与 bounded polling fallback；
- fail-closed Message/Assistant Output contract；
- 内存 reliable coordinator、lease、retry、quarantine 和 cancellation contract；
- Today 从 confirmed Trip、显式 clock 和 Day timezone 选择一个 scheduled item；
- Today 不声明天气、营业、交通、延误或安全实时性。

### 5.4 AI、RAG、Tools 与外部数据合同

以下主要是 pure/fixture/bounded contract，不是生产连接：

- ModelGateway registry、route policy、budget、trace；
- ContextPlan、ContextAssembler 和 compaction eval；
- ConstraintEngine 和 feasibility checks；
- Fact eligibility、lexical/hybrid retrieval、GroundedClaim/ExecutionCard；
- Tool Gateway、PolicyReceipt、projection queue；
- External Evidence、Weather、Rail official-recheck 合同；
- Memory、Profile、Privacy request、Guide/Offline/Tools unavailable 边界。

没有真实模型 HTTP transport、reviewed production corpus、生产 vector index、外部数据账号、
生产队列或公开 Knowledge/Explore 能力。

## 6. 数据与安全架构

目标拓扑：

```text
Local / CI
  → fixture + deterministic tests
  → existing no-real-user Supabase Project as Staging
  → Vercel Preview + synthetic users + migrations/RLS/E2E
  → accepted release candidate
  → physically independent Production Supabase
  → Vercel Production + bounded canary
```

核心不变量：

- User/Ops 使用真实 JWT + RLS；worker credential 不能冒充用户；
- service role 不进入浏览器；
- public schema 默认 RLS；
- Confirm/Apply 是一个原子事务；
- Trip history 和 snapshots append-only；
- rollback 使用新 Proposal，不覆写历史；
- Draft Knowledge、无许可内容和过期 Fact 不能进入 retrieval/public projection；
- Secret、Cookie、JWT、连接字符串和私人标识不进入日志、证据或仓库。

当前数据库真实状态：

- Supabase CLI 可用；
- 本地 Docker Supabase 未运行；
- 干净仓库未链接 Staging；
- `db:verify` 为 `not-configured`；
- 当前报告没有执行 migration、RLS 或 Production 连接。

## 7. 测试、CI 与验收证据

2026-09-01 对 `main@fb8d2ba` 的重新运行结果：

| 检查 | 结果 |
| --- | --- |
| `pnpm check` | 通过 |
| Unit | 27/27 |
| Contract | 161/161 |
| Static journey E2E | 40/40 |
| Evals | 20/20 |
| Integration | 19 通过 / 9 skip，结果为 incomplete |
| Security | 80 通过 / 1 skip，结果为 incomplete |
| Docs / flags / Preview assets | 通过 |
| Release assets | 失败：9 个 Preview-only 资产仍被 release ledger 阻止 |
| Database probes | not-configured；未连接 Production |

GitHub 最新状态：

- 124 个 Issue：104 closed、20 open；
- 56 个 merged PR、0 个 open PR；
- 最新 `main` Nightly 在 2026-08-30 和 2026-08-31 均成功；
- PR #183/#184 的 Vercel 与 deterministic PR gates 通过；
- PR workflow 包含真实 Playwright browser lane。

本地重新运行 browser lane 时 Chromium 下载完成后持续无测试输出，已在有界等待后停止；本报告
不把该次下载当作浏览器验收。可引用的最新 browser evidence 来自已通过的 PR gate 和既有 WEB-10
证据。

## 8. Vercel 与线上表面

观察到的最新 Vercel Production deployment 为 `Ready`，公开别名为
`https://vp-v4.vercel.app`。匿名 smoke：

| 路径 | 结果 |
| --- | --- |
| `/` | 200 |
| `/auth/sign-in` | 200 |
| `/visepanda` | 200，公开 shell；owner API 仍受保护 |
| `/visepanda/today` | 307 → password sign-in |
| `/api/trips` | 401 |

Vercel 的 `Production / Ready` 只说明构建和部署完成，不代表 LAUNCH-18 或 LAUNCH-19 已通过。
CI 使用 Node 22、Vercel 当前构建使用 Node 24、本次本地环境使用 Node 26；在正式 release 前应由
LAUNCH-01/18 固定并复验实际运行 Node 基线。

## 9. iOS 与 Marketing

### iOS

本地遗留工作区包含 `ios/VisePanda` SwiftUI scaffold：Today / Trip / Ask / Explore / Profile，
Ask 默认入口、独立 NavigationStack、五语、Arabic RTL、Swift tests 和本地 Asset Catalog。

但它不在 `origin/main`，Issue #135 仍 open / `status:in-progress`。因此当前状态是：

> 本地实现存在，尚未正式进入远端主线；不连接账号、AI、Trip、外部数据、媒体或 Offline。

### Marketing

本地 `Marketing/` 包含独立的 App Store / Google Play concept screenshot 工作。它是 fixture-backed
营销概念资产，不是 native app、真实 booking/inventory 或商店提交证据。应继续与 runtime PR 隔离。

## 10. Git 与工作区治理

2026-09-01 审计发现原工作区仍在旧分支
`codex/ai-02-vp-final-migration-matrix@e2800e0`：

- 比 `origin/main` 落后 272 commits，自身 ahead 1；
- 6 个 tracked 文件有修改；
- 226 个 untracked 文件；
- 其中 24 个 untracked 路径已成为远端 `main` 的 tracked 文件。

处置：

- 原工作区保持只读，没有 reset、stash、checkout、删除或覆盖；
- 治理修复在独立最新-main worktree/branch 执行；
- 已建立干净持久主线工作区 `/Users/jtcao/Documents/VP - V4 Mainline`，其 `main` 与
  `origin/main@fb8d2ba` 对齐；后续 #152 与主线开发使用该目录；
- 已清理所有指向不存在目录的 prunable worktree 注册；
- 远端历史分支没有批量删除；
- iOS、Marketing 和其他本地-only 资产必须以后按独立 Issue/branch 分类迁移。

## 11. 本轮治理修复

- 保留较早的 Trip snapshot authorization 为 ADR-0019；
- 将较晚的 ML-01 thin-HTTP decision 改为 ADR-0022，决策内容不变；
- `pnpm docs:check` 新增 ADR filename/heading/number 一致性和唯一性门禁；
- Issue tracker、triage、execution contract 和 unit test 统一为 dependency-aware live frontier；
- 同步 `CONTEXT.md`、`HANDOFF.md`、`docs/handoff.json`；
- 对 32 个已关闭 Issue 执行 55 次幂等标签移除，active scheduling/triage label 残留为 0；
- 明确 merged repository preparation 不等于 runtime/release acceptance；
- 将 LAUNCH-02 固定为当前唯一外部下一动作。

回滚：普通 revert 恢复仓库文档；GitHub labels 可从 Issue history 恢复。不存在数据库、部署、用户
数据或 secret 回滚。

## 12. 当前风险排序

### P0

1. LAUNCH-02 Staging 身份、迁移、RLS、测试账号与 Preview 证据缺失；
2. 无真实文本 Provider 和 prompt-to-answer 路径；
3. integration/security 仍有数据库 skip；
4. 当前 Product deployment 不能被误称为 accepted closed beta。

### P1

1. retention/legal/claims 尚未批准；
2. 无独立 Production Supabase；
3. release assets、域名、rollback、observability 和 kill switch 未通过；
4. CI/Vercel/local Node 版本未统一；
5. iOS 和 Marketing 仍是本地-only、未完成正式处置。

### P2 / Post-launch

Knowledge/Explore、外部数据、实时翻译、多模态、Guide Import、Offline、Recovery、Aviation 和
全国内容扩张均应在 LAUNCH-19 后基于真实用户证据重新排序。

## 13. 当前唯一下一动作

由 operator 完成 [LAUNCH-02 #152](https://github.com/JTCAO515/VP-V4/issues/152)：

1. 在 Supabase 控制台确认目标 Project 身份、region 和“无真实用户/无生产数据”；
2. 仅在 Vercel Preview/Staging 配置对应公开 URL、publishable key 和服务端安全配置；
3. 不在聊天、Issue、日志或 artifacts 中复制任何 secret、Cookie、JWT 或连接字符串；
4. 从空 schema 重放 migrations；
5. 使用合成 owner/other-user 账号执行 RLS、RPC、fault、reload 和浏览器黄金路径；
6. 只记录 redacted pass/fail、migration revision、环境隔离和未运行项；
7. 完成后重新计算 live Issue frontier。

在 LAUNCH-02 完成前，不创建 Production Project、不接入未批准 Provider、不开放公开注册、不清理
用户历史、不启用 release flags，也不把 Vercel Ready 当作产品发布完成。
