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

## PR687 first-phase repair

Main returned a P2: a remote unchecked item could inherit a checked snapshot during sync. The repair refuses such preflight, including fallback templates and duplicate checked text; it never restores completion automatically. New completion and appended evidence remain supported. A meaningful regression covers #195 uncheck, fallback and duplicate cases. No live #195 mutation was made.

Current navigation now prioritizes boundaries/current Issue; root CONTEXT/HANDOFF bytes remain historical and unchanged. Shared business/data authority, horizontal Harness/CI and the three release channels are explicit. #681 has a bounded future synthetic-only /qa/demo work unit with keyboard/reset/no-data-network/no-key criteria, retaining all real QA acceptance. Fifteen shared Issues have category/lead/affectedConsumers; #212 names iOS lead and iOS/Web cooperation without changing original AC or source owner. #243 retains its unmet Production obligations.

Affected governance: 58/58 PASS; docs:check, lint and diff checks PASS. Original manifest semantics excluding modular attribution remain unchanged. Only 17 scoped Issue bodies are updated; repair-before.json/repair-readback.json hold the delta evidence. Earlier 52-ticket readback remains historical evidence. GitHub #226 PATCH returned EOF twice; each continuation GET confirmed the old body before another write, then the same-account gh body-file transport was used. No unknown outcome was blindly replayed.

Repair closeout: 17/17 scoped bodies exactly read back; titles, labels and assignees unchanged. #681 also encountered a GraphQL EOF and was resolved by read-before-write continuation. Pure no-op preflight for all 40 migrated manifest tasks passed, without remote writes. Untouched 35 Issue bodies and original 52-ticket snapshots were not rewritten.

## Current three-project replan (latest JT correction)

The original 52 Issues are migration inputs, not a fixed final task count. current-plan.json defines 22 AGENT, 10 IOS and 3 WEB tasks plus the retained Program #187. Sixteen old slices/continuous-acceptance tasks have unique successors; closing them is planning migration with not_planned, never functional completion. Original before.json, replan-before.json, comments and valid implementation evidence remain preserved.

First three current titles/bodies/project labels were actually published and independently read back on 2026-10-14 at 06:00:58Z/06:01:01Z/06:01:04Z. Current publication and subsequent corrections are logged in current-publish-readback.json/current-publish-revisions.jsonl. Main separately verified the initial three via official tools. Stable 803861d8 was pushed early so current-plan/replan-before links exist.

QA873/PR688 was merged into this own branch without conflicts as an accepted dependency; no source implementation was authored by this planner. QaAgentWorkspace/api/pending-identity and TripCanvas/ChatThreadWorkspace were actually inspected. PR684 is merged, PR686 remains open at QA873, PR599 and PR677 are merged; source/retained tests are distinguished from target UNRUN and sample-only acceptance.

Current project labels were created under explicit authorization. Old phase/team labels are removed from active cards because they describe superseded technical stages and lightweight-Web ownership; exact old labels remain in replan-before.json. Non-conflicting labels and assignees are retained. Native dependencies were read for all 52 inputs; only #248 blocked-by #360→#206 and #251 #247→#246 were remapped to surviving tasks, using documented GitHub issue-dependencies operations. Other native edges remain preserved; acceptance-only inputs stay normal body links.

Current renderer owns current bodies/overview/index/manifest. Legacy publish/sync-bodies/sync-selected/close-old are refused before GitHub access while current-plan.json exists; render routes to the current renderer. The 83-task/20-replacement legacy definitions and handoff remain historical. New tests cover migration coverage, duplicate IDs, dependency cycles, current sample-vs-real wording and legacy mutation refusal. Related governance 60/60 PASS; docs/lint/diff/artifact checks PASS. No provider/DB/keys/restore/ECS/Vercel/resource actions, new implementation, future client or sub-agent dispatch occurred.

Final current-plan audit: 36 current open entries (22 AGENT + 10 IOS + 3 WEB + retained Program), 16 old planning-only not_planned successors; all 52 inputs accounted for exactly once. Every current title/body/project/work/priority classification and native dependency was independently re-read in current-final-audit.json. Global open Issue listing also returned 36. Re-running render-current produced no tracked diff. Old source snapshots, closed history outside this migration and original CONTEXT/HANDOFF bytes remained unchanged.

## Merged-stage wording repair

Limited follow-up changed only current tasks #264/#249/#206/#246. Harness H1-H5 and flight F1-F2 now have internal inputs instead of superseded-ticket external/self dependencies. Knowledge K1/K2 and customer C1/C2 have unified task completion boundaries; an individual inherited slice no longer closes the merged task. Original technical criteria counts, checked states, real/fixture boundaries, activation gates and external/native dependencies remain unchanged. Old bodies are retained in merged-stage-repair-before.json; all four published bodies were exactly re-read in merged-stage-repair-readback.json.

Relevant vpj-plan tests 12/12 PASS, including rejection of an external self-dependency; docs:check and diff checks PASS. Other merged groups were inspected for the same closure/self-dependency pattern with no additional rewrite. No product/data operations or wider matrix were run.

## iOS-first priority correction

JT 2026-10-14 06:17Z priority is recorded in current-plan, Program and README: IOS-001/003/005 are active P0 frontend lanes under the exact owners already assigned by Main; Agent/Web support only required iOS dependencies and necessary safety closure. B1/B2 grouping is not a serial QA-before-iOS gate. Four scoped bodies/three active labels were published and read back; see ios-priority-before.json and ios-priority-readback.json. Task count/IDs, all original mappings, AC/check states, actual/native dependencies and activation gates are unchanged. Relevant plan tests 12/12, docs and diff PASS. No dispatch, iOS implementation or resource actions were performed here.

## Approved Muse full-frontend coverage

Latest unique HANDOFF and DEVELOPEMENT-RULES were read; own branch clean at c2ac2be4, existing JTCAO515 credentials/API worked. PR690/e4b23cda and PR691/77ab3209 were independently read OPEN, not merged; IOS001 dirty/candidate/r1 FAIL/r2 build evidence remains Main-reported and preserved. Original complete AC/dependencies for all35 tasks and original52 mapping are unchanged. Only approved frontend scope was added to IOS001/003/005 plus new IOS011 #692 (LibraryMemory) and IOS012 #693 (Assistant details), linked to the two existing Main-assigned owner chats/base de0ce108; no thread was created or UI source edited here. Main owns shared shell/navigation/PBX/Conversation and frontend memory/object IDs. Six related bodies and five P0/in-progress frontend cards were published and read back in muse-coverage-readback.json.

The exact approved HTML libraryId libfile_cfee5ae80ee08191847a4d8fafce1d04 / fileId file_00000000d02c81f8afa0f952e74f1e56 and filename are recorded in current-plan. No library_read/prepare_materialize tool was exposed in this tool inventory; the cloud /workspace/shared namespace is not a verified Mac path. No download/API/private-directory guessing or extra research occurred. Page scope proceeds; extra visual-detail verification remains unavailable. Related plan tests12/12, docs:check and diff PASS. No backend/data/provider/production/fees or resource operations were performed.

## PR696 appended-evidence verification repair

Fixed the exact9f75 Spec P2: current remote verification now checks a strict generated canonical prefix (only public checkbox state normalization) and a newline boundary, allowing an opaque appended evidence tail. The same splitter is reused by progress-preserving regeneration; existing uncheck-restoration refusal remains. Positive/negative contracts cover uppercase checked markers, FAIL/UNRUN and fenced evidence retention, prefix/title drift and same-paragraph injection. Related governance62/62, docs/lint/diff PASS; render-current produced no generated-content delta. No live Issue bodies or UI/data sources were changed. Previous16CI+2statuses apply only to old9f75; this new head requires Main delta review and CI.

## IOS-CHAT-MUSE-20261014 planning increment

Read the new unique HANDOFF and confirmed PR696 normal QA merge5fcff20d at09:51:08Z via GitHub. Added only the accepted10:01Z chat-visual increment to IOS001/#203 and Program#187: three actual writer scopes, Main-only state/Root/PBX/assets, retained full frontend and frozen PR697/945a, and explicit incremental acceptance. Official IMG_4852/IMG_5369 byte sizes and SHA256 were read-only verified against the formal handoff; source asset access is resolved, no re-upload request. Both Issue bodies were exactly read back in chat-muse-readback.json. Original37 task identities, AC/dependencies/52 mapping and unrelated bodies remain unchanged. Plan tests12/12, docs/diff PASS; no UI/runtime/image mutation, Main HANDOFF edit, DB or resource action. Commit is for Main to integrate into codex/ios-chat-muse-main-20261014; this owner did not change that checkout or oldPR697.
