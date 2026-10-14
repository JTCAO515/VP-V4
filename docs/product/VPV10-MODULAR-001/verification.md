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

## 最终收口

- PASS：全分页最终读回 52/52 正文精确匹配、priority 一致、开放集合未变；7 个必要 priority 差异已同步，其它标签/标题/assignee 保留。见 final-readback.json 与 priority-readback.json。
- 扩展读取受影响导出使用者发现 vpj-lifecycle 的执行 header 同步断言 FAIL；将当前导航纳入唯一导出 header，保留原断言，修复后相关六文件合计 62/62 PASS（vpj-plan、vpj-body-progress、vpj-sequence、handoff-documents、vpj-lifecycle、issue-refresh）。
- PASS：最终 docs:check、diff 检查；lint 和隔离 render 同源相关证据仍有效。修改只涉及获准文档、生成器与必要治理回归。
- 源提交由唯一 Main 审阅整合。本专项未 push、未创建 PR、未触发 Vercel 发布；远端 Issue 的分支文档链接在 Main 发布审阅分支前尚不可访问，本地 before/after/readback 和 commit 是当前可核证据。
- 第一阶段方向、全部开放正文与 priority、当前入口、生成保留和部署只读计划已交付；运行层三工程物理拆分/独立 HTTP 尚未实现，样例前沿与真实 QA 验收保持分开。原目标数据库、provider、浏览器与设备验收仍 UNRUN。

## Review branch publication follow-up (2026-10-14)

Main explicitly authorized publication of the stable own branch. Commit 57386e1c was pushed to codex/vpv4-modular-entries-20261014. GitHub Contents API readback confirmed the contract blob c9bb96b95c275b57bd3f6acf4c7d4fb9351b299c and before.json blob 0bcba8f38ed04cef31fa8d1156d1213e3e6de5e0 match local contents. The earlier unpushed-link limitation is now resolved; these remain review-branch links, not main publication.

The requested immutable f5d4ced46d1836d5178054c2faeb096ec3bf934a was merged without conflicts as e9a37e63588c3d2b3b910130617007ebec3e8fd5. Only the two specified hosted-worker test/evidence files were introduced. No reset, cherry-pick duplication, Main-branch write or self-merge occurred. Post-merge docs:check and diff checks passed; unchanged 62-test governance evidence is reused. No new product runtime or deployment acceptance is claimed.
