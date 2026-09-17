## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Harness：真实只读问答产生有依据的结果与回执。

## 执行边界与首个切片

- 首个可交付结果：先核对PR #420的H04离线切片（合入testing-chat-vpv4，尚未在main），独立接回可复用增量；再把一个仍NOT_RUN的只读场景接到真实producer/consumer并核对Trip不变。
- 本票责任/非目标：负责只读真实整合验收；不是再实现07/16/76，离线H04通过不等于全部12场景或S2完成。
- 先读/复用：[docs/harness/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/README.md) · [docs/harness/OFFLINE-SEEDS.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/OFFLINE-SEEDS.md) · [artifacts/VPJ-67/recorded-usage-20260913/verification.md](https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-67/recorded-usage-20260913/verification.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-67) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/README.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S2](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s2)。

## 验收依赖（不自动转为 blocked）

- [VPJ-66 #263](https://github.com/JTCAO515/VP-V4/issues/263)
- [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206)

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

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
