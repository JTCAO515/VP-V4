# Context

Generated from docs/handoff.json; active architecture/scope is ADR-0023.

最新Program：[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187)。

目标：交付中英原生iOS的一站式陪伴Journey Agent，全程Trip、知识、现场能力、IAP、运营、用户交付和可维护系统；以VPJ-00#187统筹。

状态：Native identity PR298 and accepted physical-operation evidence PR300 are merged. The local Web/iOS same-Trip consumer is implemented and verified through real Auth/HTTP/RLS, proposal confirmation, immutable reload and data-preserving migration28. Remote/customer activation and full product/Harness acceptance remain separate.

阶段：Deliver the exact reviewed local Trip result, then resolve the remaining hard-lock behavior and policy/runtime gates before extending the real Ask chain.

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

- Production/customer and complete native/Harness acceptance remain unrun. Scoped Staging and actual C0 model protocol/worker behavior are verified; supplier billing, semantic quality and real user data consumers remain separate.
- Physical VoiceOver, signed Store and selected-object Ask sheet acceptance under #198/#233/#242 remain unrun. PR278 merged the source with iOS26.5 all15 tests pass; iOS17.5 ran and failed4 UI audits. Full maximum-size contrast diagnostic also remains FAIL; these are not waived.
- VPJ-66 offline preparation is merged and accepted; ten remaining fixture cases and all12 Staging cases, provider pairing, real Trip/worker/fault/rollback acceptance remain NOT_RUN under VPJ-67..71. Offline preparation does not establish Harness runtime acceptance.
- VPJ-05 hard-lock behavior is not yet frozen or implemented; external order status stays unknown. Native27/Trip28 have not been applied to Staging; local reciprocal consumers do not close#192 or grant real-user processing permission.

## 验证

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

## 下一动作与回滚

按准确HEAD审阅与必需CI交付本机同一Trip消费者；随后依据用户对硬锁边界的选择补足#192，不把unknown占位当验收。#191已合并本机身份链，Staging仍26；native27/Trip28只在隔离本机验证，新的远端迁移/启用需对应授权。C2留存/删除/人工访问及预算选择继续按#190/#194/#195；保留现有C0费用hold，不重复调用供应商。依赖顺序不变，继续#195→#206→Harness67的真实门。

For the local consumer, disable its opt-in or revert its code while keeping a database-compatible default client. Preserve append-only snapshots, receipts and all applied migrations; never revive revoked user data or bypass confirmation proof. Remote rollout/rollback requires the named environment gate.

Technical release acceptance in VPJ-45 and commercial lifecycle evidence in VPJ-47 are distinct terminal conditions.

历史：[docs/archive/2026-09-10/handoff-before-astra-docs.json](docs/archive/2026-09-10/handoff-before-astra-docs.json), [docs/archive/2026-09-05/baseline/handoff.json](docs/archive/2026-09-05/baseline/handoff.json), [docs/archive/2026-09-05/baseline/CONTEXT.md](docs/archive/2026-09-05/baseline/CONTEXT.md), [docs/archive/2026-09-05/baseline/HANDOFF.md](docs/archive/2026-09-05/baseline/HANDOFF.md), [docs/archive/2026-09-05/baseline/issue-execution-contract.md](docs/archive/2026-09-05/baseline/issue-execution-contract.md)。
