# Authless Preview and Unblocked Issue Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Supabase Magic Link acquisition while preserving fail-closed user-data APIs, then make all defined Issues locally schedulable without dependency-blocked execution.

**Architecture:** The public preview remains anonymous. `UserDataAdapter` keeps deriving actors exclusively from Supabase session claims, so anonymous Trip requests remain `401 UNAUTHENTICATED`. Governance text changes direct the agent to queue defined Issues independently while retaining runtime safety, privacy, and authorization guards.

**Tech Stack:** Next.js App Router, TypeScript, Node.js built-in test runner, Supabase SSR client, Markdown/JSON documentation.

## Global Constraints

- Never introduce a service credential, fixed guest actor, RLS bypass, or unauthenticated Trip read/write.
- Keep `app/page.tsx` a Server Component and preserve the five-language public preview.
- Direct scheduling changes Issue workflow only; `UNAUTHENTICATED`, `SAFETY_BLOCKED`, and `DATA_POLICY_BLOCKED` remain fail-closed runtime outcomes.
- Do not edit `.env*`, accepted ADRs, `docs/research/**`, `pnpm-lock.yaml`, external accounts, or GitHub Issues without authenticated CLI access.
- Every change follows Red → Green → Refactor and is committed independently.

---

### Task 1: Remove Magic Link endpoints without weakening the identity boundary

**Files:**
- Create: `tests/security/identity/magic-link-removed.test.mjs`
- Delete: `app/api/auth/magic-link/route.ts`
- Delete: `app/(auth)/auth/callback/route.ts`
- Modify: `tests/security/identity/no-service-credential.test.mjs`

**Interfaces:**
- Consumes: `lib/server/identity/user-data-adapter.ts` and its `client.auth.getClaims()` actor source.
- Produces: an anonymous public preview with no email OTP/callback endpoint; Trip routes retain their existing `UNAUTHENTICATED` behavior.

- [ ] **Step 1: Write the failing removal/security test**

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("public preview exposes no Magic Link or auth callback endpoints", () => {
  assert.equal(existsSync("app/api/auth/magic-link/route.ts"), false);
  assert.equal(existsSync("app/(auth)/auth/callback/route.ts"), false);
});

test("UserDataAdapter still derives the actor only from Supabase claims", () => {
  const source = readFileSync("lib/server/identity/user-data-adapter.ts", "utf8");
  assert.match(source, /client\.auth\.getClaims\(\)/);
  assert.doesNotMatch(source, /SERVICE_ROLE|service_role|SUPABASE_SECRET|SUPABASE_SERVICE|guest.*actor|fixed.*actor/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/security/identity/magic-link-removed.test.mjs`

Expected: endpoint-absence assertions fail because both route files exist.

- [ ] **Step 3: Write minimal implementation**

Delete both route files. Replace `files` in `tests/security/identity/no-service-credential.test.mjs` with:

```js
const files = [
  "app/api/trips/[tripId]/route.ts",
  "app/api/trips/[tripId]/confirm/route.ts",
  "lib/server/identity/user-data-adapter.ts",
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/security/identity/magic-link-removed.test.mjs tests/security/identity/no-service-credential.test.mjs`

Expected: both files pass and no service credential is present.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/magic-link/route.ts app/(auth)/auth/callback/route.ts tests/security/identity/magic-link-removed.test.mjs tests/security/identity/no-service-credential.test.mjs
git commit -m "feat: remove Magic Link entrypoints"
```

### Task 2: Replace dependency-gated Issue scheduling with direct queue governance

**Files:**
- Create: `tests/unit/governance/direct-issue-queue.test.mjs`
- Modify: `AGENTS.md`, `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, `docs/agents/issue-execution-contract.md`, `CONTEXT.md`, `HANDOFF.md`, `docs/handoff.json`

**Interfaces:**
- Consumes: local tracker, triage, execution, and handoff documents.
- Produces: direct Issue queue guidance that preserves runtime fail-closed guards.

- [ ] **Step 1: Write the failing governance contract test**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(file, "utf8");
const tracker = read("docs/agents/issue-tracker.md");
const labels = read("docs/agents/triage-labels.md");
const contract = read("docs/agents/issue-execution-contract.md");
const handoff = JSON.parse(read("docs/handoff.json"));

test("defined Issues are directly schedulable without dependency closure", () => {
  assert.match(tracker, /defined Issue.*directly schedulable/i);
  assert.match(labels, /does not prohibit development/i);
  assert.match(contract, /Do not defer implementation solely because another Issue is open/i);
  assert.match(handoff.status, /direct Issue queue/i);
});

test("direct scheduling retains fail-closed runtime protections", () => {
  assert.match(tracker, /UNAUTHENTICATED.*SAFETY_BLOCKED.*DATA_POLICY_BLOCKED/is);
  assert.match(contract, /runtime.*fail-closed/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/governance/direct-issue-queue.test.mjs`

Expected: direct-queue phrases are absent.

- [ ] **Step 3: Write minimal implementation**

Apply these exact statements to the listed governance documents:

```md
Defined Issues are directly schedulable; an open Issue, textual `Blocked by` reference, or GitHub dependency does not prohibit development.

`status:blocked` reports unavailable runtime, provider, legal, or operator state. It does not prohibit development, testing, review, or merge of an Issue's independently scoped work.

Do not defer implementation solely because another Issue is open. Preserve file ownership, one-branch-per-Issue isolation, and every runtime fail-closed guard.
```

Update `docs/handoff.json` `status`, `owner`, `intendedNextAgent`, `blockers`, and `nextAction` to describe the direct Issue queue and skipped unauthenticated GitHub synchronization. Preserve runtime/provider/legal facts as risks or unavailable states.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/governance/direct-issue-queue.test.mjs && pnpm docs:check && git diff --check`

Expected: direct-queue tests and documentation baseline pass; no whitespace errors.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md docs/agents/issue-tracker.md docs/agents/triage-labels.md docs/agents/issue-execution-contract.md CONTEXT.md HANDOFF.md docs/handoff.json tests/unit/governance/direct-issue-queue.test.mjs
git commit -m "docs: schedule defined Issues directly"
```

### Task 3: Verify, review, merge, and record the external synchronization skip

**Files:**
- Modify: `HANDOFF.md` and `docs/handoff.json` only if fresh verification adds factual command results or remote synchronization status.

**Interfaces:**
- Consumes: both prior commits and required validation commands.
- Produces: a reviewable merge candidate with fresh evidence; no remote Issue changes when `gh auth status` is unauthenticated.

- [ ] **Step 1: Run the full required checks**

Run: `pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm test:unit && pnpm test:contract && pnpm test:integration && pnpm test:security && pnpm test:e2e && pnpm docs:check && git diff --check`

Expected: every runnable command exits `0`. Record an external/manual prerequisite exactly when it prevents a named check; do not bypass it.

- [ ] **Step 2: Verify GitHub synchronization capability without exposing credentials**

Run: `gh auth status --hostname github.com`

Expected: when unauthenticated, record `skipped: GitHub Issue labels/status require authenticated gh CLI`; do not run `gh auth login`, set `GH_TOKEN`, or mutate remote Issues.

- [ ] **Step 3: Request automated code review and resolve critical or important findings**

Review the merge-base diff with a fresh automated reviewer. Re-run every relevant check after a reviewer-driven edit; do not merge while a critical or important finding is unresolved.

- [ ] **Step 4: Merge the verified branch to local `main` and validate the result**

```bash
git switch master
git merge --no-ff codex/remove-magic-link-unblock-issues -m "merge: remove Magic Link and unblock Issue workflow"
git diff --check HEAD^ HEAD
git log -1 --oneline
```

Expected: merge succeeds, the merge diff has no whitespace errors, and the top commit is the merge commit. Push only when configured non-interactive Git transport succeeds; otherwise record the push as skipped.

