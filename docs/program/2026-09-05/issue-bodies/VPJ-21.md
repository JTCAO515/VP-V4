## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

准备检查把关键缺口变成可做的下一步。

## 执行边界与首个切片

- 首个可交付结果：从已选方向识别一个当前需要处理的准备缺口，提供可完成的下一步。
- 本票责任/非目标：负责准备事实/依赖与状态；优先级随旅行阶段，任务调度复用VPJ-80，不建设第二个待办引擎。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-21) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S3](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s3)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-10 #198](https://github.com/JTCAO515/VP-V4/issues/198)
- [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206)
- [VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209)
- [VPJ-74 #358](https://github.com/JTCAO515/VP-V4/issues/358)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 对首批明确场景检查网络/支付/入场/地址/交通，分knowledgeAvailability/userReadiness/actionTiming。
- [ ] 日期从相对变精确时重核相关证据；建议不改用户计划，未知不当通过。
- [ ] 每个缺口一项可操作下一步与依据/适用范围；非适用项目不制造焦虑。
- [ ] 准备检查以可执行下一步呈现：获准资料、核实入口、条件性候选与修改提案分开；不要把review_fact标签或提示文字作为真实问题已解决。
- [ ] 知识升级：用版本化Ontology对象/关系/条件和获准用户状态计算knowledgeAvailability/userReadiness/actionTiming；相同证据下unknown/满足/不满足/不适用/未到时间均有中英原生实际结果，未知不能当false或已准备。
- [ ] 知识升级：每个可做下一步绑定task/trip scope及evidence/rule versions；需改Trip时复用Proposal/diff/exact-version确认/原子Patch，拒绝、撤权、旧版本和重试无误写，原生与同Trip Web重载一致。
- [ ] 助手升级2026-09-27：行前先帮助选择，再渐进呈现网络/支付/预约等适用准备；unknown与未完成区分，完成必须有明确来源，避免首页满屏风险或用阻塞状态充当完成率。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
