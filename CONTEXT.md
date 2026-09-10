# Context

Generated from docs/handoff.json; active architecture/scope is ADR-0023.

最新Program：[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187)。

目标：交付中英原生iOS的一站式陪伴Journey Agent，全程Trip、知识、现场能力、IAP、运营、用户交付和可维护系统；以VPJ-00#187统筹。

状态：PR301 is merged as28a2d44: local Web/iOS same-Trip consumers and the corrected full Simulator CI pipeline are delivered. PR302 retains the bounded iOS17 CJK diagnostic evidence without changing original failures. Remote/customer activation and complete product/Harness acceptance remain separate.

阶段：VPJ-07 local durable text backend verified: consent/input → worker/budget/controlled HTTP → final answer/read. Finish exact-HEAD review and CI; real recipient, deployment and native answer acceptance remain gated.

## 读取顺序

- [docs/agents/development-workflow.md](docs/agents/development-workflow.md)
- [docs/program/2026-09-05/README.md](docs/program/2026-09-05/README.md)

## 当前决定

- One VP identity, same Trip, full journey; native iOS complete and Web lightweight same-Trip edit/confirm.
- Current release zh/en; existing es/ru/ar wire/UI assets remain legacy-compatible until VPJ-01 migration.
- Hotel L1a accommodation fit + verified L1b handoff; no inventory/payment/fulfillment.
- Free + non-renewing 30-day Journey Pass experiment; $19.99 reference, $14.99 alternative; actual StoreKit terms and cost checked before sale.
- Keep valid Trip/RLS/migration/knowledge/privacy safety contracts; archived code not production input.
- 2026-09-10 brand Q36/Q37 confirmed directions: Free and Pass share explicitly saved basic cross-Trip preferences; a bounded service goal includes necessary clarification and system repair. Storage/consumer and billing semantics require versioned implementation; new capacity, partial/amendment/TTL and Q38 activation remain undecided.
- VP response policy: English-first natural wording with equivalent Chinese facts, useful outcomes and next steps; tone never grants action/data permission or overrides evidence and confirmation.
- 2026-09-10 HF reuse planning: preserve TS Harness and existing product contracts; add two bounded preparation Issues and ten append-only acceptance supplements. No default new Agent framework, vector database, HF hosting, training, data recipient or model purchase; real integrations keep their gates.
- 已有同对象、环境、范围的授权继续有效；共享交接记录不扩展到新的环境、数据接收方、资金或生产动作。具体未决操作查对应Issue与operator-actions，不重复索取已明确授予的授权。

## 未决与运行证据

- Staging26 and the scoped ordinary JWT/budget checks are verified; direct-host database connection and a deployed worker identity/path remain incomplete.
- VPJ-41 real same-Trip dependencies remain open; this explicitly authorized fixture migration is not their completion.
- Actual data retention, model/media regions, maps/hotel contracts, Apple signing/store product and Production actions remain owned by corresponding operator Issues.
- Current remote rollout: Staging migration metadata freshly confirms26. Vercel management access returns403; public Preview auth bundle matches Staging but server-only/Production bindings are not established.27/28 require coordinated v2 callers and a scoped new authorization; disabling v2 after DB28 is not a compatible rollback.

- Production/customer and complete native/Harness acceptance remain unrun. Scoped Staging and actual C0 model protocol/worker behavior are verified; supplier billing, semantic quality and real user data consumers remain separate.
- Physical VoiceOver, signed Store and selected-object Ask sheet acceptance under #198/#233/#242 remain unrun. PR278 merged the source with iOS26.5 all15 tests pass; iOS17.5 ran and failed4 UI audits. Full maximum-size contrast diagnostic also remains FAIL; these are not waived.
- VPJ-66 offline preparation is merged and accepted; ten remaining fixture cases and all12 Staging cases, provider pairing, real Trip/worker/fault/rollback acceptance remain NOT_RUN under VPJ-67..71. Offline preparation does not establish Harness runtime acceptance.
- VPJ-05 hard-lock protection is explicitly deferred by JT on 2026-09-11; the compatible DTO and external order status remain unknown. Native27/Trip28 have not been applied to Staging; local reciprocal consumers do not close#192 or grant real-user processing permission.

## 验证

- Delivery: PR301/28a2d44 exactHEADafa83a5 independent review0/0; Native34471256512, Quality34471256572, Budget34471256522 and Vercel passed, merged tree matched and post-merge docs passed. Simulator CI now uses complete ad-hoc test signing plus an owned fresh device and explicit boot readiness; assertions/audit types are unchanged. Local full runner21pass/0fail/8API-environment skips; separate real API evidence remains underVPJ-05. Initial Keychain, audit-service, launch and destination-format failures remain recorded.
- Foundation evidence: PR302/8175e39 exactHEAD5459c01 review0/0 and Quality/Vercel passed. iOS17 CJK comparison hadproduction2FAIL/SwiftUI2FAIL/UIKit2PASS; element captures showed complete text, with duplicated full-screen capture limitations disclosed. No production UI was changed or original audit failure waived.
- VPJ-05 local same-Trip: real Swift/API persistence, reciprocal Web/iOS Trip IDs, bilingual normal/maximum UI and desktop/390px browser checks passed. Unit92/contract199/evals25/security99/E2E40 and build/static22 passed. Both local identity/Trip integration opt-ins ran:31pass/0fail/10budget-environment skips, aggregate INCOMPLETE. A fixed-sleep identity observation failed first; a controlled backend-PID lock barrier corrected the test and passed. Real27→28 data-preserving upgrade passed. See artifacts/VPJ-05/verification.md; hard locks/external orders and remote/full product acceptance remain unknown/unrun.
- Physical operation: PR300 merged9fb6a64 after exact f447114 independent review0/0, Quality34429015894 and Vercel. User accepted the observed iPhone17/iOS26.6.2 QA operation;9 device navigation/state contracts passed. Original Apps preserved. VoiceOver, system-setting changes and physical Trip consumer tests were not run. See artifacts/VPJ-01/physical-20260910/verification.md.
- VPJ-04 local session v2: two iOS26.5 Simulators passed6 actual identity tests with0skip; natural signed-token expiry/refresh, account-lock race, revoked definer replay, ordinary owner/other and Web Cookie/Origin passed. Fresh disposable26→27 and all15 guarded function bodies were independently verified. Unit92/contract195/security96/E2E40 pass; aggregate integration29pass/11skip remains INCOMPLETE. See artifacts/VPJ-04/local-session/verification.md, including the retained legacy-target incident and startup failures.
- Native badge: PR297 merged1b6ca49 after exact-HEAD review and Native/Quality CI. Real ordinary/system-maximum bilingual pixels and screenshots passed on iOS17.5/26.5; remaining four audits/full maximum contrast FAIL and physical VoiceOver UNRUN are preserved.
- HF preparation: #288 completed via PR293/cfde140 with fixed-config REJECT,26 actual offline conversions/8 guards/11 Python checks and independent metric reproduction. VPJ-72 complete CLI+fixture feedback output passed with0human records; two row-lineage/state-size findings fixed and independently verified. See artifacts/VPJ-72/verification.md and artifacts/VPJ-73/verification.md; neither establishes real user/provider semantic calibration.
- 2026-09-10 actual C0:27/27 protocol matrix samples,6/6 client timeout/cancel checks and two extra real DeepSeek worker duplicate/crash calls passed. Total38 transport invocations/30 usage receipts; highest-tariff budget debit0.035014CNY,8 unknown-cost requests retain28.9CNY. Actual billed amount and semantic/human quality unverified. GLM400/1210 fixed by retaining native default thinking;21 protocol/security checks and units45/contracts189/evals24 pass locally. See artifacts/VPJ-06/live-c0-20260910.
- Planning evidence: brand/ServiceTask/response alignment PR286 and HF plan PR289 merged; current manifest has73 tasks/212 native edges. These are planning/delivery facts, not runtime acceptance. See docs/research/brand-engineering-2026-09-10/DELIVERY.md and docs/harness/hf-reuse/DELIVERY.md.
- Staging evidence: PR281 records authorized11→25 migration, restored encrypted backup, ordinary JWT16/16 and exact-ID cleanup preserving existing data. Direct-host/worker acceptance is separate; read the latest #189/PR evidence before action.
- Budget evidence: PR284 merged durable reservation/dispatch and local concurrency tests; PR290 records authorized Staging25→26, ordinary-account/HTTP/synthetic-budget40/40, backup restore and exact cleanup. Actual paid provider, direct-host and deployed-worker acceptance remain separate. See artifacts/VPJ-59/staging-20260910.md and #194.
- Native evidence: PR278 passed its scoped CI and iOS26.5 tests; four iOS17.5 UI audits and physical VoiceOver remain incomplete. Authenticated selected-Trip Ask/confirm/reload belongs to #198/#233/#242, not a reverse gate on #188.
- Identity/provider preparation: PR279 native JWT seam and PR275 provider protocol adapters passed their scoped tests. Local mobile authority is now verified in the scoped v2 consumer; deployed identity, actual provider/worker consumers and related runtime acceptance remain separate.
- Harness evidence: #263 completed its offline scope under PR271; PR277 added offline pairing preparation. Actual provider pairing, human calibration and twelve required Staging cases remain under the open integration Issues.
- Brand asset evidence: PR274 integrated the supplied logo/wordmark on web and native surfaces. Current rights remain in docs/licenses/asset-rights-ledger.json; this does not establish Store or full accessibility acceptance.
- VPJ-07 preparation: real PostgreSQL10/10 with29 application migrations and old-record preservation, browser9, signed native21/0fail/8explicit API-environment skips; see artifacts/VPJ-07/verification.md. No provider/input/native-answer acceptance; #195 remains open.
- VPJ-07 text backend:30 real SQL migrations,22/22 lease/text/controlled HTTP and deletion/withdrawal barriers pass; private C2 authority has no active policy rows. See artifacts/VPJ-07/text-backend-verification.md. No real user/provider or native answer acceptance; #195 remains open.

## 下一动作与回滚

JT已明确团队成员对全部功能/数据的跨用户CRUD长期权限、正文长期及删除后保留方向、模型字段不设额外限制、测试每日预算不限且不等待账单；见docs/policy/vpj-03-text-decisions.md的VPJ03-JT-20260911-v1。首版暂不做硬锁，不再索取硬锁选择或星号含义。下一步落实受控团队身份、服务端权限与审计、留存/删除真实语义和用户告知，并核实provider地区/接收方资格；决定不等于运行开启。Staging仍以已验26为基线，27/28须盘点兼容调用端及另行授权；Vercel管理访问和远端身份/worker仍待核实。保留unknown费用、确认/RLS/删除不变量及未验专项；#190/#191/#192和Harness父票继续开放。

For the local consumer, disable its opt-in or revert its code while keeping a database-compatible default client. Preserve append-only snapshots, receipts and all applied migrations; never revive revoked user data or bypass confirmation proof. Remote rollout/rollback requires the named environment gate.

Technical release acceptance in VPJ-45 and commercial lifecycle evidence in VPJ-47 are distinct terminal conditions.

历史：[docs/archive/2026-09-10/handoff-before-astra-docs.json](docs/archive/2026-09-10/handoff-before-astra-docs.json), [docs/archive/2026-09-05/baseline/handoff.json](docs/archive/2026-09-05/baseline/handoff.json), [docs/archive/2026-09-05/baseline/CONTEXT.md](docs/archive/2026-09-05/baseline/CONTEXT.md), [docs/archive/2026-09-05/baseline/HANDOFF.md](docs/archive/2026-09-05/baseline/HANDOFF.md), [docs/archive/2026-09-05/baseline/issue-execution-contract.md](docs/archive/2026-09-05/baseline/issue-execution-contract.md)。
