## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Free与订阅服务边界、商品策略和旧Pass兼容。

## 执行边界与首个切片

- 首个可交付结果：先定义行前可感知的免费/付费服务范围与旧Pass兼容矩阵，所有未选销售参数保持未激活。
- 本票责任/非目标：本票是唯一商品/范围/容量策略owner；新订阅方向已接受，月订阅为首候选，价格/周期/额度待验证；VPJ-34/35消费版本策略。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-33) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S5](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s5)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 2026-09-27采用Free+用户付费订阅的产品方向，月订阅作为首轮候选；实际价格/周期/容量尚未冻结。旧30天Pass及$19.99/$14.99为历史实现/实验参考，不是新方案唯一销售约束。
- [ ] 明确现行购买开始/提前续买/退款/恢复/到期，以及获准的新服务任务周期与Free窗口口径；新容量未决定前不写入在售商品，无unlimited或人工包含承诺。
- [ ] agent先用StoreKit开发/sandbox配置完成链路；真实上架时从实际账户核对SKU/合同主体/税费及价格，未上线商品不能收私人款。
- [ ] 旧non-renewing Pass保持每笔交易720h、排队/startsAt/退款/恢复的既有账本语义，不能套用于新订阅。按商品策略版本分别规定续期、到期、撤销、容量和跨期服务；未选值只用于明确标记的开发配置，真实销售前核对官方商品及公开权益。
- [ ] 权益表回写Q36：Free与Pass共同具有获准的基础显式跨Trip偏好；Q37采用完整服务任务方向，原Ask数值不得换名沿用，partial/改稿/TTL/跨期及新容量先决策再公布。
- [ ] Q38购买后激活、到达起算、eSIM和支付渠道保持待研究；本轮不改变现行购买/生效/到期规则、不增加商品承诺。
- [ ] 助手升级2026-09-27：付费边界围绕行前研究、约束核查、复杂协调和持续任务；免费保留基础记忆/纠错/导出删除与可用首值。eSIM/无限服务/人工包含不因资源库入口而获准。
- [ ] 助手升级2026-09-27：有佣/无佣候选使用同一适配规则，佣金元数据不提升有机排序，披露商业出口和候选覆盖；用户在其他平台预订仍可获得独立助手价值。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
