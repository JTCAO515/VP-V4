# VPJ 最终统筹与开发入口

日期2026-09-05。Program：[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187)。基线分支 `codex/vp-final-program-20260905`；PR与实际tracker结果在issue-plan.json / tracker-verification.json中登记。

## 先读哪些文件

1. [完整统筹报告](../../VISEPANDA-MASTER-PLAN-2026-09-05.md)：产品、商业、所有客户端/后台、知识、运营、发布和本轮调整。
2. [ADR-0023](../../adr/ADR-0023-vpj-integrated-native-journey-baseline.md)：新旧基线冲突与权限。
3. [任务队列](ISSUES.md)：按依赖顺序生成，包含实际GitHub编号。
4. [接口合同](INTERFACES.md)、[当前Issue执行行](EXECUTION-CONTRACT.md)。
5. [运营与客户交付](OPERATIONS-AND-RELEASE.md)、[旧新Issue映射](ISSUE-MIGRATION.md)、[归档说明](ARCHIVE.md)。

证据附件：[代码复用](../../research/final-code-reuse-audit-2026-09-05.md)、[原生iOS/UIUX](../../research/final-ios-product-delivery-2026-09-05.md)、[Tracker/商业](../../research/final-tracker-commercial-audit-2026-09-05.md)。这些是审查输入，主报告与Issue manifest记录最终取舍；附件中的候选拆分不产生第二套队列。

## 当前范围

原生中英iOS完整旅程，精简Web同Trip基本编辑/确认；一个VP多受控技能。酒店L1a/L1b；Free+30天非自动续费Journey Pass试验；语音/讲解/离线/Community/简单分享/运营/删除/IAP/发布均有责任任务。后续扩展要有真实触发证据。

## 开发调度

基线PR合并前新任务保持blocked。合并后重新查询实际依赖/PR/环境，只有自己的上游已完成、接口存在、没有文件owner冲突且operator条件满足时才可认领。最早可并行路径：原生基础01、Staging02、数据政策03、客户发现46、申请入口62；商品33随03。每条Issue一branch/worktree/PR。

## 工具

```bash
node scripts/vpj-program.mjs verify
node scripts/vpj-program.mjs render
pnpm docs:check
git diff --check
```

`publish / close-old / verify-remote` 由本轮明确tracker迁移授权使用；普通coding Issue不可运行外部变更模式。重复执行发布按VPJ编号查找，不创建同名重复项；迁移快照记录全部旧body/comments/关系。

## 完成和回滚

统筹交付包含主报告、详细任务/原生依赖、恢复性归档和reviewable PR；它与产品后续可用是不同完成条件。旧Issue按not planned关闭并链接新责任，不代表Staging/模型/隐私/发布已通过。回滚可reopen旧Issue和恢复标签，源码从hash归档或git恢复；不动用户原工作树或已执行数据库。

观察窗口、运行UNRUN和验证结果见 [验证记录](VERIFICATION.md) 与根handoff。当前没有真实用户/模型/数据库/商店运行验收。
