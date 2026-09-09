# VisePanda — 贯穿中国自由行的 AI 旅行助手

VisePanda 面向国际来华自由行旅客，围绕同一个 Trip 连接规划、材料、准备、现场沟通与变化后的行程调整。完整首发产品目标是原生 SwiftUI iOS；Web 是同 Trip 的轻量 Planning Studio。发布范围为中英，既有 es/ru/ar 资产与协议兼容由 VPJ-01 迁移。

[产品与任务入口](docs/program/2026-09-05/README.md) · [完整产品规划](docs/VISEPANDA-MASTER-PLAN-2026-09-05.md) · [当前交接与证据](CONTEXT.md)

## 代码与验证入口

| 范围 | 位置与用途 |
| --- | --- |
| Web / API | [app](app)、[components](components)：Next.js App Router、React、strict TypeScript、Tailwind CSS v4 |
| 原生 iOS | [ios/VisePanda](ios/VisePanda/README.md)：SwiftUI 工程、导航、语言与原生测试；当前页面仍是开发预览 |
| 领域与服务端 | [lib/server](lib/server)：Trip/Proposal/Patch、身份、模型协议、持久预算、知识及媒体模块 |
| 数据库 | [supabase/migrations](supabase/migrations)：只追加迁移；文件存在不表示已应用到目标环境 |
| Harness | [docs/harness](docs/harness/README.md)、[evals/harness](evals/harness)：复用现有领域链路的评测、配对与恢复验收 |

仓库同时包含实际实现、离线准备和 fixture，验收要绑定具体版本、环境与行为。已有 [Staging 迁移和 JWT 隔离记录](artifacts/VPJ-02/staging-apply-20260910.md)、[持久预算本地验证](artifacts/VPJ-59/verification.md)、[Staging 预算迁移与 40 项 HTTP 检查](artifacts/VPJ-59/staging-20260910.md)及[原生验收记录](artifacts/VPJ-01/native-acceptance/verification.md)。Staging 预算使用合成数据，未调用真实付费 provider；部署 worker、原生会话及各父票完整验收仍需各自证据。任务进度以当前 GitHub Issue/PR 和对应运行证据核实。

## 本地开发

```bash
pnpm install --frozen-lockfile
pnpm dev
```

原生构建与测试见 [iOS 说明](ios/VisePanda/README.md)。Web 基线命令为 `pnpm check`；每次改动按[开发流程](docs/agents/development-workflow.md)选择本地验证，保留适用 CI 与最终能力验收。仅改文档时：

```bash
pnpm docs:check
git diff --check
```

开始任务先读 [AGENTS.md](AGENTS.md)、[CONTEXT.md](CONTEXT.md) 和当前 Issue 的[执行行](docs/program/2026-09-05/EXECUTION-CONTRACT.md)。完整阅读与权威关系见 [Program 入口](docs/program/2026-09-05/README.md)，可复制的任务提示见 [Agent 启动说明](docs/program/2026-09-05/AGENT-KICKOFF.md)。

## 专题导航

- [领域接口与不变量](docs/program/2026-09-05/INTERFACES.md)
- [品牌工程实施：基础偏好、服务任务与响应表达](docs/program/2026-09-05/BRAND-ALIGNMENT-EXECUTION.md)
- [HF 复用与两项独立准备](docs/harness/hf-reuse/README.md)
- [运营、客户交付与发布](docs/program/2026-09-05/OPERATIONS-AND-RELEASE.md)
- [历史 Issue 迁移](docs/program/2026-09-05/ISSUE-MIGRATION.md)、[归档与恢复](docs/program/2026-09-05/ARCHIVE.md)、[完整文档目录](docs/INDEX.md)

现有 TripProposal → 可见 diff → 用户确认 → 原子 Patch、身份/RLS、数据与接收方许可、删除和迁移合同继续有效。运行素材使用本地 [VisePanda 资产](public/assets/visepanda)，保留许可与发布审核；研究、概念图和 fixture 不能当作真实模型、库存、支付、履约或全国覆盖的证明。
