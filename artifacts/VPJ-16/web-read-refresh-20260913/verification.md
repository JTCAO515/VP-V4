# Saved-answer refresh continuity — 2026-09-13

Related to #264/#206, PR #370. S2 incremental defect repair; neither parent is complete.

## Implementation

On the previous Web reader, the 30-second revalidation hid the whole history, leaving a blank viewport at a deep reading position. Candidate d056ec581551722c8a65e9d40bd6a2bb34807994 starts revalidation five seconds early and retains only still-valid content until an authorized response replaces it. The old hard deadline remains armed. Expiry, errors, offline/background and auth changes invalidate; stale responses remain fenced. Short lifetimes avoid a tight request loop. No server, database or native change.

## Local evidence

- PASS: source lint, 266 files; TypeScript; 278 contract tests, no skips.
- PASS: four deterministic tests execute the actual component effect with controlled external IO/timers. Successful replacement, stalled refresh across hard expiry, late response, logout/owner replacement/offline/background/error, short lifetime and full request elapsed time are covered. This is lifecycle evidence, not React rendering or network-fault browser evidence.
- Independent final review: zero Critical/Important findings at d056ec5. Component SHA256 78cde8b50139ae8323261c7b00661ae4b70b664fb4b91078cd57818a05bab3cc; test SHA256 9650e2c863fffcdb7f9596afd78b164e5e38228a0349d589273ab5eb4362aa67.

## Runtime evidence

PASS on dedicated Preview dpl_EPnctYkGXsrLEqpGiKntxubWy1cM on the frozen candidate; uses Staging migration45 and existing retained answers. No new model requests were made. Reuse unchanged API/SSE/SQL/native proof from ../cancelled-read-20260913/verification.md. Browser network fault injection is unavailable in the installed browser API; deterministic effect tests cover those races.

## Prior slice closure

PR #369 merged at 37e770046b76474a6451275b93871b365dc5fdd9. Exact-head Quality34765780330, Budget34765780406 and Vercel passed. Its automatic Production deployment dpl_D73gV2GCkmV8LUE3zsEaCa1Pe6bL was CANCELED; five Production aliases and shared Staging stayed unchanged. Full S2 and #206/#264 remain open.

- Actual browser: existing en/zh accounts, 1365×900 and390×844. Each combination observed for36seconds with approx200ms DOM samples:168/168/166/165 respectively,667 total. Every sample retained visible content, expanded source and fixed reading position. Screenshots visually inspected; console errors empty. Sampling is not frame-by-frame proof. Normal UI logout was observed for both accounts; Chinese account did not contain the selected English answer.
- Final retained-state query initially failed authentication because its temporary CLI credential refresh overlapped cleanup. No SQL mutation was attempted by this query; serialized retry PASS.

- Cleanup PASS: reader/Ops false, active members0,12statements/11published/1revoked; WAF temporary host removed atversion66, Production target unchanged; browser closed/viewport reset. Retained Turn/event/grounded/work/budget/Trip digests equal before/after:207Turns,207attempts,1549974CNYmicros estimate,0unresolved. No migration or native rerun for this Web-only change.
