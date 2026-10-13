# VPV10-SCALE-004/4 — retired disabled budget regression

Result: **PASS, 29 named checks**, actual fresh isolated PostgreSQL 17.6. This is scoped SQL regression, not target restore/export/erase, GoTrue, provider, physical device, release or parent acceptance.

## Source and execution

- Sole proof writer: chat `01a1334b-d22d-74b2-bebd-83006b5072bf`; project `VP - V10`, project ID `4f2191db-3e04-4042-94b5-ec94ff67b427`.
- Actual local session metadata: `gpt-6.1-sol`, `medium`, `danger-full-access`, approval policy `never`. No model/project/tool configuration or derived chat/agent was created.
- WT: `/Users/jtsm5p/Documents/Codex/VP-V10-worktrees/w2-retired-budget-20261013`; branch `codex/v10-w2-retired-budget-20261013`; base `304c3fd6` (full base and ordered 155-source hashes in `manifest.json`).
- Current tested product migration SHA256: `5e07bc1ce41f236c0fd29ece8f9f15525c9e234e78f9a7a25ab22751082babdf`. Actual budget function definition MD5: `6e9254b145253d96940793fc6d09e2d2`.
- Static 52-function catalog compared with base: only `ops_control_private.budget_source_changed_v1()` changes `prosrc`, `definition`, `md5`; 51 other functions and the 13 other attributes remain exact. Actual `installed_supported_v1()` is true after all 155 full product migrations and again after negative-test rollback.
- All four inherited overlays were rehashed and still match Main's `scale004-worktrees.json`. No product migration, shared test/helper, applied migration, catalog attribute, permission, grant or architecture was edited by this chat.
- PR679 observed OPEN, head `4a1824097ec6e7e9f67d94dc056ff2a8f70bcab3`; #229 observed OPEN. These are intake observations, not final CI/head acceptance.

## Observed behavior

The original disabled scope was populated with five synthetic attempts: reserved, dispatched, pending, settled20 and released. A sealed journal retired its budget fence with revision100/stop90. Reconcile succeeded, kept the exact disabled scope and creation generation, removed fence ownership, and preserved settled/released evidence. Original drain released the reserved hold and moved dispatched to pending. The repeated-stop marker followed the two drain revisions, ending at revision103/stop103. Reconcile again left the ledger identical and advanced the original marker to104/104. Thus ledger/disable behavior is idempotent; the existing monotonic marker intentionally advances.

A direct exact disabled-to-disabled update left the entire fence unchanged. Within a transaction, replacement by the exact prepatch budget function body made original stop fail `OPS_UNAVAILABLE`; rollback restored the approved function and rows. This is actual before/after regression, without changing the product file or adopting unknown hashes.

Retired false-to-true, owner, creation generation, other valid scope field, tariff, attempt identity, settled charge rewrite and deleted-scope recreation all refused. Destructive ledger reset refused. Original known settlement retained duplicate/conflict rules, overrun freeze and foreign-owner refusal. An actual authenticated database role with an active synthetic Ops member could not resume the retired budget. Actual authenticated stop and actual service-role private reconcile were permission denied; actual service-role fresh reserve returned disabled. These checks used SQL claim fixtures, not GoTrue tokens or a provider.

Unknown budget function source and a renamed required hook made `installed_supported_v1()` false and reconcile refuse; each transaction rolled back, restoring exact installed support. A bad sealed digest refused. A valid maximum journal revision caused a late overflow refusal after earlier reconcile writes and restored the complete captured root/control/scope/fence/ledger snapshot. Trip and Proposal snapshots remained unchanged (both empty in this fresh fixture; no retained Trip preservation claim).

## Evidence and limits

- `proof.mjs`: runnable source-pinned proof. From this WT run `node artifacts/VPJ-37/v10-retired-budget-20261013/proof.mjs`; requires the owning session and cached immutable image.
- `proof.log`: 29 final PASS lines, zero skipped assertions, process exit0.
- `manifest.json`: actual source inventory, results, final retired fence/ledger and resource cleanup.
- `initial-harness-failure.*`: retained initial FAIL. Proof assertions were corrected for drain/repeated-stop revision accounting; a later combined test was moved below its snapshot initialization, and the field-mutation fixture was changed to satisfy the original CHECK constraint so it reaches the retirement guard. No product fix resulted from these harness issues.
- UNRUN: deliberately disabled-trigger injection, because delegation explicitly prohibits `TRIGGER disable`. Actual enabled hook catalog and renamed/missing-name refusal are observed; they do not substitute for that injection. No trigger was disabled or removed.
- UNRUN: full package restore/export/erase/source-write, Staging/Production, GoTrue, provider, device, human and TripProposal acceptance; outside this delegated budget scope.
- CI integration: no classified `tests/integration` file changed. The standalone `.mjs`/JSON proof artifacts select the existing conservative full profile (`unknown_dependency`) if included in a PR. This is a candidate evidence package for Main, not an unapproved CI classification change. Main can carry prose/log only or keep the full profile; no selector was weakened.
- Final local syntax and `git diff --check`: PASS. Required final-head review/CI and release remain Main-owned and UNRUN here.

## Cleanup and handoff

Fresh resource `vpj37-v10-retired-20261013-54d7ff49` used immutable `public.ecr.aws/supabase/postgres@sha256:86a2e078779e5bdccda1f6f6c5063aa9779a322d1fface5fb408d051909b230f`, pullnever, networknone, zero ports/mounts, postgres user, private0700 socket/data. Ownership and nonce labels were checked before SQL and removal. The final container is ABSENT and the owner-label resource inventory is empty. Earlier own failed-run resources were also cleaned by the proof's finally block. Other writers' containers, old lifecycle proof and Root diagnostic resources were untouched.

No additional product defect or source candidate was found. Budget source/catalog write lease can return to Main unchanged at the tested migration hash. Only this new proof directory is committed/pushed; four inherited overlays remain dirty and uncommitted. No new PR, merge, parent closure, external message or process remains in flight.
