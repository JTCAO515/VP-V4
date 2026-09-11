## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Harness：故障取消与重连不伪造成功或重复提交。

## 当前基线与开发入口

历史基线 PR #253 已合并；本任务需包含 VPJ-66…71 的 Harness 规划合并 main 后，按实时依赖、接口、环境与所有权核实执行范围。准备片段不等于真实集成验收。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-69)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/README.md)。
验收阶段：[S3](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s3)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-68 #265](https://github.com/JTCAO515/VP-V4/issues/265)

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

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
