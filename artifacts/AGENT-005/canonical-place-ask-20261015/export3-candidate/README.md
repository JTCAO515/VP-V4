# Conditional export3 consumer candidate

Fixed upstream: PR707 head `124da5cf138c72ae4b7ae4f1116f1fad4f416ec0`. Main accepted 707 at `ead1efc19f2f540d9056eb37ed90333388b0c8a9`. After a normal merge, all three before blobs matched exactly and the after files were applied. The snapshots preserve the reviewed candidate and its original before bytes. TS snapshots use `.ts.txt` so they do not enter the repository TypeScript build.

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

## Actual SQL page cross-check

SQL peer supplied the actual `public.privacy_core_export_v1(request → claim → turn_page)` output in `export3-page.json`, with original owner, limit 100 and captured time. `sql-export3-page.json` preserves its complete page value; `sql-export3-context.json` preserves the original context. The candidate's actual decoder accepted all 38 sources, preserved the entire snapshot with deep equality, and independently reproduced the original canonical SHA256 source digest. PASS. No fixture rows were substituted.

Permission classification remains narrow: SQL executed the actor request with original postgres permissions plus synthetic auth/epoch, and claim/page with original postgres permissions plus synthetic service claims. Ordinary service_role page access was denied in the SQL peer check. This does not establish live Auth, an ordinary D2 permission grant, or delivery. The three consumers were applied only after Main accepted 707 and their before blobs matched. Actual mixed Trip SQL-page validation subsequently passed against the applied consumer, including the parent-lineage hardening.

Applied verification: 65 affected tests PASS, 0 skipped; root typecheck and lint PASS. These include the original Turn export, Directions compatibility, Trip privacy consumer, canonical producer/HTTP tests, Place/mixed graph checks and actual SQL Place export page. The three-codec admission fixture now matches Native and SQL byte-for-byte: SHA256 `e23156193df15eade60a939344e7f796452074edeb077633c4a390222ad7bf8c`. Native's 38 codec probes are peer-reported; this owner does not claim a compiled Native UI or live provider acceptance.

Actual accepted707 mixed and pure Trip pages: both decoded with full snapshot deep equality and original canonical SHA256 verification; each contains all 43 sources and all five Trip sources are nonempty. Pure Trip retains `turn-trip-core-export/1`; the mixed page uses `turn-core-export/3`. Source wrappers were copied byte-for-byte into `tests/contract/canonical-place-ask/`: mixed SHA256 `f0785e0500d361dafd429a63c74ae0d45ac636650ebda6beb37e88133bd55979`, pure Trip SHA256 `47d98720ac0911e25e8f4409c0e607282b5774e98525e1a2a03cd088322cd766`. All 14 focused export tests PASS, 0 skipped. This confirms consumer compatibility with those actual SQL outputs; portable-fresh SQL, worker claims, capacity settlement, lifecycle and Native UI remain separately owned evidence.
