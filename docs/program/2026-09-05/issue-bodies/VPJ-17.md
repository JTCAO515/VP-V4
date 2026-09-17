## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

来源更新后安全重验相关知识与 Trip。

## 执行边界与首个切片

- 首个可交付结果：消费现有来源版本/撤回信号，完成一个下游投影或TripItemSupport的影响记录、ack和失败重试。
- 本票责任/非目标：负责来源变化向消费者传播；复用75已有撤回标注/扫描产物，不抢占其worker/UI或重复实现；不自动更改确认Trip。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-17) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S3](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s3)。

## 开工依赖（GitHub 原生关系）

- [VPJ-75 #359](https://github.com/JTCAO515/VP-V4/issues/359)

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192)
- [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204)
- [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] SourceRevision→影响候选→独立复核→outbox→索引/投影ack可重试；不是仅返回cascade意图。
- [ ] TripItemSupport绑定claim版本，旧证据失效不删除用户已确认意图。
- [ ] 404/页面样式变动不当政策反转；撤权立即停新检索/外发，保留允许的审计。
- [ ] 知识升级：来源变化生成有版本的影响集，覆盖Wiki页面、statement、检索索引/缓存、历史答案和TripItemSupport；outbox逐消费者ack可重试，记录延迟/乱序/失败与恢复，删除旧索引未完成时当前资格gate仍阻止失效知识外发。
- [ ] 知识升级：规范化缺口与来源更新只进入有界Wiki草稿/复核任务，区分资料变动、解析差异、404和真正政策反转；记录每次刷新成本/unknown及受影响知识数，不收集私人对话原文、不无限自动抓取或自动发布。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
