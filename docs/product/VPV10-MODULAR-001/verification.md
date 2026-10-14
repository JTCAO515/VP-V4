# 本次方向变更验证

基线 c5a8f3c1f58e14b18f0ba5382b19ca7fe7e78e95；首个稳定文档提交 e317e98a。

- PASS：`pnpm docs:check`，83 个原 manifest tasks、20 个原 replacements、依赖无环、合同/归档 hash 与生成 handoff 一致。
- PASS：`node scripts/vpj-program.mjs verify`。
- PASS：`pnpm lint`，834 个源文件策略检查。
- PASS：`node --test tests/unit/governance/vpj-plan.test.mjs tests/unit/governance/vpj-sequence.test.mjs tests/unit/governance/vpj-body-progress.test.mjs tests/unit/governance/handoff-documents.test.mjs`，46/46。
- PASS：`pnpm check:artifacts`，+0.53 MB / 5 MB 上限。
- PASS：manifest 去除本次 modularDirection 增量后与基线对象完全相等，原验收、依赖、关闭任务没有改写。
- PASS：GitHub REST `--paginate` 的全部 open Issue（排除 PR）与 52 票快照集合一致。
- PASS：`git diff --check`（截至当次已跟踪文档）；后续读回证据另检查。
- Issue 实际写入结果以 `readback.json` 为准；after 文稿本身不是外部写入证据。
- UNRUN：产品构建、浏览器/真实 provider/目标数据库/物理设备/部署。此次方向与文档任务未运行这些行为，不以文档或治理检查冒充产品验收。

已知生成器差距：现有 renderer 不消费新增 modularDirection；不能直接 sync-bodies/render 覆盖本次人工核对的正文和导航。源适配需要 Main 精确 lease，所有原 schema/governance 检查仍有效，未削弱断言。

GitHub 传输异常保留：#681 首次补充的 GraphQL 预读 EOF（写入前）；#229 GraphQL edit EOF（结果未知）。两者均先通过同账户官方 REST 读回，再按实际 body hash 决定是否需要写入；没有盲重试未知写入。具体 #229 是否已生效见 readback.json 的 alreadyAppliedRecoveredByRead。
