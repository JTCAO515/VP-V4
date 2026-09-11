## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Harness：少走路且保留已确认晚餐的局部改稿闭环。

## 当前基线与开发入口

历史基线 PR #253 已合并；本任务需包含 VPJ-66…71 的 Harness 规划合并 main 后，按实时依赖、接口、环境与所有权核实执行范围。准备片段不等于真实集成验收。 开发阶段不等待供应商工单/书面答复、法务或产品许可；按开发接入规则用现有账号/API推进，未知项记录，保留用户同意和实际技术验证。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-68)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/README.md)。
验收阶段：[S3](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s3)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-67 #264](https://github.com/JTCAO515/VP-V4/issues/264)
- [VPJ-10 #198](https://github.com/JTCAO515/VP-V4/issues/198)
- [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199)
- [VPJ-65 #219](https://github.com/JTCAO515/VP-V4/issues/219)

## Acceptance criteria

- [ ] 用户对当前Trip要求第二天少走路、不动已确认晚餐；沿现有候选→可见diff→精确版本确认→原子Patch→重载路径验收，不另建writer。
- [ ] 按同日期/时区、出行模式、来源版本和口径比较步行距离或步行时长，运行前选择主要步行指标并要求其严格减少，另一指标辅助披露，不能删必保留项目换成功；基础数据归VPJ-65/19。证据不足只算待核候选，不算已验证少走路。
- [ ] 晚餐item ID、地点、日期/时区、起止时间、确认状态及回执在候选/diff/最终Trip均不变；当前明确要求优先于旧偏好但不能覆盖权限与安全。
- [ ] 用户确认绑定不可变proposal revision与base Trip revision；未确认、拒绝、过期、越权/撤权以及另一客户端修改均不误写或覆盖，重复确认不重复提交。
- [ ] 按12场景规格接入约束/偏好/证据不足及确认冲突案例；原生中英结果和精简Web同Trip/diff语义一致，应用后重载与事务回执一致。
- [ ] 报告fixture与获准真实环境、测量依据及失败案例；缺路线口径或真实原子回执不可用不能关闭本票。

## 不得触碰

- 不新建 Program、Coordinator、模型路由、长期记忆、预算账本或 Ops 仪表盘；缺失基础接口归原 VPJ 责任票。
- 保留 actor/RLS、证据资格、用途/接收方许可、准确版本确认和原子 TripPatch；不解除 Trip/proposal 工具注册限制。
- 不读取或持久记录秘密、真实用户原文或完整思维链；不修改原用户工作树、既有65项范围/依赖或已应用迁移。
- 不把 fixture/NOT_RUN/skip 当真实通过，不自动上线候选，不进行未授权的账号、外发、采购、支付或生产操作。

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
