# Context

Generated from docs/handoff.json; active architecture/scope is ADR-0023.

最新Program：[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187)。

目标：交付中英原生iOS的一站式陪伴Journey Agent，全程Trip、知识、现场能力、IAP、运营、用户交付和可维护系统；以VPJ-00#187统筹。

状态：Staging backup and explicit verified Session pooler are ready. Original13 validation exposed RPC defects; appended repair is locally verified at25 migrations with29 integration/82 security tests,zero skips. Remote remains11; additional repair execution authority pending, original backup/13/two-identity grant retained. Harness planning merged via PR269; six implementation Issues are VPJ-66..71 (#263..268), with runtime acceptance unstarted.

阶段：Validated repository RPC repair and real affected-schema backup/restore preparation; no remote migration or new Auth identities yet.

## 读取顺序

- [docs/agents/development-workflow.md](docs/agents/development-workflow.md)
- [docs/program/2026-09-05/README.md](docs/program/2026-09-05/README.md)

## 当前决定

- One VP identity, same Trip, full journey; native iOS complete and Web lightweight same-Trip edit/confirm.
- Current release zh/en; existing es/ru/ar wire/UI assets remain legacy-compatible until VPJ-01 migration.
- Hotel L1a accommodation fit + verified L1b handoff; no inventory/payment/fulfillment.
- Free + non-renewing 30-day Journey Pass experiment; $19.99 reference, $14.99 alternative; actual StoreKit terms and cost checked before sale.
- Keep valid Trip/RLS/migration/knowledge/privacy safety contracts; archived code not production input.
- 2026-09-09 JT explicitly allows production publishing and merge-triggered Vercel deployments for VP-V4 in this continuing session. Production database migrations, new data/recipient permissions, purchases, legal/material rights and branch-protection bypass remain outside that grant.
- 2026-09-09 current planning request authorizes optimizing Harness, publishing six incremental Issues and integrating the planning into main. This grants no new provider/data/account/production database or payment authority.

## 未决与运行证据

- One appended RPC repair beyond the authorized13 is now needed; its remote execution remains pending explicit scope approval. Original13 alone failed real local runtime validation.
- VPJ-41 real same-Trip dependencies remain open; this explicitly authorized fixture migration is not their completion.
- Actual data retention, model/media regions, maps/hotel contracts, Apple signing/store product and Production actions remain owned by corresponding operator Issues.

- Real account/Trip/DB/provider/customer acceptance not executed by this session; Web publication does not establish those capabilities.
- Physical VoiceOver spoken traversal, full contrast/hit-region audit, iOS17 runtime and signed Store delivery remain unrun. Simulator structural AX is not full device/release acceptance.
- Harness implementation,12-case runtime coverage, provider pairing, real Trip/worker/fault/rollback acceptance remain UNRUN under VPJ-66..71; this planning delivery is not capability acceptance.

## 验证

- 2026-09-09: final frozen11->24->25 local replay preserves synthetic Trip; integration29/29,security82/82,zero skip,DB lint0. Encrypted actual Staging backup restored with3Auth/2Trip/11history and equal hashes in a no-network container; original13+repair SQL also replayed on that restored copy preserving original data. No remote apply.
- 2026-09-09 CLI metadata confirms VP - V4/ap-southeast-1/ACTIVE_HEALTHY. Read-only inventory finds11 matching migration records of24,13 pending,no remote-only;3Auth/2Trip;11 observed tables RLS enabled; authenticated direct Trip UPDATE still granted at old schema. No identities/content read and no data/DDL changed.
- PR261 merged atde18928: hosted Native iOS34298939281 passed unsigned build,8unit+5UI and retained xcresult/version/commands. Production deployment6340704045 reported success forde18928.
- Production deployment6340395476 reports success for2c46519. Actual browser at1280x800: /visepanda?locale=ar has ar/rtl, correct Arabic title and no overflow; switching toEnglish at390x844 restores en/ltr, removes legacy picker discovery and shows the unauthenticated sign-in boundary. No account/Trip write performed.
- 2026-09-09: PR258 de20309 Quality PR34259128731 passed; merged6ccddeb. PR259 updated to11f2e7b against6ccddeb, independent review Critical0/Important0 and Quality PR34297787500 passed; merged2c46519.
- PR258 Production deployment6340328611 reported success for6ccddeb; browser loaded the Journey homepage with explicit preview labels. Final Production for2c46519 is verified separately.
- 2026-09-09: native8 unit tests and5 UI paths passed across full run plus affected Chinese keyboard/locale rerun. Simulator iPhone17Pro iOS26.5, Xcode26.6. Actual bugs fixed: localization keys, stale navigation titles, AX tool text, keyboard dismissal. Four screenshots and command evidence in artifacts/VPJ-01.
- PR259 HEAD633778b: lint/typecheck/build,22 standard,36 unit,161 contract,40 source-e2e and desktop/mobile/legacy browser checks passed; remote Quality PR34258367074 and Vercel Preview passed. Independent review: Critical0/Important0.
- PR258 source b11cdd6 against main51879c3 independently reviewed: Critical0/Important0; final evidence-only commit still receives fresh CI. Earlier PR258 CI on f15f0ad passed, not reused as final-head CI.
- 2026-09-08 Journey preview: lint/typecheck/build, 22 standard tests, asset policy and docs gate passed; 4 new Playwright browser regressions passed at 1280x800 and 390x844. They verify no API calls, confirmation-before-note, per-page state, reject-preserving accept-all, locale/reload, Explore proposal and one-time tool requests. Independent read-only review findings fixed and rechecked. Full repository CI is a separate merge gate.
- Remote read-back 2026-09-05: 65 new open tasks, each body/ID/parent and all 198 native dependencies match; 20 old Issues closed with not_planned; PR185/186 remain open.
- pnpm check passed: lint/typecheck/build plus 22 standard tests; unit29, contract161, source-e2e40 and eval20 passed.
- Integration19 pass/9 skip; security80 pass/1 skip. Real local Supabase/RLS unavailable, outcomes incomplete, not release success.
- DAG/missing-dependency tests, 41 archive hashes, docs/JSON/local links and git diff against origin/main passed. Archive whitespace/line endings retained only in hash-checked archive scope.
- 1280x800 and 390x844 current-page smoke: no horizontal overflow or console errors/warnings. Existing cross-route locale reset is assigned to VPJ-01/41.
- PR253 CI at commit06bab2f passed; subsequent documentation-only handoff commits receive fresh CI and must be inspected before merge.
- 2026-09-08 governance read-back at main 1bd1ffb: PR253/254 merged; all 65 VPJ tasks still status:blocked; VPJ-01 #188 and VPJ-62 #202 have no native blockers. These are readiness review candidates, not verified implementation-ready tasks.
- 2026-09-09 Harness planning: VPJ-66..71 published as #263..268; exact remote read-back passed for new bodies/12 native dependencies/parent/labels. Original65 rows/bodies/labels/states and198 dependencies preserved; Program187 now has71 children with unchanged body/state. Local plan/archive/docs checks and11 governance tests passed; independent review has no remaining required changes. See docs/harness/VERIFICATION.md; no Harness runtime execution performed.

## 下一动作与回滚

Review/merge RPC repair PR270 against current main with fresh exact-head checks; obtain scope for the single additional migration before Staging application. In parallel verify VPJ-66 #263 offline preparation contract and live dependencies; VPJ-67..71 retain runtime gates.

Revert the planning/archival PR; restore the retired Landing from exact archive; reopen old Issues and restore labels from before snapshot. Never roll back applied migrations or revive revoked user data.

Technical release acceptance in VPJ-45 and commercial lifecycle evidence in VPJ-47 are distinct terminal conditions.

历史：[docs/archive/2026-09-05/baseline/handoff.json](docs/archive/2026-09-05/baseline/handoff.json), [docs/archive/2026-09-05/baseline/CONTEXT.md](docs/archive/2026-09-05/baseline/CONTEXT.md), [docs/archive/2026-09-05/baseline/HANDOFF.md](docs/archive/2026-09-05/baseline/HANDOFF.md), [docs/archive/2026-09-05/baseline/issue-execution-contract.md](docs/archive/2026-09-05/baseline/issue-execution-contract.md)。
