# ServiceTask record-only admission and shared cost — 2026-09-12

Related: #195 and #194. New v2 HTTP admission stores a server-validated explicit goal/parent chain and keeps necessary clarification/technical repair within one ServiceTask budget. No user consumption, IAP, historical context dispatch, SwiftUI consumer or Production change.

## Evidence

- PASS: 23 actual PostgreSQL tests, zero skipped. Includes all prior 18 text/worker/consent/deletion/fault cases, five new ServiceTask cases, full migration chain and transactional migration37 rollback with retained-data snapshot preservation.
- PASS: real disposable GoTrue + Next HTTP + PostgREST + unchanged staging worker using controlled local model HTTP. Goal clarification → clarification reply technical_failure → repair answered creates three Turns and three settled attempts under one task (3 synthetic micros); exact replay does not call again, v1 unassociated admission and stale parent return 409, other owner sees no history.
- PASS: five-language failure taxonomy3/3; lint; typecheck; production build; docs check; diff check.
- Independent migration/data/money review: Critical0 / Important0. Original findings (old worker and scope budget reset, Task/Turn UUID collision) corrected. Reviewed core collection SHA256: `570287e72464bbf1d7536eadb056fda0b69a5c70624aeb674f08830f4b5d826c`.
- Initial SQL run exposed a missing optional extensions schema; SHA-256 now uses PostgreSQL's built-in function. A later collision test exposed the test RPC helper parsing a table-returning function as JSON; helper corrected. Final23/23 includes both corrections; earlier failed runs are not counted as passes.

The API accepts explicit task attribution; it does not classify arbitrary natural-language goals. The model still receives only current input. Root deletion/hidden records and withdrawn consent block continuation/dispatch. Deletion retains existing text and task metadata without adding restrictive user/Turn foreign keys. No new operator scope, policy, recipient, model or migration was applied remotely by these tests.

Rollback preserves task associations and immutable budget-scope pins while withdrawing the v2 API deployment; existing linked work cannot fall back to fresh v1 task budgets. The independent local stack was removed. Staging, real-provider multi-Turn attribution and native consumer acceptance remain UNRUN for this slice.
