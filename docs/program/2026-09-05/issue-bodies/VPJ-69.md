## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Harness：故障取消与重连不伪造成功或重复提交。

对同一真实任务在接受请求、工具返回、提案生成、提交前后及流式尾包命名检查点注入超时/重复投递/进程崩溃/断网/取消，重新进入得到真实最终状态。

## 当前基线与开发入口

历史基线 PR #253 已合并；本任务需包含 VPJ-66…71 的 Harness 规划合并 main 后，按实时依赖、接口、环境与所有权核实执行范围。准备片段不等于真实集成验收。
主报告：[完整统筹方案](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。
必须阅读：[本任务执行合同](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-69) 与 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/README.md)。

## Blocked by

- [VPJ-68 #265](https://github.com/JTCAO515/VP-V4/issues/265)

## Scope 与接口

- `lib/server/turn/**`
- `lib/server/jobs/**`
- `lib/server/observability/**`
- `app/api/chat/**`
- `ios/VisePanda/**`
- `components/chat/**`
- `evals/harness/**`
- `tests/**/harness/**`
- `docs/harness/**`
- `artifacts/VPJ-69/**`

只修改本用户故事需要的路径。接口在消费者接入前版本化，不能仅交fixture声称完成。

## Acceptance criteria

- [ ] 对同一真实任务在接受请求、工具返回、提案生成、提交前后及流式尾包命名检查点注入超时/重复投递/进程崩溃/断网/取消，重新进入得到真实最终状态。
- [ ] 用户扣次和Trip提交不重复；provider attempt可能重复收费须真实计量。提交或usage未知先核验/对账，不盲重试副作用。
- [ ] 取消阻止后续新副作用；提交已发生则显示已提交，不能伪称撤销。旧租约不能继续提交，跨账号旧事件不能回放。
- [ ] 实际Staging持久worker/数据/客户端在进程重启后仍恢复同一任务；进程内fake只能作为准备证据。任务次数/期限/费用均有预设上限。
- [ ] 将12场景中的故障与取消案例及命名注入点加入回归，保存实际最终状态/回执/失败矩阵；原生中英及现有Web受影响恢复路径验证。

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

- `artifacts/VPJ-69/verification.md`
- `artifacts/VPJ-69/unrun.md`
- `artifacts/VPJ-69/commands.jsonl`
- `artifacts/VPJ-69/results.json`

真实DB/provider/设备/购买是验收条件时，skip或fixture只算部分完成。

## Owner / 外部条件 / 观察

Owner: coding-agent。类型: vertical。预估专注工作3日，外部等待另计；超5日必须再拆。

- VPJ-68经VPJ-10→VPJ-09继承VPJ-08的恢复门；不重复建设任务、事件或预算账本。
- 仅在获准隔离Staging、测试任务与预算下故障注入；无获准worker/持久数据则真实恢复UNRUN，保持父票开放。

观察：有界PR验证；真实环境/人工校准等待另计

## 文档与回滚

- `docs/harness/README.md`
- `docs/handoff.json`

移除测试故障注入和新增整合点，保留已发生账目/提交、最终回执与原有恢复能力。

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
