# VPJ-26 verification

2026-09-22, independent `codex/vpj-26-text-translation`, baseline main `5f95d160bc67ddda4acdd15d062e03567a7cab6f`.

GitHub refreshed: #216 OPEN, no comments or open same-scope PR at start. #363's owner confirmed its merged baseline and no in-flight shared edits; #240 confirmed it does not touch this slice's registration/session/navigation files. #200's owner confirmed separate media paths and no current-input qualification claim.

Implemented: bounded text admission adapter, recent translation projection, zh/en native form, actual policy notice/consent, same-request retry, cancellation, bounded polling, original/back-translation and large card. Runtime authority remains the existing text Turn/worker/budget contract. See the [module contract](../../docs/contracts/vpj-26.md).

## Local checks

- PASS: source policy lint and TypeScript (initial TS narrowing error repaired).
- PASS: 11 direct Node tests: eight translation contract/HTTP cases plus three existing native identity/environment gate tests. Provider and DB responses in translation HTTP tests are stubs.
- PASS: Next.js production build including the new API routes.
- PASS: Xcode 26.6 simulator `build-for-testing` (arm64/x86_64). `DEVELOPER_DIR` was set per command; global xcode-select unchanged.
- PASS: 5 focused native state tests on dedicated iPhone 17 Pro / iOS 26.5 simulator `FC6D13AB-EE1C-4599-A25B-C31C37D508DB`: no-consent admission, identical uncertain retries, late-response fencing, failed-withdrawal local hiding, valid-card projection. The recorded command includes the actual UDID.
- PASS: `pnpm docs:check`, `git diff --check`, implementing-agent diff review.
- Required hosted CI: pending PR checks; tracked in the PR rather than duplicating hosted logs.

No real model call, production action, migration or shared environment write. A dedicated simulator was created for this task; other simulators were not reset/stopped. Whole-Issue requirements not exercised are in [unrun.md](unrun.md), including the concrete eight-request proposed budget.
