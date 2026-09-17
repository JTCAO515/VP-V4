# VPJ-02 final acceptance mapping — 2026-09-17

Technical acceptance: **3/3 criteria satisfied**. The user explicitly requested completion, then
merge of PR440 after required checks, then closure of Issue189. GitHub owns the actual merge/closure
state. This record does not change the Issue definition or release any broader product capability.

The definition was rechecked against live#189 and latest main`ffcd194`'s `issue-plan.json` after the
separate Issue audit#442. All three original criteria below are unchanged. The manifest's `planned`
status and unchecked generated execution row are definition snapshots, not live execution state.

| Exact criterion | Actual evidence | Conclusion |
| --- | --- | --- |
| 确认目标确为无真实用户的现有 Staging，记录24条迁移实际状态和差异，不重建历史。 | User-designated VP - V4 Singapore test environment; fresh [closure inventory](closure-inventory.json) confirms correct active project, historical24 version/name matches, current50/61 with11 pending and no drift/remote-only. Existing7 Auth/3 Trip are preserved test-environment records, not an empty-database claim. No applied migration changed. | PASS |
| 真实 owner/other-user/anon 三类读取与写入验证；正常数据库、pooler、worker路径分别记录。 | [Real password-login/JWT matrix](matrix-run1.json):29/29, both owners create/read, reciprocal reads hidden, forged ownership and anon writes rejected, direct PATCH denied for all three. Exact fixture cleanup and [repeat cleanup](cleanup-repeat.json) preserve original row digests. [Direct database port via existing proxy](connections-direct-proxy-sql.json) and [Session/Transaction poolers](connections-operator-attempt4.json) each pass real SQL/TLS/identity checks. [Existing HTTP worker](worker-idle.json):11/11 real scoped empty-poll checks, anon denied, service credential admitted, no queue/policy/budget/original changes. | PASS for the specified identity and separately recorded connection paths |
| 输出脱敏配置结果与可执行下一步；失败不伪装通过，不创建Production。 | Sanitized JSON and [step-by-step runbook](../../../docs/runbooks/vpj-02-current-staging-verification.md); original hostname-route TLS failure and both failed password attempts retained. Direct success explicitly uses the existing-proxy IPv6 route. No production/database configuration, role, migration, password reset, VPN setting or paid IPv4 change. | PASS |

## Correction of earlier over-broad blockers

Earlier progress entries kept#189 open because complete worker task/provider processing and a legacy
SQL SystemDataAdapter were unverified. That was an overly broad interpretation of this ticket.
Independent review of the actual criteria confirms it is not a requirement to implement a new
adapter or execute a paid model task to record the current worker's connection path.

- **VPJ-07#195** explicitly owns durable input→worker→provider→answer→native and task isolation,
  lease expiry/crash/duplicate/cancel/terminal behavior. It remainsOPEN; its acceptance is not changed
  by#189 completion. The real empty poll does not stand in for those tests.
- **ADR-0016** requires driver prepared-statement conformance when the first concrete SQL
  SystemDataAdapter is introduced. It does not require#189 to introduce that adapter. Current HTTP
  worker evidence is not mislabeled as SQL adapter execution.
- Unproxied IPv6 remains unobserved. The accepted observed direct-port route uses the existing
  proxy, retains hostname/CA verification, and leaves the original route's failure visible.
- The11 newer pending migrations remain with their owning work. This ticket records their diff;
  it does not apply or accept those changes. Historical24 have already been applied and matched.
- Full CI's environment-dependent skipped suites remain incomplete in their own scopes. Scoped
  executable checks and this ticket's real target observations are not skipped.

No clause was deleted, weakened or moved out of#189. The broader items were already assigned in the
unchanged program definition; this correction removes an assistant-added blocker, not a real
acceptance requirement. Historical progress/FAIL/UNRUN records remain intact below the current entry.

## Review and final checks

Independent auth/data-integrity reviews cleared recovery, credential handling, relay TLS and the
bounded worker call before use; a separate final acceptance review mapped all three unchanged
criteria to the above evidence. Fresh closure inventory still observes50 migrations/7 Auth/3 Trips.
Docs and diff checks apply to this final documentation-only update. The PR's required checks must
pass for the final head before merge; their actual run and resulting merge/closure are recorded on
PR440/Issue189. Existing product/S1 parent tickets are not closed by this action.

Premerge protection: authenticated Vercel settings still skip builds when environment=production
and Git ref=main; see [read-only receipt](production-premerge.json). The current production target
was observed live, not assumed from the older db5fb7b snapshot. No settings/aliases were changed.
