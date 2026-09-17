## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Harness：少走路且保留已确认晚餐的局部改稿闭环。

## 执行边界与首个切片

- 首个可交付结果：在实际路线依据就绪时执行同一Trip少走路且保留晚餐的完整局部改稿，取得确认/重载与测量回执。
- 本票责任/非目标：负责整合验收；10实现交互、11提供偏好、65提供可行性，不能用新fake适配器绕过真实输入。
- 先读/复用：[docs/harness/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/README.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-68) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/README.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S3](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s3)。

## 开工依赖（GitHub 原生关系）

- [VPJ-65 #219](https://github.com/JTCAO515/VP-V4/issues/219)

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-67 #264](https://github.com/JTCAO515/VP-V4/issues/264)
- [VPJ-10 #198](https://github.com/JTCAO515/VP-V4/issues/198)
- [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

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
