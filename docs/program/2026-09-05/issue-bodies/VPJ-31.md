## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

按服务任务授权的动态 Traveler Brief。

## 执行边界与首个切片

- 首个可交付结果：在现有CaseRequest/AccessGrant下，只投影一个服务任务必需的用户字段，并验证纠正/撤回后的访问。
- 本票责任/非目标：负责授权Brief投影；57负责grant/访问期限，32负责人员接单与结果，11负责偏好权威。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-31) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)。

## 验收依赖（不自动转为 blocked）

- [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)
- [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199)
- [VPJ-12 #201](https://github.com/JTCAO515/VP-V4/issues/201)
- [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204)
- [VPJ-57 #222](https://github.com/JTCAO515/VP-V4/issues/222)

## Acceptance criteria

- [ ] 用户给case授权后员工只看任务需要字段；Owner可审授权范围和审计，非普通全库读。
- [ ] 需求/预算/偏好/表达详细程度带来源、更新时刻和显式/推断标记；无敏感人格推定。
- [ ] 纠正/撤权/删除传播到报告和可控缓存；旧摘要不能压过最新用户输入。
- [ ] TravelerBrief只投影当前ServiceCase目的下获准的最小资料及偏好版本；不因基础记忆Free可用而开放人工读取全历史，撤回后未来访问与队列重新校验。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
