# AI-13 unrun checks

- Authenticated owner/other-user browser interaction is unrun: no disposable local Supabase runtime, owner session, or seeded pending Proposal was available. Confirm, reject, revise, canonical reload, owner isolation, and audit-row effects therefore have no live browser claim.
- Production, Preview, provider, migration, and external-account checks are unrun. No credential, deployment, data mutation, or provider call was attempted.
- The Browser plugin is not installed in this workspace, and Python Playwright is unavailable. The available Playwright CLI was used instead for anonymous production-build rendering at 1280x800 and 390x844; Arabic changes `html[lang]` to `ar`, `dir` to `rtl`, and the 390px viewport had no horizontal overflow. The expected anonymous Trip API 503 and an unrelated missing favicon 404 appear in the browser console.
- `jq` is unavailable locally. A read-only Node JSON parse is the narrow substitution for validating `docs/handoff.json`.
- The first recorded `pnpm test:contract` run failed only because this Issue's handoff update removed V4-31's required exact queue-state assertion. The sentence was restored with no product behavior change, and the immediately repeated 93-test contract suite passed.

Rollback: revert the AI-13 Canvas UI and its static contract/evidence files. Existing Proposal, Trip, event, receipt, RLS, migration, and API-route records are untouched.
