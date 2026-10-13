# QAWEB-DEPLOY #683: actual disabled QA preview

Owner: deployment chat 01a13387-0e68-7300-9608-85aba0f18aba, sole writer of QA Vercel domain/config/deploy resource. Main owns integration source, target migration/policy/worker and PR #684. No parent closure or merge performed here.

## Actual deployment

- User test URL: https://qatesting.go2china.space/qa
- Deployment ID: dpl_9uyTDjXayWprQaTBrLmut6upeM7r
- Source SHA: 4e477a7f7bb05af1539bf940da204dd93df90bf3
- Branch: codex/qaw005-main-20261013
- Project/team: prj_XwsjEc8YnYNeDVAqBrcdmbJXEqA2 / team_vLT8SL2mQJJSnXbD9GzVLP4K
- Target: preview (REST target=null), READY, source=git. Existing automatic deployment reused; no duplicate manual deployment.
- Automatic preview URL: https://vp-v4-d6v0i347q-jtcao515s-projects.vercel.app (still denied by original WAF; not added to its allowlist).
- Official direct known-deployment getter confirms exact project, Git SHA/ref, and aliases qatesting plus the QA branch alias. Full allowlisted data: automatic-preview-readback.json.

MCP deployment LIST returned 403 forbidden; that operation was not retried through another identity/CLI. GitHub deployment metadata supplied the exact existing URL. Direct GET for that known deployment separately returned MCP404; its documented exact-endpoint/team official CLI fallback succeeded. These distinct results are preserved in preview-4e477a7f.json. CLI account remained jtcao515.

## Actual target checks

| Check | Result |
| --- | --- |
| Domain bound to exact non-production QA branch; actual Spaceship CNAME; valid issued certificate | PASS |
| Effective inherited public Supabase URL matches fixed Staging, public/anon key kind; exact QA Origin branch override | PASS, no values printed/persisted |
| Automatic source build/READY and exact SHA/branch/project/aliases | PASS |
| Custom-domain HTTPS root | PASS: 307 Location /qa |
| /qa signed out | PASS: 200 and actual login link, no private conversation |
| Login link navigation | PASS: /auth/sign-in?returnTo=/qa; actual email/password closed-beta form |
| Desktop and 390×844 login screen, zh/en rendering | PASS; mobile scrollWidth=390, no horizontal overflow |
| /qa?locale=en signed out and browser error log | PASS: English sign-in link; no captured console errors |
| Anonymous Sessions API with QA disabled | PASS: 503 PROVIDER_UNAVAILABLE, ack=not_submitted, private/no-store, no private data |
| Cross-Origin POST to Sessions API | PASS: 403 FORBIDDEN, ack=not_submitted, no private data/no submission |
| Successful account login, persisted test Session, original request recovery with real actor | UNRUN: safe authorized test-actor handoff and active QA policy/runtime still needed |
| Real provider and bounded why/simplify/second-option/correction/fresh-Session cases | UNRUN: target migration/new policy/consent/budget/secure worker not ready |

HTTP evidence: http-disabled-qa.json. Actual empty-field login screenshots: login-desktop.jpg and login-mobile.jpg. These are application boundary checks for the disabled preview, not full P0 question-answer acceptance. Prepared actual-provider cases are in acceptance-cases.md.

## Exact authorized WAF change

The original active Host-not-in-set deny rule omitted the new QA domain and blocked every request before the application. JT explicitly agreed to only adding qatesting.go2china.space; Main reviewed the full candidate.

- Rule: rule_vpj_02_staging_schema_maintenance_N0pDWD.
- Active version: 106 → 107.
- Only change: original 17-host array plus qatesting.go2china.space; no removed host, Preview hostname, wildcard or bypass.
- Full rule, deny action and other fields preserved; firewall remains enabled. Fresh readback strictly equals candidate.after; no unpublished draft remains.
- One CLI rules.update stage and one publish. Initial local prepublish comparison incorrectly included GET-only valid/validationErrors; corrected without another stage. No platform/auto-review rejection occurred on the authorized mutation.
- Candidate, staged change and final readback: firewall-single-host-candidate.json, firewall-staged-diff.json, firewall-single-host-readback.json.
- Rollback only within explicit operator scope: re-read the same current rule and remove only qatesting.go2china.space, preserving every other field/host and unknown concurrent changes. Never discard someone else's draft.

No DNS/domain addition was repeated, no deployment protection or application login was disabled, and QA enable/policy/context variables remain absent/default-disabled. No provider call, worker startup, secret write or target SQL operation occurred here.

## Current downstream dependencies

Main's latest real evidence supersedes the earlier Supabase permission blocker: fixed Go2China Staging read-only access recovered; only 75/155 migrations are present and QA RPCs absent. ECS actual Docker inventory is empty; hosted switch disabled with no retained workers/ready/leased work, and secure file slots are absent. Main is reviewing migration prerequisites and safe credential handoff. Its local installer candidate a21202455b09eb2b953224e840f5bb8216ab689d adds explicit QA file-mode validation; final review/CI/merge and target readiness are still required. QA uses existing host Python3 and needs no new host Node installation. No broad migration/application is inferred.

The requested sidecar preparation was stopped by Main after this real empty-host evidence. Its local unexecuted drafts are archived under stopped-sidecar/ with sidecar-candidate.md marked STOPPED. Do not use them to start a worker or introduce a new flow.

Own preparation checks: Python/Bash/Node syntax, source pin default refusal, exact WAF add-only diff/readback, git diff check, documentation baseline and artifact-growth check PASS. Linux host/image/profile/window/startup/heartbeat remain UNRUN. Source independent review and full PR CI belong to Main; a later source SHA invalidates only affected target evidence.
