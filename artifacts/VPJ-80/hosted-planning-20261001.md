# Hosted planning seam — 2026-10-01

Branch `codex/vpj80-hosted-planning-seam-20260930`, base `cac29b2bbf32a03f3d2f5d3f4f6d6647feae4ab1`. Related to #561; the parent remains OPEN. This slice reuses the #195 host lifecycle and #574 planning poll, not a new Coordinator. No ECS configuration, target policy, credential or deployment was changed.

## Observed local synthetic evidence

- Hosted CLI processes use a closed HTTP mapper to disposable PostgreSQL plus synthetic Qwen/AMap servers. Auth is SQL fixture claims, not a real supplier or GoTrue session claim. The fixed Staging URL is mapped to the disposable database; no remote request is possible.
- PASS: profile/1 and disabled SQL switch do not claim planning. Invalid owner, disabled/frozen/expired scope, wrong price, attempt reservation and spend limits send zero map/model requests.
- PASS: uppercase planning owner and lowercase discovered text owner execute in one serialized lane.
- PASS: SIGKILL after two atomically completed tool checkpoints → fresh competing CLI processes resume and publish one artifact. The completed map step stays at 13 synthetic requests; exactly one model call, usage receipt, settled budget attempt and result event are produced.
- PASS: SIGKILL after paid dispatch → fresh CLI persists `paused_unknown`; no second tool/model request, no artifact, and the dispatched hold remains unresolved.
- PASS: mixed queues cannot lend later funded/unknown readiness to the earliest claimed task. Frozen scope and an exhausted earliest task cause zero egress before its pause; later unknown work is cleaned without replay.
- PASS: injected planning usage-journal failure leaves pending cost and a paused task; restarting does not repeat the paid request. Legacy receipt/audit rejection rules remain intact.
- Initial cross-process success test exposed the existing planning/legacy receipt mismatch (`taskId` differs from `turnId`); the separate planning schema fixes it without changing legacy v1 or rewriting prior pending holds.

PASS: hosted old/new child-process regression 11/11; receipt/profile/lifecycle/audit targeted tests 21/21; Linux Docker image build and old/new tmpfs file-secret proof; full PostgreSQL lane 17 files / 136 tests and RLS lane 13 files / 23 tests, both zero skips/failures; contract 698/698; build/lint/typecheck/docs/diff. Generic security is 192 pass/1 environment skip and integration is 39 pass/133 environment skips, both incomplete; dedicated DB runs supply scoped evidence. Final PR CI is recorded in the PR. Tests accelerate only a killed worker's lease expiry in the disposable database; they do not claim a live host timing/SLA result.

## UNRUN and limits

Real Qwen/AMap, supplier map billing, live host access/activation, Staging migration/deployment, App-closed and device readback are UNRUN. The preflight checks the actual lease before the compound map step but does not reserve map cost or eliminate changes racing after that check. Model reserve/dispatch remains the final accounting gate. Rollback returns the host to profile/1 or `planning:null` with the planning flag off, retaining durable tasks, revocations, results, journals and the append-only read RPC.
