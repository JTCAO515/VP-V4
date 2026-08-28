# WEB-04 Asset Rights and Quarantine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove unapproved public asset and Fig Grotesk delivery paths, and make approved-asset, licence, SBOM and NOTICE evidence machine-checkable.

**Architecture:** `docs/licenses/asset-rights-ledger.json` is the explicit allowlist for the 23 owner-master or VisePanda brand records already enumerated in `brand/qa/asset-manifest.json`. `scripts/check-assets.mjs` validates that allowlist, the direct-runtime dependency SBOM, NOTICE links, the removed legacy source tree, and a quarantined list of current stop-ship preview images. The legacy public source tree and duplicated shape hashes are removed; unrelated preview photographs remain explicitly blocked from release until their rights are accepted.

**Tech Stack:** Next.js 16, Node.js ESM, `node:test`, JSON, CSS.

## Global Constraints

- WEB-04 owns only `package.json`, `public/assets/**`, `app/layout.tsx`, `app/globals.css`, `components/VisePandaLanding.tsx`, `brand/qa/**`, `docs/licenses/**`, `scripts/check-assets.mjs`, `tests/**/assets/**`, handoff and `artifacts/WEB-04/**`.
- Do not add a font, publish an asset, change a Product Shell, or claim a legal/rightsholder approval that is absent from repository evidence.
- Retire `public/assets/source/**`, Fig Grotesk, and the `vp-clover` runtime shape from public/release output; preserve their Git history and record their hashes in the quarantine manifest.
- Keep the public preview non-persistent and all existing Supabase claims/RLS boundaries fail-closed.
- Operator-only provenance or rights attestations are recorded as pending and skipped; they do not block the repo-only check, review, or merge.

---

### Task 1: Lock the deny-by-default policy with a failing test

**Files:**
- Create: `tests/security/assets/web-04-asset-policy.test.mjs`
- Test: `tests/security/assets/web-04-asset-policy.test.mjs`

**Interfaces:**
- Consumes: `docs/licenses/asset-rights-ledger.json`, `docs/licenses/sbom.json`, `docs/licenses/NOTICE.md`, `scripts/check-assets.mjs`.
- Produces: an executable assertion that the assets check succeeds and legacy public paths/Fig references are absent.

- [ ] **Step 1: Write the failing test**

```js
assert.equal(existsSync("public/assets/source"), false);
assert.equal(existsSync("public/assets/visepanda/shape-clover.svg"), false);
assert.doesNotMatch(readFileSync("app/layout.tsx", "utf8"), /fig|assets\/source/i);
assert.equal(execFileSync(process.execPath, ["scripts/check-assets.mjs"], { encoding: "utf8" }).includes("Asset policy passed"), true);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/security/assets/web-04-asset-policy.test.mjs`

Expected: FAIL because the legacy public source tree and Fig Grotesk remain, and no check script exists.

- [ ] **Step 3: Commit only after the implementation test passes**

```powershell
git add tests/security/assets/web-04-asset-policy.test.mjs
git commit -m "test: define WEB-04 asset policy"
```

### Task 2: Add rights, SBOM, NOTICE and deterministic verification

**Files:**
- Create: `docs/licenses/asset-rights-ledger.json`
- Create: `docs/licenses/sbom.json`
- Create: `docs/licenses/NOTICE.md`
- Create: `docs/licenses/WEB-04-quarantine.json`
- Create: `scripts/check-assets.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: the four immutable owner-master hashes in `assets/brand/vise-panda/README.md`, plus the 19 VisePanda records in `brand/qa/asset-manifest.json`.
- Produces: `pnpm check:assets`, which prints `Asset policy passed` only when all declared hashes, licence/approval fields, direct runtime dependencies, NOTICE links and denylisted public paths are valid.

- [ ] **Step 1: Define the 23-record rights ledger**

Each JSON record has `id`, `path`, `sha256`, `owner`, `sourceType`, `license`, `derivativeProvenance`, `permittedSurfaces`, `reviewStatus`, and `approver`. Owner masters remain `pending-operator-attestation` and are not runtime output; project-created brand records are `internal-review` and allowed only as non-runtime design/reference material until WEB-06 explicitly consumes an approved derivative.

- [ ] **Step 2: Define direct runtime SBOM and NOTICE**

`sbom.json` lists the exact `package.json` runtime dependencies (`@supabase/ssr`, `@supabase/supabase-js`, `next`, `react`, `react-dom`) and their installed license strings. `NOTICE.md` links to the SBOM, declares no third-party font or image is distributed, and directs owner-rights evidence to the ledger.

- [ ] **Step 3: Implement the deterministic Node checker**

```js
for (const record of ledger.records) {
  assert.equal(sha256(record.path), record.sha256, record.id);
  assert.ok(record.license && record.reviewStatus && record.approver);
}
assert.equal(existsSync("public/assets/source"), false);
assert.equal(existsSync("public/assets/visepanda"), false);
assert.equal(runtimeDependenciesMatchSbom(), true);
```

The checker must reject `Fig Grotesk`, `vp-clover`, a restored legacy source subtree, any public file matching a legacy source hash, unrecorded public preview images, missing ledger fields, stale hashes, unlisted runtime packages, or a NOTICE that does not cite the SBOM and ledger.

- [ ] **Step 4: Add the package command and run it**

Run: `pnpm check:assets`

Expected: PASS after the next task removes the legacy paths.

### Task 3: Remove legacy runtime delivery and record the quarantine

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Modify: `components/VisePandaLanding.tsx`
- Delete: `public/assets/source/**`
- Delete: `public/assets/visepanda/shape-*.svg`
- Delete: `public/assets/review-video-lavender-background.png`
- Create: `docs/licenses/WEB-04-quarantine.json`

**Interfaces:**
- Consumes: the denylist and checker from Task 2.
- Produces: a system-font-based safe stop-ship surface with no legacy source/derived runtime asset reference; later WEB-06 may add only ledger-approved derivatives under a new explicit review record.

- [ ] **Step 1: Replace the Fig font registration with no custom runtime font**

Remove the `next/font/local` import and `figGrotesk` declaration, then render `<html lang="zh-CN">`. Replace the CSS `--font-fig-grotesk` references with the existing system fallback stack.

- [ ] **Step 2: Retire duplicate clover geometry**

Remove `BrandClip`, its render site, and all `vp-clover` CSS uses. This narrowly removes a denylisted runtime shape; it does not redesign the stop-ship landing surface.

- [ ] **Step 3: Remove exact verified public targets**

Use `git rm` only for the already enumerated legacy source tree, duplicated VisePanda shapes, and review background. The quarantine record stores each retired path and SHA-256. The remaining VisePanda preview photographs retain a `blocked-release` record with exact SHA-256; they cannot become approved output without a later owner-rights change.

- [ ] **Step 4: Run the red test and assets check**

Run: `node --test tests/security/assets/web-04-asset-policy.test.mjs && pnpm check:assets`

Expected: PASS.

### Task 4: Record evidence and finish the Issue work unit

**Files:**
- Create: `artifacts/WEB-04/unrun.md`
- Modify: `HANDOFF.md`
- Modify: `CONTEXT.md`
- Modify: `docs/handoff.json`

**Interfaces:**
- Consumes: the passing assets check and the pending-attestation state from the rights ledger.
- Produces: durable evidence that #138 removed delivery paths, what was verified, the external approval that was skipped, rollback and exactly one next action.

- [ ] **Step 1: Record checks, skips, residual risk and rollback**

State that the asset policy, lint/type/build/static/security/docs checks ran; local Supabase-dependent fixtures remain unrun if the service is absent. Record that operator asset-rights attestation and external/store publication are skipped, not implicitly approved. Rollback is a focused revert; it must not republish denylisted assets.

- [ ] **Step 2: Run the required checks**

Run: `pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm test:security && pnpm check:assets && pnpm docs:check && git diff --check`

Expected: PASS, with only pre-existing local-Supabase skips recorded.

- [ ] **Step 3: Commit, automatically review, merge and push**

```powershell
git add package.json app/layout.tsx app/globals.css public/assets docs/licenses scripts/check-assets.mjs tests/security/assets artifacts/WEB-04 HANDOFF.md CONTEXT.md docs/handoff.json
git commit -m "feat: quarantine legacy frontend assets"
```

Review for hidden publishable source paths, a service credential, a false legal claim, stale ledger hashes and package/SBOM drift before merging the single Issue work unit to `main`.

## Self-review

- Spec coverage: Task 1 provides a red regression test; Task 2 creates the ledger, font/SBOM/NOTICE evidence and deterministic denylist; Task 3 removes the runtime source/Font path; Task 4 records verification, skipped operator work, rollback and review.
- Placeholder scan: no implementation placeholder is used; the only unresolved rights decision is explicitly represented as an operator-attestation status rather than an approval claim.
- Type consistency: the same ledger/SBOM/NOTICE file paths are consumed by the test and checker.
