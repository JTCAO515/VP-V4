## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

真实地点与依据支撑的完整计划核验。

## 执行边界与首个切片

- 首个可交付结果：把一个相对日草稿补成真实地点/路线/时区/预约与行李缓冲约束，输出有来源的可行/待核结论和提案。
- 本票责任/非目标：负责规划约束与TripItemSupport；19提供地点/路程，09/10提供交互，68验少走路案例，不另造writer。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-65) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S3](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s3)。

## 验收依赖（不自动转为 blocked）

- [VPJ-09 #197](https://github.com/JTCAO515/VP-V4/issues/197)
- [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206)
- [VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209)

## Acceptance criteria

- [ ] 相对日草稿补成具体日期/实际地点时逐项解析身份、地址、路线和入场约束。
- [ ] 不完整依据仍可保留用户决定但标待核，plan feasible只能由当前必要证据支持。
- [ ] 整条有依据Proposal→diff→确认→TripItemSupport→以后重验可追溯。
- [ ] 计划适合度由最新明确需求与相关基础偏好参与，但步行量、时间、地点和可行性仍需同口径合格证据；不得因品牌个性化而放宽来源或晚餐锁。
- [ ] HF复用：借TravelPlanner等的有限约束检查结构并用独立oracle验最终计划，保留真实来源/版本/时区/用户约束；不执行外部hard_logic_py/任意DSL，不将ChinaTravel/Open-Travel的NC数据或历史价目直接导入商业运行链。
- [ ] 体验增量2026-09-17：计划核验覆盖机场/站场到住宿、跨城、换酒店取行李、固定预约报到及末班风险；基于实际地点、日期/时区、同行与行李约束核对门到门时间及必要缓冲。更改机场/酒店后重验受影响段，固定预约不被普通估算静默顺移；缺可靠路线依据保留待核。
- [ ] 体验增量2026-09-17：当前展开天次的餐饮/活动候选与路线、开放/预约条件相容；不强迫用户保留的自由时段绑定商户，不制造未选餐厅或实时席位。可靠缺口交给#211形成有依据的下一步，未确认提案不修改Trip；#265复用同口径少走路与已确认晚餐保持验收。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
