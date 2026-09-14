## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

运营可追溯查看来源版本、原文与知识本体关系。

## 当前基线与开发入口

JT于2026-09-13授权知识体系升级规划及拆票。先安全交付当前主线；本规划PR合并后核对本票输入、main接口与实际环境再实施。规划未合并可读规格和做独立准备，不按未合并接口写运行代码。沿现有开发接入规则，供应商未知项不是前置许可；保留RLS、实际告知/同意、Trip确认和真实验收。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/codex/knowledge-upgrade-plan-20260913/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-74)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/codex/knowledge-upgrade-plan-20260913/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/codex/knowledge-upgrade-plan-20260913/docs/knowledge-upgrade/README.md)。
验收阶段：[S2](https://github.com/JTCAO515/VP-V4/blob/codex/knowledge-upgrade-plan-20260913/docs/program/2026-09-05/DELIVERY-STAGES.md#s2)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/codex/knowledge-upgrade-plan-20260913/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

无其他任务依赖；仍需核对当前接口、环境与外部条件。

## Acceptance criteria

- [ ] 以一个已发布支付/铁路/SIM声明为纵切：普通获准Ops从声明读到稳定对象/关系、source revision与原文locator；新旧版本可并列核查，未授权actor无法读取私有候选。
- [ ] 将现有subjectId/predicate/objectId/条件和例外映射到版本化类型/关系domain-range与zh/en别名；复用ID，无破坏性重命名；未注册关系只产生候选且不能执行。
- [ ] 建立或兼容映射SourceRevision/EvidenceSpan的hash、获取时间、生效时间或unknown和原位置；旧记录缺血缘如实标legacy，重放同源幂等且不伪造时间/reviewer。
- [ ] 实际Staging API/Ops读回通过；有界解析保留定位和错误，覆盖URL/重定向/内网请求限制、输入限额和资料注入，抓取与解析错误不变成政策变化。
- [ ] 受影响数据库追加迁移、隔离恢复及权限/撤回反例验证通过，记录同一版本环境；原发布流程、旧客户端、publications和Trip无非预期改变。
- [ ] 提供给VPJ-75/76/#211可消费的版本化契约与真实样本；文档/schema或fixture单独通过不能关闭本票。

## 不得触碰

- No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.
- No secrets, original user worktree, old applied migrations, branch protection or production actions.
- No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.
- No archived research/test oracle deletion or invented runtime/provider/Store result.

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
