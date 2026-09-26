# VPJ-80 planning-chain evidence

Branch `codex/vpj80-planning-chain-20260927`, initially from main `972cfdb01b35217a09ce7644acd39d524ce2305d`, rebased onto `0cbd481b57cce03539ce1b1fbad445bbb758cb98` after #572. Final SHA checks are pending. Related to #561; parent remains OPEN.

## Implemented

- Versioned planning consent and owner-scoped native admission feed an existing ServiceTask/Turn/work lease, with planning-only claim routing.
- #571 durable action claims and atomic validated checkpoints feed a fixed tool sequence. A fresh worker instance can resume completed steps; an unknown effect cannot re-execute.
- A bounded Qwen selection goes through fresh SQL authorization and #194 budget. Deterministic content is checked against the place observation before #560 comparison/1 publication and owner native readback.

## Local observations

- PASS: disposable PostgreSQL planning test: migration rollback/reapply after #572's 050000; direct owner admission/lease/checkpoint/budget/publication/readback; worker function provider fixture; expired lease recovery; concurrent claim; goal and Memory revision changes; linked-Trip goal rejection; cancellation, planning consent withdrawal and unknown provider cost stop; late stale-basis publication rollback.
- PASS: final local disposable PostgreSQL `postgres` lane after #572 and the planning policy/discovery refinements, 16 files / 131 tests / 0 skip or fail. Final remote CI remains pending.
- PASS: local real Auth + native HTTP + migrated PostgreSQL + worker function + owner result HTTP with synthetic model/place fixtures. The title and test state identify synthetic content. In the full local native lane, native-local-session (1/1), native-text-http (7/7), native-planning-http (1/1), and native-grounded-http (1/1) passed.
- FAIL (local environment): the old `native-same-trip` browser test stopped before its assertions because the pinned Playwright Chromium Headless Shell binary is absent. Both the full Chromium and headless-only downloads completed, but local cache extraction stalled for more than four minutes; installation processes were stopped without changing tests or CI. The full local native lane therefore remains FAIL until a browser is available. Remote CI must run that check.
- PASS: the focused native planning Auth/HTTP/worker/result test was rerun after the final policy-target checks (1/1). CI's native lane explicitly installs pinned Chromium before running the full lane; its result remains pending for this branch.
- PASS: `pnpm lint`, `pnpm typecheck`, `pnpm docs:check`, `pnpm check:flags`, `git diff --check` and DB test classification on the rebased branch.
- PASS: `pnpm build` compiled the new planning policy/tasks routes as dynamic server routes. Next-generated `AGENTS.md` diff was removed from the PR worktree after the build.
- PASS: `pnpm test:contract` 695/695 with no skips. `pnpm test:security` exited 0 with 189 pass/1 environment skip and reports incomplete; `pnpm test:integration` exited 0 with 39 pass/127 environment skips and reports incomplete. The dedicated DB/native runs above are separate actual local integration evidence.

## UNRUN / limits

- No actual Qwen or AMap credentials are present in this checkout. Real provider calls, supplier cost reconciliation and live route availability are UNRUN.
- No hosted planning scheduler or named Staging policy/worker activation has been installed. App closure, actual worker process restart and same-version native device read are UNRUN. Local tests simulate a new worker instance and lease, not a deployed process restart.
- No Production migration, payment, booking, Trip write or release was performed.
- `paused_unknown` is fail closed. Operator/provider reconciliation and user-visible pause/resume flow remain future work; the synthetic chain does not close #561.
