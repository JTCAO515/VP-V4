## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

有原因、可关闭的旅行提醒。

## 当前基线与开发入口

原VPJ基线已合并；2026-09-10品牌增量以Q1-Q38报告的已确认方向为准，当前任务及新增规划契约需按合入main后的版本执行。已有可独立进行的准备范围继续；未决收费、数据许可和激活制不视为已批准，完整验收仍保留真实依赖。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-30)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/INTERFACES.md)。
验收阶段：[S4](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s4)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

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
