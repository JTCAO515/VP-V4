# VPJ-62 / #202 — research intake acceptance

Date: 2026-09-17. Base: `origin/main@7758d01`. Implementation is the accompanying PR
on `codex/vpj-62-research-intake-20260917`; independent checkout
`/Users/jtsm5p/Documents/Claude/vp-v4-intake-202`.

Observed in: a local Next.js production build, actual `@supabase/supabase-js` client,
PostgREST v16.2 and PostgreSQL 17.6.1.167. The local gateway only maps Supabase's
`/rest/v1` prefix to PostgREST; it fabricates no RPC response or database row. All emails
were synthetic `example.test` addresses. No external email, model call or production
migration occurred. Repository implementation acceptance is complete; deployment and
real participant outcomes are not claimed. Keep #202 open until the PR is merged.

## Every Issue criterion mapped to implementation and observation

| Issue acceptance | Actual code | Observation |
| --- | --- | --- |
| Bilingual scope → minimal email opt-in → receipt → exit, before full App | `app/research/page.tsx`, `research-form.tsx`; `app/api/intake/route.ts`; `lib/server/intake/{contract,http,runtime}.ts`; additive `vpj_62_research_intake` migration | PASS: English research-only request and Chinese research+marketing request persisted through the real Next API/Supabase/PostgREST/DB stack. Chinese page reloaded; saved exit code still withdrew the stored application. Direct SQL found 2 applications, 2 withdrawn, 0 emails, 0 research consents, 0 marketing consents. |
| Reuse allowed entry; accurate staff/founder/fixture/full-App scope | `components/JourneyExperience.tsx` footer; bilingual copy in `research-form.tsx` | PASS: original Jotform Early Access links retained; first-party research link added. Both languages state founder-assisted research, potentially preset prototypes, no complete downloadable App, no automatic enrollment or sent email. Existing landing/preview browser regressions pass. |
| Distinct application/consent/enrollment/first value/rejection; dedup/spam prevention; independent marketing | SQL applications/receipts/events plus `research_intake_record_event_v1` | PASS: real DB tests cover consent booleans, optional marketing event, idempotent concurrent retries, unique active email, indistinguishable duplicate acknowledgements/replay, honeypot, durable global quota and race at quota boundary. Service-only funnel transitions reject premature first value and re-enrollment after rejection. Browser’s research-only application stored no marketing consent; Chinese optional consent added exactly one marketing event. |

The receipt is a durable **request acknowledgement**, not proof of mailbox ownership or
admission. A duplicate email cannot acquire or change the original application; the UI
instructs prior applicants to retain their original exit code. No provider or customer
success is inferred from this lifecycle.

## Important adversarial and rollback observations

- Anonymous and authenticated roles cannot read private tables or invoke staff events.
  Public RPC checks schema/consent independently of Next.js. No account/Trip writes.
- Same receipt replays once; changed input conflicts. Duplicate receipt cannot withdraw
  the original. Both new and duplicate receipts use identical replay semantics.
- Withdrawal-before-submit stores a bounded hash-only fence. The delayed application
  cannot recreate consent. Shared lock ordering serializes the race.
- Known receipt withdrawal remains available when recruitment is disabled or quotas are
  exhausted. Unknown-code writes have an independent quota to bound abuse.
- Transaction rollback of the migration leaves no research schema; forward migration
  succeeds. PostgreSQL process restart retains records, receipts and fences.
- UI keeps immutable receipt code separate from the editable exit field. Entering and
  submitting a different/unknown code did not change the saved receipt or lose it.
- Failure paths announce unconfirmed status; no false success was shown when the first
  browser attempt was rejected by the production-build Origin guard.

## Checks actually run

| Command | Result |
| --- | --- |
| `pnpm check` (lint, typecheck, build, test) | PASS; static tests 22/22; production build includes `/research` and `/api/intake` |
| `pnpm test:unit` | PASS 106/106 |
| `pnpm test:contract` | PASS 547/547 |
| `pnpm test:integration` | Exit 0; 23 pass, 77 environment-gated skips — INCOMPLETE as a global runtime claim. This includes the new opt-in intake suite, separately run below. |
| `pnpm test:security` | Exit 0; 149 pass, 1 existing environment-gated skip — INCOMPLETE as a global runtime claim |
| `pnpm test:e2e` | PASS 40/40; source/contract checks, not browser evidence |
| `pnpm evals` | PASS 35/35; generated unrelated artifact changes restored |
| `pnpm exec playwright test --config playwright.config.mjs --workers=1` | PASS 11/11, including new bilingual 390×844 unavailable-backend checks and existing desktop/mobile/RTL/keyboard regressions; reuses successful build |
| Scoped contract + `VP_INTAKE_POSTGRES=1` real DB suite | PASS 12/12, zero skips; [log](postgres-tests.txt) |
| `pnpm check:flags`, `pnpm check:assets`, `pnpm docs:check`, `git diff --check` | PASS |
| `pnpm db:verify` | Not configured for a linked remote database; does not establish remote migration acceptance. Dedicated disposable DB tests above supply this Issue's runtime evidence. |

Command outcomes: [commands.jsonl](commands.jsonl). Browser regression log:
[frontend-tests.txt](frontend-tests.txt).

## Browser inspection

Actual production app on loopback port 3027; REST-backed disposable database via 56963.
English desktop 1280×900 and Chinese mobile 390×844 had no horizontal overflow; labels,
unchecked independent consent controls, receipt and exit controls were inspected. The
browser console had no warnings/errors on the successful flows. Screenshots contain no
submitted contact data or exit capabilities:
[English desktop](research-en-desktop.png), [Chinese mobile](research-zh-mobile.png).

The initial full-page capture had a browser high-DPI capture mismatch; final captures use
matching device scale and restored the browser viewport afterwards. No product layout was
changed to accommodate the screenshot tool.

## Review and corrections

Independent privacy/migration review identified and resolved: withdrawal-before-submit
race; email enumeration through duplicate response; mutable receipt-code UI. A follow-up
review of the final code and tests reported no remaining Critical/Important findings.
The reviewer did not independently rerun tests; execution evidence above is the implementer's.

Initial local REST startup failed because the disposable DB did not admit its container
network. Fixed only the test DB's network access. Subsequent real suite passed. Browser
found internal/public Origin mismatch; reused the repository's existing trusted-origin
guard and configured `VISEPANDA_PUBLIC_ORIGIN` for production-build loopback verification.
Rebuilt and reran the real browser flows and relevant checks after that change.

Worktree created at 12:11:36 +0800; local acceptance recorded at 12:32 +0800
(approximately 21 minutes); rework was the three review
findings and test-environment/Origin corrections. External waiting: none. User acceptance,
production activation and real participant recruitment: not observed.

Rollback/closure/backup handling: [operations](../../docs/operations/research-intake.md).
Remaining operational scope: [unrun.md](unrun.md).
