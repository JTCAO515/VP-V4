## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

真实地点与依据支撑的完整计划核验。

## 当前基线与开发入口

原VPJ基线已合并；2026-09-10品牌增量以Q1-Q38报告的已确认方向为准，当前任务及新增规划契约需按合入main后的版本执行。已有可独立进行的准备范围继续；开发接入与可逆参数由agent按现有方向推进，无需第三方、法务或产品许可；真实收费与发布按相应范围验收。 开发阶段不等待供应商工单/书面答复、法务或产品许可；按开发接入规则用现有账号/API推进，未知项记录，保留用户同意和实际技术验证。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-65)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S3](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s3)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

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
