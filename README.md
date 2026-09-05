# VisePanda — 贯穿中国自由行的 AI 旅行助手

最新统筹：[VPJ 主报告](docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。开发入口：[Program #187 与任务队列](docs/program/2026-09-05/README.md)。

VP 帮旅客共同规划、整理材料、检查准备、现场沟通与讲解，并在变化发生后接回同一 Trip。原生 iOS 是完整产品方向；Web 是精简的同 Trip Planning Studio。当前发布范围为中英；其他语言保留历史和兼容资产，迁移由 VPJ-01 负责。

## 当前代码事实

Web/server 是 Next.js App Router、React、strict TypeScript、Tailwind。已有 Trip Day/Item、Proposal/diff/atomic confirm、owner 访问与24条迁移；许多模型、worker、知识和媒体模块仍是fixture/进程内合同。真实 Staging、provider、RLS、原生和商店交付分别待新任务验收。

现有 Web Chatbot、Trip Canvas 与 Today 的有效合同继续复用；新原生界面在同一Trip协议上接入。

主线原本没有iOS；原工作区预览壳作为有来源的[归档输入](docs/archive/2026-09-05/ios-source-reference/VisePanda/README.md)保留，新任务移植后才能作为原生实现。当前页面不得声称已提供真实库存、支付、履约或全国覆盖。

## 开发

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm check
pnpm docs:check
node scripts/vpj-program.mjs verify
```

当前web路由使用 `components/homepage/ImmersiveHomepage.tsx` 和 `components/homepage/Homepage.tsx`；旧无运行时消费者Landing已按hash归档。

新Issue使用独立worktree和PR，按实际native dependencies和执行合同选择frontier。基线PR未合并前，不从旧main直接实施新商业、权限或语言合同。

## 重要入口

- [总体产品、商业、设计、后台及客户交付](docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)
- [完整任务与依赖](docs/program/2026-09-05/ISSUES.md)
- [接口与不变量](docs/program/2026-09-05/INTERFACES.md)
- [每个Issue的执行边界和命令](docs/program/2026-09-05/EXECUTION-CONTRACT.md)
- [客户运营与发布](docs/program/2026-09-05/OPERATIONS-AND-RELEASE.md)
- [旧Issue迁移](docs/program/2026-09-05/ISSUE-MIGRATION.md)
- [归档/恢复](docs/program/2026-09-05/ARCHIVE.md)
- [文档目录](docs/INDEX.md)
- [本轮验证](docs/program/2026-09-05/VERIFICATION.md)

原始VP Logo/熊猫与brand token继续保留；来源许可与已阻塞发布素材仍按既有资产台账验收。研究和概念图不能自动成为正式商店截图或供应商事实。
