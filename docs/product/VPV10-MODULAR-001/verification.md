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

生成器差距已在 Main 追加 lease 内修复：保留审核后全文快照、任务定义 hash、当前导航和原远端 preflight。新定义/归属漂移拒绝静默输出，后续正文变化须显式刷新审核快照。隔离 render 实测保留全部迁移正文和原 CONTEXT/HANDOFF 字节，仅四个 leased 投影复制回工作树。

GitHub 传输异常保留：#681 首次补充的 GraphQL 预读 EOF（写入前）；#229 GraphQL edit EOF（结果未知）。两者均先通过同账户官方 REST 读回，再按实际 body hash 决定是否需要写入；没有盲重试未知写入。具体 #229 是否已生效见 readback.json 的 alreadyAppliedRecoveredByRead。

- PASS：当前 README/AGENTS/spec/本目录入口/总索引的本地 Markdown 链接均存在。
- PASS：全部 52 份 after hash 与 mapping 一致；对应 manifest 开放任务的工程归属与映射一致。
- 后续 GitHub REST #244、#247 预读也出现 EOF（均在写入前），同账户只读请求有界重试；写入请求不自动重试。

后续必要回归：新增一项真实迁移正文/新勾选与追加证据/未知 scope 漂移的行为测试；原全验收断言允许已有 [x]，没有删除条款。初次测试暴露 legacy fixture 缺迁移文件和已勾选断言，修正 fixture 为明确 legacy、保留完成项后 47/47 PASS。

最后 priority 差异 #225 的 POST 出现 EOF，续跑先读当前标签再仅补缺失操作，最终 7/7 priority 差异读回；status/phase/team/assignee 和正文未改。最终全开放票完整性以 final-readback.json 为准。
