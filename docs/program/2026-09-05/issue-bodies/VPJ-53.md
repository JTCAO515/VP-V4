## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 后续证据触发任务

## 用户结果

Android 与新增语言的需求触发设计。

## 执行边界与首个切片

- 首个可交付结果：保持expand门：以真实需求及成本证据形成Android或新增语言的先后决定和一个明确实施范围。
- 本票责任/非目标：这是扩展决策票，不是空白客户端实现；保留现有语言兼容，不为凑新平台改首发范围。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-53) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 expand](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#expand)。

## 开工依赖（GitHub 原生关系）

- [VPJ-45 #245](https://github.com/JTCAO515/VP-V4/issues/245)
- [VPJ-47 #247](https://github.com/JTCAO515/VP-V4/issues/247)

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

无其他普通关联；上列真实开工依赖仍保留。

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] 根据真实需求决定Android/西俄阿的先后，不从schema兼容推断已支持。
- [ ] 复用同协议/Trip/entitlement，平台原生体验、语料和无障碍分别验收。
- [ ] 给独立容量/预算/迁移计划后再拆实现，不把本研究当客户端开发。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

后续开启门：在VPJ-47记录需求/成本/责任证据，agent据此判断开发优先级；无需额外产品许可，未实测不能自动标为验收通过

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
