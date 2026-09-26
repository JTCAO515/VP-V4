## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

有原因、可关闭的旅行提醒。

## 执行边界与首个切片

- 首个可交付结果：先验已接受任务结果与用户设置提醒的真实投递，再增加有来源的持续检查。
- 本票责任/非目标：负责通知/调度资格和真实transport；VPJ-80拥有任务执行，VPJ-81显示进度，不因文件存在声称APNs可用。
- 先读/复用：[docs/product/assistant-upgrade-2026-09-27/README.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/README.md) · [docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/EXPERIENCE.md) · [docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) · [docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/S4-S5-SLICES-2026-09-22.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-30) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)。

## 开工依赖（GitHub 原生关系）

无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。

涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。

## 集成与最终验收依赖（普通关联）

- [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199)
- [VPJ-17 #207](https://github.com/JTCAO515/VP-V4/issues/207)
- [VPJ-25 #215](https://github.com/JTCAO515/VP-V4/issues/215)

可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。

## Acceptance criteria

- [ ] App内Next Step＋用户亲设时间提醒＋明确watch结果，发送前重验Trip版本/同意/时区/有效期。
- [ ] 重复、已完成、撤回、旅行结束、换账号提醒不发送；锁屏不泄漏敏感内容。
- [ ] 通知默认按用途授权，marketing/affiliate不借旅行提醒；Live Activity不在本纵切。
- [ ] 先验打开App后接续与用户授权的提醒，实际发送前重验范围/版本/期限；不把亲切或Pass增强解释为持续定位、永久后台或未经许可的主动联系。
- [ ] 助手升级2026-09-27：仅有意义的新结果/必要输入触发消息，无变化保持安静；Trip/同意/记忆basis已变、到期、暂停或完成时取消过时跟进，校验去重/时区/quiet hours。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
