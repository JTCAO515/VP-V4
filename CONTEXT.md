# Context

Generated from docs/handoff.json; active architecture/scope is ADR-0023.

最新Program：[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187)。

目标：交付中英原生iOS的一站式陪伴Journey Agent，全程Trip、知识、现场能力、IAP、运营、用户交付和可维护系统；以VPJ-00#187统筹。

状态：VPJ-00 #187 baseline PR #253 merged at 9a3b724; Journey preview PR #254 merged on main at 1bd1ffb (2026-09-08 read-back). Governance workflow revision is prepared for review; real product/runtime gates remain unverified.

阶段：Journey visual preview and full prepared Demo migration; no backend, native or same-Trip acceptance implied. The 65-task VPJ dependency graph is unchanged.

## 读取顺序

- [docs/agents/development-workflow.md](docs/agents/development-workflow.md)
- [docs/program/2026-09-05/README.md](docs/program/2026-09-05/README.md)

## 当前决定

- One VP identity, same Trip, full journey; native iOS complete and Web lightweight same-Trip edit/confirm.
- Current release zh/en; existing es/ru/ar wire/UI assets remain legacy-compatible until VPJ-01 migration.
- Hotel L1a accommodation fit + verified L1b handoff; no inventory/payment/fulfillment.
- Free + non-renewing 30-day Journey Pass experiment; $19.99 reference, $14.99 alternative; actual StoreKit terms and cost checked before sale.
- Keep valid Trip/RLS/migration/knowledge/privacy safety contracts; archived code not production input.

## 未决与运行证据

- VPJ-41 real same-Trip dependencies remain open; this explicitly authorized fixture migration is not their completion.
- Actual data retention, model/media regions, maps/hotel contracts, Apple signing/store product and Production actions remain owned by corresponding operator Issues.

- No live customer/model/DB/provider/Store/production test or deployment in this planning task.
- Original local iOS remains preview source; copying archive does not prove native build acceptance.

## 验证

- 2026-09-08 Journey preview: lint/typecheck/build, 22 standard tests, asset policy and docs gate passed; 4 new Playwright browser regressions passed at 1280x800 and 390x844. They verify no API calls, confirmation-before-note, per-page state, reject-preserving accept-all, locale/reload, Explore proposal and one-time tool requests. Independent read-only review findings fixed and rechecked. Full repository CI is a separate merge gate.
- Remote read-back 2026-09-05: 65 new open tasks, each body/ID/parent and all 198 native dependencies match; 20 old Issues closed with not_planned; PR185/186 remain open.
- pnpm check passed: lint/typecheck/build plus 22 standard tests; unit29, contract161, source-e2e40 and eval20 passed.
- Integration19 pass/9 skip; security80 pass/1 skip. Real local Supabase/RLS unavailable, outcomes incomplete, not release success.
- DAG/missing-dependency tests, 41 archive hashes, docs/JSON/local links and git diff against origin/main passed. Archive whitespace/line endings retained only in hash-checked archive scope.
- 1280x800 and 390x844 current-page smoke: no horizontal overflow or console errors/warnings. Existing cross-route locale reset is assigned to VPJ-01/41.
- PR253 CI at commit06bab2f passed; subsequent documentation-only handoff commits receive fresh CI and must be inspected before merge.
- 2026-09-08 governance read-back at main 1bd1ffb: PR253/254 merged; all 65 VPJ tasks still status:blocked; VPJ-01 #188 and VPJ-62 #202 have no native blockers. These are readiness review candidates, not verified implementation-ready tasks.

## 下一动作与回滚

Verify Journey root-homepage PR/main and its Vercel deployment under the operator's 2026-09-09 authorization. Three generated images have explicit public-Web approval; nine legacy files remain non-public quarantine. Governance PR #256 is merged at 589cee6. Re-evaluate VPJ-01/02/03/46/62 inputs before product work; the dependency graph and VPJ-41 runtime acceptance remain unchanged.

Revert the planning/archival PR; restore the retired Landing from exact archive; reopen old Issues and restore labels from before snapshot. Never roll back applied migrations or revive revoked user data.

Technical release acceptance in VPJ-45 and commercial lifecycle evidence in VPJ-47 are distinct terminal conditions.

历史：[docs/archive/2026-09-05/baseline/handoff.json](docs/archive/2026-09-05/baseline/handoff.json), [docs/archive/2026-09-05/baseline/CONTEXT.md](docs/archive/2026-09-05/baseline/CONTEXT.md), [docs/archive/2026-09-05/baseline/HANDOFF.md](docs/archive/2026-09-05/baseline/HANDOFF.md), [docs/archive/2026-09-05/baseline/issue-execution-contract.md](docs/archive/2026-09-05/baseline/issue-execution-contract.md)。
