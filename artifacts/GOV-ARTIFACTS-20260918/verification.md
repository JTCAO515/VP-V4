# GOV-ARTIFACTS-20260918: CI guard against unbounded artifacts/ growth

## Background

`artifacts/` is committed evidence and is never pruned by tooling. As of 2026-09-18 it is
~158MB across ~3,000 tracked files. A breakdown by extension showed PNG screenshots alone
account for ~128MB (81% of the total) of the ~158MB. `.gitignore` (lines 15-18) already
restricts *new* untracked additions under `artifacts/` to `.md` files only
(`/artifacts/**` then `!/artifacts/**/*.md`) — the ~1,165 currently-tracked non-`.md` files
(png/log/jsonl/gz/txt) predate that rule and are grandfathered; `git status`/plain `git add`
already refuses to add a new PNG there without `-f`.

This change does not move, delete, or otherwise touch any existing file. It adds one CI
backstop for the two ways the existing `.gitignore` rule can still be bypassed: an explicit
`git add -f` of a large binary, or an oversized `.md` file (e.g. inlined base64 image data —
checked and not currently present anywhere in `artifacts/**/*.md`).

## Change

- `scripts/check-artifact-growth.mjs`: sums the byte growth of every added/modified file
  under `artifacts/` between a base and head git ref (via `git diff --name-status` +
  `git cat-file -s`, not `git diff --numstat`, since numstat reports line counts and treats
  binary files as unmeasurable). Fails with the largest offending files listed if a single
  diff adds more than 5MB. Falls back to `git merge-base HEAD origin/main` when
  `VP_CI_BASE`/`VP_CI_HEAD` aren't set (local runs outside a PR), and skips (does not fail)
  when neither is resolvable, so it never breaks a plain local `pnpm check`.
- `package.json`: new `check:artifacts` script.
- `.github/workflows/quality-pr.yml`: new unconditional step (runs for both the
  `documentation` and `full` change-scopes, since an oversized evidence file can land in
  either) calling `pnpm check:artifacts` with the PR's real base/head SHAs, mirroring how
  `scripts/ci-change-scope.mjs` already consumes those same two env vars.

## Verification

Local, no CI run yet (this PR's own Quality PR run will exercise it for real):

- `node scripts/check-artifact-growth.mjs` on a clean `main` checkout (no base ref
  resolvable in this environment beyond `origin/main`, no diff) → `+0.00MB ... — OK`, exit 0.
- Regression check: `git add artifacts/TEST-GROWTH/fake-screenshot.png` (an 8MB random-byte
  file) without `-f` was refused by the existing `.gitignore` rule, confirming that rule is
  still active and doing its job today.
- Positive check: the same file added with `git add -f` and committed, then
  `node scripts/check-artifact-growth.mjs` correctly failed: `+7.63MB ... (limit 5.00MB)`,
  naming the exact file and its size, exit 1.
- The test branch and its test commit were discarded (`git checkout main && git branch -D`)
  before this real change was committed; no test artifact is part of this PR.
- `node --check scripts/check-artifact-growth.mjs` — syntax OK. Full `pnpm lint`/`typecheck`
  were not run locally (no `node_modules` installed in this environment); this PR's own
  Quality PR CI run covers both.

## Not covered by this round

- Does not address the ~158MB of already-tracked historical evidence. An attempt to
  relocate closed-issue artifact folders was scoped out this round after finding that at
  least `artifacts/VPJ-02/staging-33-preparation/**` is read/written directly by
  `scripts/db/staging-33-package.mjs`, `staging-33-metadata.mjs`, and
  `staging-33-rehearsal.mjs` — i.e. "issue closed" does not reliably mean "evidence folder
  is inert history" for every VPJ number, and moving files without auditing every reader
  first risks breaking live tooling. That is a separate, larger effort if the maintainers
  want it.
- The 5MB threshold is a starting point, not a measured optimum; adjust in
  `scripts/check-artifact-growth.mjs` if real usage shows it is mistuned in either
  direction.
