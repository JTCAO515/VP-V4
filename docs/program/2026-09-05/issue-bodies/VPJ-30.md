## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

有原因、可关闭的旅行提醒。

## 执行边界与首个切片

- 首个可交付结果：先做一个用户亲设时间提醒，发送前核对当前Trip版本、用途同意、时区、完成/撤回状态。
- 本票责任/非目标：负责提醒触发与投递；25负责打开App后的读取，17提供变化信号，不启用持续定位/营销通知或无根据watch。
- 先读/复用：[docs/program/2026-09-05/INTERFACES.md](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)
- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。

## 实施与验收入口

[执行行：范围、检查、证据与回退](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-30) · [接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md) · [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) · [阶段 S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)。

## 验收依赖（不自动转为 blocked）

- [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199)
- [VPJ-17 #207](https://github.com/JTCAO515/VP-V4/issues/207)
- [VPJ-25 #215](https://github.com/JTCAO515/VP-V4/issues/215)

## Acceptance criteria

- [ ] App内Next Step＋用户亲设时间提醒＋明确watch结果，发送前重验Trip版本/同意/时区/有效期。
- [ ] 重复、已完成、撤回、旅行结束、换账号提醒不发送；锁屏不泄漏敏感内容。
- [ ] 通知默认按用途授权，marketing/affiliate不借旅行提醒；Live Activity不在本纵切。
- [ ] 先验打开App后接续与用户授权的提醒，实际发送前重验范围/版本/期限；不把亲切或Pass增强解释为持续定位、永久后台或未经许可的主动联系。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
