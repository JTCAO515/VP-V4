# VP-V4 Closed Beta Launch Execution Plan

> **For Codex/Claude:** Execute one accepted LAUNCH Issue per branch and PR. Read `AGENTS.md`, `CONTEXT.md`, `HANDOFF.md`, `docs/handoff.json`, `docs/vp-v4-closed-beta-launch-issue-plan.md`, and the Issue's row in `docs/agents/issue-execution-contract.md` before editing.

**Goal:** Deliver an invitation-only, observable and rollback-safe closed beta in which a real user can sign in, create a Trip, chat with one real text model, review and confirm a complete itinerary Proposal, reload it, and use Today.

**Architecture:** Keep the Next.js modular monolith and Supabase owner-RLS boundary. Freeze Trip, Message and Auth interfaces before consumer work. Model output is untrusted input; only validated immutable Proposal revisions can reach the atomic TripPatch transaction after explicit confirmation. The current empty Supabase Project is Staging; Production is created independently only after Staging acceptance.

**Stack:** Next.js App Router, React, strict TypeScript, Tailwind CSS v4, Supabase Postgres/Auth/RLS, Playwright, one operator-approved server-side text Provider.

**Tracker status:** LAUNCH-00 is accepted as [Program #149](https://github.com/JTCAO515/VP-V4/issues/149) with 19 native sub-Issues and native blocked-by edges. LAUNCH-01 #150 is merged and closed. There is no agent-ready Launch Issue; [LAUNCH-02 #152](https://github.com/JTCAO515/VP-V4/issues/152) is waiting for operator-assisted Staging configuration.

---

## Execution rules

- Use the detailed Issue bodies and acceptance criteria in `docs/vp-v4-closed-beta-launch-issue-plan.md`.
- One Issue, one `codex/launch-XX-*` branch, one reviewable PR; do not stack on unmerged interface work.
- Add the real GitHub issue number to the execution-contract row before implementation.
- Start with a failing contract, integration, security or browser acceptance test where applicable.
- Every changed behavior updates mapped docs and `docs/handoff.json`; regenerate/synchronize `HANDOFF.md` and `CONTEXT.md`.
- Run the Issue row's focused tests, then the repository required checks. Record every skip/unrun honestly.
- Never access, print or persist secrets. Account, billing, Provider, domain, Production and destructive privacy actions remain operator-owned.

## Wave 0 — Program and evidence

### Task 1: LAUNCH-00 — accepted 2026-08-29

**Files:** `docs/vp-v4-closed-beta-launch-issue-plan.md`, `docs/agents/issue-execution-contract.md`, `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `artifacts/LAUNCH-00/**`.

1. Program #149 and all LAUNCH-00～19 Issue bodies were synchronized from the accepted plan.
2. Labels, R0–R5 milestones, native sub-Issues, native blocked-by edges and operator-decision markers were applied.
3. Actual GitHub Issue numbers were inserted into the execution contract.
4. Old #151 was superseded into #150; #158 was renumbered to LAUNCH-08; #168 moved to EXPAND-01.
5. Verification and remaining unrun checks live in `artifacts/LAUNCH-00/**`.

### Task 2: LAUNCH-01 and LAUNCH-02

Run as the first safe parallel frontier after LAUNCH-00. LAUNCH-01 owns toolchain/test semantics; LAUNCH-02 owns adoption of the current Supabase Project as Staging. LAUNCH-02 does not create another Staging Project and stops if real user or production data is found.

## Wave 1 — Interface baselines

Execute LAUNCH-03, LAUNCH-04 and LAUNCH-05 as independent contract PRs after Staging evidence exists. LAUNCH-06 may evaluate and implement one Provider in parallel after the operator records Provider/region/budget approval. Do not let any consumer PR silently change these interfaces.

## Wave 2 — Runtime and product path

1. LAUNCH-07 implements durable coordination and worker semantics.
2. LAUNCH-08 implements canonical replay/streaming and browser recovery.
3. LAUNCH-09 implements Trip create/list/select on the frozen Trip contract.
4. LAUNCH-10 replaces the split/static Chat UX with one canonical workspace.
5. LAUNCH-11 connects validated AI output to full Proposal diff and atomic confirmation.
6. LAUNCH-12 adds Today over the confirmed Trip reader only; no live external facts.

After every step, rerun the immediately downstream consumer contract suites. Do not restore fixtures as runtime fallbacks.

## Wave 3 — Staging acceptance and operations

1. LAUNCH-13 runs the real owner/other-user Staging golden path three consecutive times.
2. LAUNCH-14 adds content-free observability, budgets, alerts and live kill-switch consumption.
3. LAUNCH-15 freezes retention/legal/claim decisions; the operator must fill the decision record.
4. LAUNCH-16 implements privacy export/delete only after LAUNCH-15 is accepted, starting with synthetic dry-run evidence.

## Wave 4 — Production and acceptance

1. LAUNCH-17 creates a new, physically independent Production Supabase Project and proves empty-project migration/RLS replay. Never copy Staging users or data.
2. LAUNCH-18 proves required checks, release assets, domain/TLS, smoke, feature flags and rollback. Stop before cutover without explicit operator authorization.
3. LAUNCH-19 runs the bounded canary and 72-hour observation, then records Go/No-Go and a complete takeover package.

## Required final checks

Run or explicitly record why unavailable:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm test:unit
pnpm test:contract
pnpm test:integration
pnpm test:security
pnpm test:e2e
pnpm test:e2e:frontend
pnpm evals
pnpm db:verify
pnpm docs:check
pnpm check:flags
pnpm check:assets:release
git diff --check
```

The release evidence must additionally include desktop, 390×844, Arabic RTL, owner/other-user RLS, Provider failure, worker recovery, SSE reconnect, Trip stale-version, privacy export/delete dry-run, Production migration replay, domain smoke and rollback rehearsal.

## Rollback hierarchy

1. Feature-level: Provider/Chat/Proposal/Today kill switch.
2. Application-level: restore the previous evidence-backed deployment alias.
3. Worker-level: stop claims and preserve durable pending state.
4. Database-level: additive compensation only; no destructive down migration on Production.
5. Product-level: stop invitations and return to truthful private preview/unavailable states.

## Final handoff and next program

LAUNCH-19 updates `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md` and the issue plan with actual commit, deployment, migration, flags, verification, skips, risks, rollback, owners, observation results and exactly one next action. It then re-estimates `EXPAND-01～10`; it must not silently begin them before the closed-beta acceptance decision.
