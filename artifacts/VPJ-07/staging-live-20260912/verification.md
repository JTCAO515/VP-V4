# S2 Staging text integration — 2026-09-12

Status: bounded remote transport/persistence slice PASS; output quality and full capability INCOMPLETE. Native physical verification is deferred by JT; no full S1/S2 or Issue #195 completion is claimed.

## Scope

- Source: `ed2508eed6cddf5fd972738d919268f7a4ef842a` on PR #325, including main's development integration policy.
- Staging: `dzqdzetcctkhbrhlxxgn`, Singapore; native API custom origin `https://staging.go2china.space`.
- Two new synthetic test owners only. Existing four accounts and three Trips are preserved. No emails are sent.
- Development policy `8ed19537-ac5d-4f92-a2ec-13a421fcff92`, notice `vpj07-staging-development-20260912-v1`; actual supplier unknowns remain explicit. Expiry/recheck is enforced by the existing registry.
- Exact Qwen endpoint and pinned `qwen3.7-plus-2026-05-26`; no fallback, Trip context, prior conversation, material uploads or automatic Trip changes.
- Dedicated one-shot worker only, scoped to each synthetic owner and policy. No scheduler or provider key in Vercel.
- Each owner has CNY 70 fault-stop scope, task CNY 21 / three attempts, concurrency one; each invocation reserves CNY 7 and permits 1,024 output tokens / 60 seconds. These are development safety limits, not a daily product limit or actual invoice.
- Conservative public input/output rates CNY 6/24 per million use a full-context input reserve. The calculated upper bound CNY 6.316032 fits the reservation; settlement is a conservative ledger estimate and requires validated model/usage. Unknown charges remain held.

## Acceptance fixed before calls

1. Both synthetic owners authenticate through the deployed native credential and login endpoints.
2. Each reads the exact bilingual notice and accepts through ordinary JWT-authenticated native consent. No administrator inserts consent.
3. English and Chinese text submissions persist. Identical replay reuses the same Turn.
4. The dedicated worker reaches the bound real Qwen endpoint and durably returns a natural language answer for a stable, non-live Mandarin courtesy question.
5. Re-reading the deployed API returns the saved output; another owner cannot see that Turn.
6. Inspect destination receipts and durable budget outcomes without exposing credentials or logging real user text.

This first slice does not establish all five semantic outcomes, published knowledge grounding, continuous worker availability, complete recovery/chaos acceptance, real supplier billing or native UI presentation of model answers.

## Preparation observed

- Initial Staging counts: 4 users, 3 Trips, 36 migrations, zero text policies and enabled budget scopes.
- Two synthetic accounts created with unique test-run ownership metadata; no outgoing emails.
- Independent configuration review identified and resolved an exact-owner validation defect. The transaction now locks and matches the two exact owner IDs against the unique run marker and rejects pre-existing scopes for either owner. Final review: Critical 0 / Important 0.
- Policy and two bounded scopes installed transactionally. Read-back: one selected policy, two owned scopes, zero consent rows. No schema migration or service-role consent grant.
- Native AX regression: both previously failing tests passed on an owned iOS 26.5 Simulator, zero skips. Latest copy from main and explicit shell readiness waits are included; no audit waiver. Owned Simulator removed after the run.
- Quality PR `34639222843` and Budget PostgreSQL `34639222755` passed. Native CI `34639222763` also passed. Duplicate manual dispatches were cancelled after automatic runs were confirmed.

## Runtime results

See [results.json](results.json) for synthetic outputs and metadata-only destination receipts.

- Preview `dpl_5RioYCbXfn69EKocdYtK3EKxZGLo` / `vp-v4-h8a675zeu-jtcao515s-projects.vercel.app` is READY, region `iad1`, exact source above. Only current-branch Preview text variables were added; Production and firewall were unchanged.
- Both owners: native credentials/login, exact notice read and ordinary consent PASS. Two actual consent records were created by owner JWTs, not SQL or service role.
- Both locales: first submit HTTP 201, identical replay HTTP 200; one Turn per logical request.
- Both one-shot workers returned `finished`. Bound real Qwen requests produced durable `answered` / `completed` outcomes, read back from the deployed native API.
- Opposite owner did not see either Turn. Inputs and outputs are synthetic; no existing account text or Trip was sent.
- Both budget attempts settled from validated model/usage. Conservative estimates: CNY 0.003114 and 0.002058; CNY 0.005172 combined. This is not a supplier invoice or proof of exact billed cost.
- Semantic limitation: the English answer suggests placing “Nín” before thanks, which is an imprecise Mandarin formulation. The Chinese answer is usable, but bilingual factual equivalence and final answer quality have not passed. Preserve this observed defect for the response-policy follow-up; do not label the semantic acceptance green.
- Native physical answer reading, all five outcomes, ServiceTask attribution and complete recovery remain UNRUN/INCOMPLETE. No Issue is closed by this slice.
