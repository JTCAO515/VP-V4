## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Journey Pass 商品、权益和定价实验配置。

## 当前基线与开发入口

原VPJ基线已合并；2026-09-10品牌增量以Q1-Q38报告的已确认方向为准，当前任务及新增规划契约需按合入main后的版本执行。已有可独立进行的准备范围继续；开发接入与可逆参数由agent按现有方向推进，无需第三方、法务或产品许可；真实收费与发布按相应范围验收。 开发阶段不等待供应商工单/书面答复、法务或产品许可；按开发接入规则用现有账号/API推进，未知项记录，保留用户同意和实际技术验证。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-33)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S5](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s5)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)

## Acceptance criteria

- [ ] 以Free+30天非自动续费Journey Pass为试点：$19.99参考价，$14.99只单变量实验；地区价来自StoreKit。
- [ ] 明确现行购买开始/提前续买/退款/恢复/到期，以及获准的新服务任务周期与Free窗口口径；新容量未决定前不写入在售商品，无unlimited或人工包含承诺。
- [ ] agent先用StoreKit开发/sandbox配置完成链路；真实上架时从实际账户核对SKU/合同主体/税费及价格，未上线商品不能收私人款。
- [ ] 每笔交易独立720h grant，绑定已批准的计量策略版本和容量；提前购排队、到自己的startsAt才发额度，到期余量不结转；退款仅撤本段、其他段时间不移，恢复无新额度，账号滚动窗口不因购买/恢复而重置；乱序交易按可信购买时间对账。容量与窗口数值由agent按Q37方向设置可追踪开发值，真实收费前再确认，历史300Ask/60Ask只作兼容研究记录，不是新服务任务的实施门。媒体≤60秒录音/次、默认讲解≤2分钟、图≤10MB、PDF≤10页/20MB的既有试点上限保留并核成本。
- [ ] 权益表回写Q36：Free与Pass共同具有获准的基础显式跨Trip偏好；Q37采用完整服务任务方向，原Ask数值不得换名沿用，partial/改稿/TTL/跨期及新容量先决策再公布。
- [ ] Q38购买后激活、到达起算、eSIM和支付渠道保持待研究；本轮不改变现行购买/生效/到期规则、不增加商品承诺。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
