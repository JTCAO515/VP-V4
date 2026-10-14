# VPV10-MODULAR-001 当前方向入口

当前执行入口：[三工程成果与批次](current-overview.md) · [唯一 current-plan.json](current-plan.json)。下方首轮52映射/静态 after 是保留的迁移历史，不是当前标题与执行正文。当前源发布记录见 current-publish-readback.json；规划承接关闭不代表功能交付。

[整体 spec 与版本接口](../../contracts/vpv4-project-boundaries.md) · [52 张开放票映射](issue-map.md) · [机器可核映射](mapping.json) · [原正文快照](before.json)

本目录保存 current-plan.json 的任务定义、生成的当前正文和迁移证据；不是第二套 HANDOFF 或持续状态系统。执行 owner、lease、ready 前沿只由唯一 Main 的 HANDOFF 维护。

## 接受方向与文档覆盖

2026-10-14 派工传入的正式来源（本专项未另行查询 BestJ 原系统）：

- `Sentinel_7beb5b9ff8bc819185d78bcef9041375`：保留 JTCAO515/VP-V4 名字、历史、资源，同仓 iOS/Web/Agent 独立工程。
- `Sentinel_5be603e2e7348191aefbdf3711af2cbd`：独立 Astra 专项整理整体方向、Issue 正文与说明。
- `Sentinel_f84c4e08dbb48191a7de5de3f82ace95`：先方向、再具体工作，开放 Issue 全部重排。
- `Sentinel_3215aaf8239c8191aa9313c4f99a7c21`：不覆盖重做之前成果，复用、优化与升级，有用信息保留。

| 当前说明 | 处置 |
| --- | --- |
| 根 README | 更新三工程方向和第一体验入口，保留本地开发与历史证据 |
| 新 boundaries 合同 | 方向、工程责任、版本端口、兼容迁移和资源边界唯一新定义 |
| agents/development-workflow、issue-tracker、domain | 明确当前方向优先；原权限/验收/原生依赖语义保留 |
| program README、INTERFACES | 加入当前入口和定向替代说明，历史段落保留 |
| issue-plan.json | 现有开放 task 增加 modularDirection；不改已关闭 task、原验收或依赖 |
| EXECUTION-CONTRACT、DELIVERY-STAGES | 最小加入当前方向指针；现有生成器保留当前方向指针和原执行行 |
| assistant-upgrade README | 指向新的方向，四 Tab/Conversation/Memory 成果保留 |

## 历史首轮静态快照约定（已被 current plan 替代）

根 AGENTS、README 与总索引已更新当前方向；CONTEXT/HANDOFF 保留 2026-10-02 生成历史。外部唯一 Main 的 HANDOFF 继续拥有当前执行状态。本目录的 `handoff-source-candidate.json` 只是可选导航补丁，不重写状态，也不是第二套 HANDOFF。

Main 已追加 `scripts/vpj-program.mjs`、`docs/manifest.json` 与必要治理回归的精确 lease。生成器对本次已审核正文采用有 hash 的保留快照；同票未来任务定义或工程归属变化必须显式更新 mapping 与正文快照，不能静默输出旧合同。远端新勾选和追加证据由原 preflight 保留；未知正文漂移仍拒绝写入。非本次迁移任务保留原生成方式。

本轮边界规范已明确接受方向和定向 supersede，足以作为单一决策补充，不自动新建 ADR。未来出现真正独立的新决策时再由 Main 判断。其它 owner 的 QA/worker 文档仍保持原合同；本轮只通过新规范明确工程归属，不抢写其运行或权限说明。

## 复用资产与证据等级

| 资产 | 当前源证据 | 可以复用 | 本轮未证明 |
| --- | --- | --- | --- |
| 四 Tab iOS 壳 / VPJ77 | `ios/VisePanda/VisePanda/Navigation/AppTab.swift` 的 assistantTabs/defaultSelection | VP/Journeys/Library/Memory 导航和现有原生消费者 | 实机、VoiceOver、完整回访验收 |
| QA Web | `app/qa/page.tsx`、`app/api/qa-agent/**`、`components/qa-agent` | 持久会话与请求入口 | 本轮浏览器/真实首答/多轮运行 |
| TripCanvas | `components/canvas/TripCanvas.tsx` | 同 Trip 规划和确认工作区 | 与新工程端口完整兼容矩阵 |
| Conversation / ServiceTask | `lib/server/turn`、现有 conversation 及计量合同 | 持久对象、目标、事件、重放和成果 | 所有 Native/QA wire 已统一（不能假定） |
| Hosted queue / Model / Budget | `lib/server/model-gateway`、既有 hosted worker 与 durable budget | 一条执行与预算权威，源与 synthetic 可复用 | 目标 worker/provider 启用、真实费用/延迟 |
| Memory | `lib/server/memory`、现有 Profile/Memory 投影和原生页面 | 同意、来源、scope、纠正/遗忘权威 | 实际模型消费及撤回整链 |

源文件存在是实现盘点，不等于可演示。历史已合/fixture 证据按原 commit 和范围引用，目标运行/可演示须另记录实际版本与行为。本轮没有运行产品演示。

## Vercel 只读盘点与适配计划

2026-10-14 官方 MCP 对精确 project/team 返回 404；同账户官方 CLI（`whoami: jtcao515`）对同 endpoint/team 读取成功，没有换身份或默认 team。

- Project：`vp-v4` / `prj_XwsjEc8YnYNeDVAqBrcdmbJXEqA2`，team `team_vLT8SL2mQJJSnXbD9GzVLP4K`。
- Git：`JTCAO515/VP-V4`，生产分支 `main`；Next.js；rootDirectory/buildCommand/installCommand/outputDirectory 均 null（使用项目默认，不能解释为无构建）。仓库 `package.json` 的 build 为 `pnpm generate:design-tokens && next build --webpack`。
- `qatesting.go2china.space` → `codex/qaw005-main-20261013`；`staging.go2china.space` → `codex/s2-native-ask-io-20260911`。
- `testing.go2china.space`、`go2china.space`、`www.go2china.space`、`vp-v4.vercel.app` 的 gitBranch 均 null；六域 verified=true。没有读取 env 值；域名验证不等于目标用户行为通过。

适配顺序：保持现有 root/构建/项目 → 由原部署 owner 在后续授权阶段确认 Web 与 Agent HTTP 适配入口 → 只在有实际构建拆分需求时提出具体 root/build 差分 → exact SHA/CI 与兼容证据后由原 owner 执行获准 QA 交付。Agent worker 沿既有独立执行环境，iOS 沿 Xcode/签名渠道。不要把 Vercel 当 iOS 构建渠道，也不立即建立新 Vercel 项目。此次未部署、未改 env/domain/DNS/套餐/权限。

## 运行事实与验证边界

工作树 `vpv4-modular-entries-20261014`，分支 `codex/vpv4-modular-entries-20261014`，base `c5a8f3c1f58e14b18f0ba5382b19ca7fe7e78e95`。初始 clean。GitHub 既有 JTCAO515 keyring 凭据可只读访问。shell/文件/网络工具可用，approval policy 为 never（不是额外业务授权）。请求模型 Astra/medium 来自派工，工具未暴露 effective，tier 无 setter；均不伪报核验或 Fast。

本次只运行文档/manifest/governance 与 diff 检查；产品、155 数据库矩阵、provider、设备、发布均不在本轮执行。Issue before/after 和逐项读回用于证明正文更新与保留，不证明产品完成。
