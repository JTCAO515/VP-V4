# AI-13 Trip Canvas Proposal Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` task-by-task with a failing test before every production behavior. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing owner-scoped pending Proposal visible in Trip Canvas and let its owner revise, reject, or explicitly confirm it before reloading the authoritative Trip state.

**Architecture:** `TripCanvas` remains a client-only consumer of the existing private, no-store Trip and Proposal routes. It maintains one local pending-proposal snapshot and sends only the existing closed mutation payloads. Every mutation re-reads the canonical Trip and then the pending Proposal; no client state is treated as a successful Trip write.

**Tech Stack:** Next.js App Router, React client component, strict TypeScript, CSS modules, Node test runner.

## Global Constraints

- Keep `TripCanvas` in `components/canvas/`; its route remains `/visepanda/trips/[tripId]`.
- Use the existing `GET /api/trips/:tripId/proposal`, `POST /confirm`, `POST /proposal/reject`, and `POST /proposal/revision` routes only.
- Preserve same-origin server enforcement, owner-JWT/RLS enforcement, append-only Proposal/Trip history, `private, no-store`, and `TRIP_PERSISTENCE_ENABLED` semantics.
- A proposal exposes only title before/after and explicit `not_recorded` evidence/assumptions; never fabricate provenance, map, booking, payment, provider, model, Fact or Trip data.
- Keep map off; retain five-locale selector and Arabic document RTL behavior.
- Do not edit API routes, identity adapter, migration, RLS, feature-flag implementation, secrets, lockfiles, or accepted ADRs.
- Rollback is a normal revert of the Canvas UI and static acceptance test. Existing Proposal and Trip audit rows remain untouched.

---

### Task 1: Specify the Canvas proposal loop with a static end-to-end contract

**Files:**

- Create: `tests/e2e/canvas/ai-13-proposal-loop.test.mjs`
- Modify: `docs/agents/issue-execution-contract.md`
- Create: `artifacts/AI-13/unrun.md`

**Interfaces:**

- Consumes: `PendingProposalRead` response `{ trip, proposal: { id, revision, baseTripVersion, titleDiff, evidence, assumptions } }` from the existing Proposal route.
- Produces: executable assertions that Canvas requests the read route, sends only closed confirm/reject/revise payloads, and reloads after each mutation.

- [x] **Step 1: Write the failing test**

```js
assert.match(canvas, /\/api\/trips\/\$\{tripId\}\/proposal/);
assert.match(canvas, /titleDiff\.before/);
assert.match(canvas, /titleDiff\.after/);
assert.match(canvas, /evidence === "not_recorded"/);
assert.match(canvas, /\/proposal\/reject/);
assert.match(canvas, /\/proposal\/revision/);
assert.match(canvas, /\/confirm/);
assert.match(canvas, /reloadAll\(\)/);
```

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/e2e/canvas/ai-13-proposal-loop.test.mjs`

Expected: FAIL because the current Canvas does not read or render a pending Proposal.

- [x] **Step 3: Expand the Issue execution row**

```text
components/canvas/**, app/visepanda/trips/**, lib/i18n.ts,
tests/e2e/canvas/ai-13-proposal-loop.test.mjs, docs/agents/issue-execution-contract.md,
docs/handoff.json, HANDOFF.md, CONTEXT.md, artifacts/AI-13/**,
docs/superpowers/plans/2026-08-28-ai-13-trip-canvas-proposal-loop.md
```

The current row points at the obsolete `app/(product)/trips/**` location and omits its required
evidence/handoff paths. Update it to the current route and the minimum governance paths before
archiving evidence.

### Task 2: Implement the read-only proposal projection and visible diff

**Files:**

- Modify: `components/canvas/TripCanvas.tsx`
- Modify: `components/canvas/TripCanvas.module.css`
- Modify: `lib/i18n.ts`

**Interfaces:**

- Consumes: the unchanged `PendingProposalRead` shape.
- Produces: `reloadAll()` which reads Trip first then Proposal; an unavailable Proposal does not make the Trip unavailable.

- [x] **Step 1: Add the minimum types and authoritative reader**

```ts
type PendingProposalRead = Readonly<{ trip: TripRead["trip"]; proposal: Readonly<{
  id: string; revision: number; baseTripVersion: number; expiresAt: string;
  titleDiff: Readonly<{ before: string; after: string }>;
  evidence: "not_recorded"; assumptions: "not_recorded";
}> }>;

async function readPendingProposal(): Promise<PendingProposalRead | null> {
  const response = await fetch(`/api/trips/${tripId}/proposal`, { cache: "no-store" });
  if (response.status === 401) { setState("unauthenticated"); return null; }
  return response.ok ? response.json() as Promise<PendingProposalRead> : null;
}

async function reloadAll() {
  const trip = await reload();
  if (!trip) return null;
  setPendingProposal(await readPendingProposal());
  return trip;
}
```

- [x] **Step 2: Render the exact diff and honest provenance state**

```tsx
<dl className={styles.diff}>
  <div><dt>{copy.before}</dt><dd>{pendingProposal.proposal.titleDiff.before}</dd></div>
  <div><dt>{copy.after}</dt><dd>{pendingProposal.proposal.titleDiff.after}</dd></div>
</dl>
<p>{copy.evidenceMissing}</p>
<p>{copy.assumptionsMissing}</p>
```

The copy table supplies these labels in `zh`, `en`, `es`, `ru`, and `ar`; locale changes update
`document.documentElement.lang` and `dir` with `getLocaleAttributes`.

- [x] **Step 3: Run the targeted test to verify it passes**

Run: `node --test tests/e2e/canvas/ai-13-proposal-loop.test.mjs`

Expected: PASS.

### Task 3: Implement explicit mutations and authoritative reload

**Files:**

- Modify: `components/canvas/TripCanvas.tsx`
- Modify: `components/canvas/TripCanvas.module.css`
- Modify: `lib/i18n.ts`

**Interfaces:**

- Consumes: existing closed JSON payloads: confirm `{ proposalId, idempotencyKey, digest }`, reject `{ proposalId }`, revise `{ proposalId, title }`.
- Produces: disabled controls while a mutation is active; every successful or ambiguous mutation calls `reloadAll()`.

- [x] **Step 1: Add failing static assertions for each mutation boundary**

```js
assert.match(canvas, /body: JSON\.stringify\(\{ proposalId: pendingProposal\.proposal\.id, idempotencyKey, digest:/);
assert.match(canvas, /body: JSON\.stringify\(\{ proposalId: pendingProposal\.proposal\.id \}\)/);
assert.match(canvas, /body: JSON\.stringify\(\{ proposalId: pendingProposal\.proposal\.id, title \}\)/);
assert.doesNotMatch(canvas, /method:\s*["'](?:PATCH|PUT|DELETE)/);
```

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/e2e/canvas/ai-13-proposal-loop.test.mjs`

Expected: FAIL because the Canvas has no proposal mutation controls.

- [x] **Step 3: Add minimal explicit control handlers**

```ts
async function confirmPendingProposal() {
  const idempotencyKey = crypto.randomUUID();
  await fetch(`/api/trips/${tripId}/confirm`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ proposalId: pendingProposal.proposal.id, idempotencyKey,
      digest: `proposal-v${pendingProposal.proposal.revision}-base-v${pendingProposal.proposal.baseTripVersion}` }),
  });
  await reloadAll();
}
```

Reject and revise use their corresponding existing routes, never direct `PATCH`, `PUT`, `DELETE`,
or a local Trip update. A stale/failed response shows localized unavailable/conflict state then
reloads the canonical data.

- [x] **Step 4: Run the targeted test to verify it passes**

Run: `node --test tests/e2e/canvas/ai-13-proposal-loop.test.mjs`

Expected: PASS.

### Task 4: Archive evidence, run full checks, review, and merge

**Files:**

- Modify: `docs/handoff.json`
- Modify: `HANDOFF.md`
- Modify: `CONTEXT.md`
- Create: `artifacts/AI-13/unrun.md`

**Interfaces:**

- Consumes: targeted static test and full repository suites.
- Produces: truthful evidence that the implementation is a UI consumer of existing protected APIs, not production/provider acceptance.

- [x] **Step 1: Record external and local limits**

`unrun.md` states that local Supabase owner/other-user interaction and authenticated browser flow are
unrun when no disposable local runtime/session is available; it never claims a real user/Trip action.

- [x] **Step 2: Run required checks**

Run: `pnpm test:e2e`, `pnpm check`, `pnpm docs:check`, JSON parse of `docs/handoff.json`, and `git diff --check`.

Expected: all commands exit 0 except any explicitly documented unavailable external/local runtime
check; command evidence is appended to `artifacts/AI-13/commands.jsonl`.

- [x] **Step 3: Obtain independent automated review and correct Critical/Important findings**

Review the branch specifically for owner isolation, direct-write bypass, stale/reload behavior,
untruthful claims, localization/RTL, and scope escapes. Re-run all required checks after every fix.

- [ ] **Step 4: Fast-forward merge the reviewed current-base branch**

Use ordinary repository authority only after the branch is current, review reports no unresolved
Critical/Important findings, and all required checks pass. Push `main`; never bypass protection,
perform a production migration, or claim local/browser evidence that was not observed.

## Self-review

- Spec coverage: Tasks 2–3 cover visible before/after/source/assumption states, exact confirm/reject/revise operations, conflict refresh, five locales and RTL. Task 4 covers evidence, rollback and independent review.
- Placeholder scan: no implementation placeholder or unbounded behavior is present.
- Type consistency: all UI data is the existing `PendingProposalRead`; no server interface is changed.

## Execution handoff

The operator already authorized inline continuous execution with no per-Issue confirmation. Execute this
plan in the current session, following TDD and the independent review gate.
