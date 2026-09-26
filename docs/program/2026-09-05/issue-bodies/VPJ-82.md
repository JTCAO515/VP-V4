## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Library工具资料与全局搜索探索。

## 执行边界与首个切片

- 首个可交付结果：先在Library聚合一类既有工具和同源成果，并支持查找自己的一份材料。
- 本票责任/非目标：负责资源聚合与搜索入口；工具自身、内容资格、导入、外部服务和实际成交各归已有owner。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-82) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-79 #560](https://github.com/JTCAO515/VP-V4/issues/560)
- [VPJ-20 #210](https://github.com/JTCAO515/VP-V4/issues/210)
- [VPJ-24 #214](https://github.com/JTCAO515/VP-V4/issues/214)
- [VPJ-26 #216](https://github.com/JTCAO515/VP-V4/issues/216)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] Library清楚区分Tools与My materials/results，聚合既有翻译/地址/上传订单/生成成果来源；不复制域内writer，eSIM仅在实际可用能力下开放。
- [ ] 全局搜索按外部已支持内容和私有资料/成果分组；search/open再次校验actor与当前资格，索引不成为隐私/撤回绕过。
- [ ] 空搜索页可提供有版权、与地点对应的视觉发现，既有Save/Ask/Add带实体/选区/来源交接同一VP；不是新增独立动态流。
- [ ] 跨Trip资料明确范围，成果从Library打开同一revision；纠正/删除/账号切换失效缓存和索引，不泄露标题、数量或摘要。
- [ ] 全局入口及旧Explore/Tools/Profile深链在zh/en和无障碍可达，缺能力时有真实状态和可用替代；搜索性能/质量以实测记录。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
