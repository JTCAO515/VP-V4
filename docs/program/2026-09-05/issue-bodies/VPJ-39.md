## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

境内外媒体、酒店跳转、IAP 与通知网络验收。

## 当前基线与开发入口

历史规划基线：#253。当前执行读取 main 的合同，并核对实时依赖、可用接口和获准环境；本计划定义不代表任务已就绪或已验收。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-39)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S5](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s5)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195)
- [VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209)
- [VPJ-27 #217](https://github.com/JTCAO515/VP-V4/issues/217)
- [VPJ-63 #231](https://github.com/JTCAO515/VP-V4/issues/231)
- [VPJ-23 #213](https://github.com/JTCAO515/VP-V4/issues/213)
- [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226)
- [VPJ-30 #221](https://github.com/JTCAO515/VP-V4/issues/221)
- [VPJ-55 #236](https://github.com/JTCAO515/VP-V4/issues/236)

## Acceptance criteria

- [ ] 按真实海外/境内WiFi/漫游/弱网记录DNS→API→DB→model/map/media的p50/p95/失败，不用provider国籍推断可达。
- [ ] 设置超时、断线恢复和离线读取目标，验证语音长连接/图片导入在预算内。
- [ ] 地区不合格时给实际替代拓扑和用户边界；采购或部署变更不自行执行。
- [ ] 在真实境内外网络验证OTA参数落地、StoreKit购买/恢复、APNs接收与回跳、Files/Share Extension导入，不以model测试代替这些不同链路。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
