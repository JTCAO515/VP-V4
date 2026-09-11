## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Harness：两条离线旅行任务可运行、判分并定位失败。

## 当前基线与开发入口

历史基线 PR #253 已合并；本任务需包含 VPJ-66…71 的 Harness 规划合并 main 后，按实时依赖、接口、环境与所有权核实执行范围。准备片段不等于真实集成验收。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-66)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/README.md)。
验收阶段：[S2](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s2)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

无其他任务依赖；仍需核对当前接口、环境与外部条件。

## Acceptance criteria

- [ ] 从现有 pnpm evals 入口完整运行无 Trip 问答和保留晚餐的局部调整两个合成开发种子，得到一个 JSON 报告与可读摘要；本票只验收离线准备。
- [ ] 记录 producer→adapter→consumer→assertion 复用清单，区分 fixture/in-memory/live；定位现有 Trip 路由/RPC、ContextPlan、ToolGateway 和模型/预算接缝，不另造框架。
- [ ] 定义12个独立场景及6类覆盖，8开发/4分层holdout；每例有固定输入/时钟/证据/Trip版本、允许结果、禁止行为、oracle及required mode。翻译/参数变体不能跨组泄漏或充数。
- [ ] 两个种子分别注入一个可复现错误：不支持的关键claim、晚餐或未确认写入保护被破坏时，判分器稳定FAIL并指出步骤；全拒答不能通过正常可答案例。
- [ ] 其余未接通场景标NOT_RUN并映射VPJ-67/68/69，报告独立案例数、语言、运行数与模式；旧AI-42元数据组合不能计入行为覆盖。
- [ ] 报告执行状态、业务outcome、验收verdict和配置/grader版本分开；仅allowlist元数据。离线测试不连provider、不写真实Trip、不扣用户额度。
- [ ] 准备验收以两个正常种子PASS及故意失败被检出为准；明确12场景和真实服务验收尚未完成。

## 不得触碰

- 不新建 Program、Coordinator、模型路由、长期记忆、预算账本或 Ops 仪表盘；缺失基础接口归原 VPJ 责任票。
- 保留 actor/RLS、证据资格、用途/接收方许可、准确版本确认和原子 TripPatch；不解除 Trip/proposal 工具注册限制。
- 不读取或持久记录秘密、真实用户原文或完整思维链；不修改原用户工作树、既有65项范围/依赖或已应用迁移。
- 不把 fixture/NOT_RUN/skip 当真实通过，不自动上线候选，不进行未授权的账号、外发、采购、支付或生产操作。

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
