# Conditional export3 consumer candidate

Fixed upstream: PR707 head `124da5cf138c72ae4b7ae4f1116f1fad4f416ec0`. Candidate only; original three consumer files have not been applied. Main must accept 707 and verify these before blobs before applying the after files. TS snapshots use `.ts.txt` so they do not enter the repository TypeScript build.

`manifest.json` records exact before/after blobs and SHA256. `before/` reproduces the three fixed-head originals. `after/` preserves the old exact columns and adds an independent Place-only column rule. Ordinary v1 and pure Trip literal `turn-trip-core-export/1` retain their old representation. `turn-core-export/3` requires a non-NULL qualified Place proof and keeps the complete 38-source ordinary or 43-source mixed Trip inventory, counters, authority references, and closed parent graph. The stored proof is historical evidence, not current dispatch authority. Its actual SQL contract uses original receipt version 2.

Candidate validation: 31 assertions PASS, strict TypeScript compilation PASS against the fixed124 dependency tree. Includes legacy byte preservation, mixed Trip graph, old NULL-slot and new Place rows together, missing/NULL proof, unsupported receipt, malformed answer claims, missing inventory, and cross-thread rejection. These are controlled decoder checks, not a target database or live Auth acceptance claim. Actual PG17 receipt transport is separately covered by `tests/contract/canonical-place-ask/sql-wire.test.mjs`.

Reproduce from this worktree (dependencies must already be installed):

```sh
python3 artifacts/AGENT-005/canonical-place-ask-20261015/export3-candidate/prepare-validation.py
node --experimental-strip-types artifacts/AGENT-005/canonical-place-ask-20261015/export3-candidate/validate.mjs
pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --allowImportingTsExtensions --resolveJsonModule --skipLibCheck --strict artifacts/AGENT-005/canonical-place-ask-20261015/export3-candidate/validation-root/lib/server/privacy/turn-data/export.ts
python3 artifacts/AGENT-005/canonical-place-ask-20261015/export3-candidate/prepare-validation.py --clean
```

Clean the disposable validation tree before running root `pnpm typecheck`; the root configuration includes every `.ts` file. No shared SQL, permissions, deployment configuration, or provider flow was changed.
