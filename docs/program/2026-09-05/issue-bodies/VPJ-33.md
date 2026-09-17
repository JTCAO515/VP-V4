## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Journey Pass 商品、权益和定价实验配置。

## 执行边界与首个切片

- 首个可交付结果：冻结一个版本化Free/30天Pass开发权益表及交易时间规则，给sandbox配置和用户展示提供同一输入。
- 本票责任/非目标：唯一维护商品/有效期/容量政策说明；34实现交易与grant，35实现ServiceTask容量消费；真实销售参数另核实际账户。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
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
