## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

两周客户发现试点与后续运营交接。

## 执行边界与首个切片

- 首个可交付结果：以已有招募与工作包验证规划阶段真实任务，观察用户是否愿意委托并回来继续。
- 本票责任/非目标：复用原客户发现；不新增外发授权、不把访谈满意等同付费或真实采用。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-46) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S1](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s1)。

## 验收依赖（不自动转为 blocked）

无其他任务依赖；仍需核对当前接口、环境与外部条件。

## Acceptance criteria

- [ ] 执行总35h时间盘：真实客户任务10、研发验收8、招募社区6、内容合作4、知识审查3、支持2、复盘2；30–40h按需求伸缩。
- [ ] 两个周sprint只跑自有/转介绍+一个社区+一个伙伴渠道；3–4访谈+1–2交付起步；禁止未请求群发。
- [ ] Planning/Arriving/In-trip队列、opt-in、原话/行为/来源/分钟数去敏记录；为Supported Journey Matrix提供真实需求。
- [ ] 初期使用许可内现有入口或VPJ-62 intake，不等待地图/支付/完整App；Founder-assisted与产品自助明确。
- [ ] 按规划/临近抵达/在途分别记录真实首值、重复问题与下一自然节点机会；Demo、创始人协助与自助真实能力分别统计，不从社媒触达推断已实现。
- [ ] 本票以两个周sprint的去敏任务/交付/分钟记录、需求复盘与下一轮负责人/节奏交接作为有限交付；后续每周经营持续进行，但不以永久运营义务让本票无法结项。
- [ ] 助手升级2026-09-27：区分探索/关键安排未定/已预订/在途人群；观察任务采用、自然节点回访、记忆可理解与可纠正、无需VP预订时的独立付费意愿；小样本不外推转化率。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
