## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

可恢复的有界规划执行与真实后台交付。

## 执行边界与首个切片

- 首个可交付结果：先执行一项住宿区域比较委托，真实工具/provider、关App与worker重启后交付持久成果。
- 本票责任/非目标：复用#195的worker和#194预算；#221拥有实际通知投递，#219拥有完整旅行可行性；无通用浏览器/任意代码平台。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-80) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S3](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s3)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-78 #559](https://github.com/JTCAO515/VP-V4/issues/559)
- [VPJ-79 #560](https://github.com/JTCAO515/VP-V4/issues/560)
- [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199)
- [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206)
- [VPJ-59 #194](https://github.com/JTCAO515/VP-V4/issues/194)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 在现有持久work/lease/attempt预算上增加有界规划模式：装配当前basis、选择允许步骤、工具执行、checkpoint、结果核验、交付或等待；不建通用第二Coordinator。
- [ ] 分别限制steps/retries/time/concurrency/累计成本，等待用户/确认时释放worker；继续任务保留原目标和已花成本，取消/撤权停止新的effect。
- [ ] 最小工具集合含合格知识/地点路线读、约束校验、成果准备；proposal生产只走typed adapter，持久action claim/回执替换进程Map假幂等，confirm/预订/支付仍不提供给模型。
- [ ] 实际provider/tool多步骤链在App关闭及worker重启后得到同一逻辑成果；每次可能重复计费的attempt真实记录，unknown先核验不盲重试。
- [ ] 任务运行时改口/Memory纠正/Trip版本变化重验basis，仅重算受影响部分；旧worker不得发布可行动的新结果，及时保存有用partial。
- [ ] 后台托管、scheduler与tool接线在指定环境实测；源码、空轮询、已完成文本纵切不算本票完成；前台任务状态和成果由同一持久事件读回。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
