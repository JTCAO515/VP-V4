## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Harness：真实只读问答产生有依据的结果与回执。

获准测试用户在真实原生Ask无需创建Trip即可获得answered/partial/clarification/blocked/technical_failure及对应证据；复用VPJ-07/16实际producer/consumer，不重建基础能力。

## 当前基线与开发入口

历史基线 PR #253 已合并；本任务需包含 VPJ-66…71 的 Harness 规划合并 main 后，按实时依赖、接口、环境与所有权核实执行范围。准备片段不等于真实集成验收。
主报告：[完整统筹方案](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。
必须阅读：[本任务执行合同](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-67) 与 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/README.md)。

## Blocked by

- [VPJ-66 #263](https://github.com/JTCAO515/VP-V4/issues/263)
- [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206)

## Scope 与接口

- `lib/server/turn/**`
- `lib/server/context/**`
- `lib/server/knowledge/**`
- `lib/server/observability/**`
- `app/api/chat/**`
- `components/chat/**`
- `ios/VisePanda/**`
- `evals/harness/**`
- `tests/**/harness/**`
- `docs/harness/**`
- `artifacts/VPJ-67/**`

只修改本用户故事需要的路径。接口在消费者接入前版本化，不能仅交fixture声称完成。

## Acceptance criteria

- [ ] 获准测试用户在真实原生Ask无需创建Trip即可获得answered/partial/clarification/blocked/technical_failure及对应证据；复用VPJ-07/16实际producer/consumer，不重建基础能力。
- [ ] 服务端身份和用途/接收方资格始终成立，正常可答/部分可答/缺字段/证据过期与冲突/资料注入/provider不可用均有命名观察；只读请求前后Trip数量和内容不变。
- [ ] 关键claim有当前适用证据和对应校验回执；必要claim遗漏、过度拒答和无谓追问能被判失败，固定快照不冒充实时核验。
- [ ] 任务ID可追至attempt、上下文/证据/工具版本、原因码、终态、耗时、预算及实际usage；仅allowlist字段，缺失费用标unknown。
- [ ] 把12场景中本票负责的只读案例接入必测集合；fixture与真实Staging分栏，中英各至少一条实际任务链通过，不能以界面文字或mock结票。
- [ ] 验证原生消费者和现有Web Chat的结果语义，保留老客户端兼容；本票不扩充Web范围。

## 不得触碰

- 不新建 Program、Coordinator、模型路由、长期记忆、预算账本或 Ops 仪表盘；缺失基础接口归原 VPJ 责任票。
- 保留 actor/RLS、证据资格、用途/接收方许可、准确版本确认和原子 TripPatch；不解除 Trip/proposal 工具注册限制。
- 不读取或持久记录秘密、真实用户原文或完整思维链；不修改原用户工作树、既有65项范围/依赖或已应用迁移。
- 不把 fixture/NOT_RUN/skip 当真实通过，不自动上线候选，不进行未授权的账号、外发、采购、支付或生产操作。

## 验证与证据

- `pnpm docs:check`
- `git diff --check`
- `pnpm check`
- `pnpm test:contract`
- `pnpm test:integration`
- `pnpm test:security`
- `pnpm evals`

本票实际受影响原生路径必须build/test并附中英交互证据；先xcrun simctl list devices available，记录实际UDID替换后的xcodebuild test命令及版本/xcresult。真实账号/worker/服务不可用标UNRUN；Simulator不替代原票的真机/商店门。

- `artifacts/VPJ-67/verification.md`
- `artifacts/VPJ-67/unrun.md`
- `artifacts/VPJ-67/commands.jsonl`
- `artifacts/VPJ-67/results.json`

真实DB/provider/设备/购买是验收条件时，skip或fixture只算部分完成。

## Owner / 外部条件 / 观察

Owner: coding-agent。类型: vertical。预估专注工作4日，外部等待另计；超5日必须再拆。

- VPJ-16继承VPJ-07及真实身份/provider/预算/知识门；接口、获准Staging、测试身份、provider接收方和批次费用上限必须实际可用。
- 按共享流程可先交独立fixture准备PR；真实中英客户端、证据与只读无写入验收缺失时父票不得关闭。

观察：有界PR验证；真实环境/人工校准等待另计

## 文档与回滚

- `docs/harness/README.md`
- `docs/handoff.json`

关闭本票整合检查点并恢复原支持路径；不清空用户任务、不改授权或预算账本。

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
