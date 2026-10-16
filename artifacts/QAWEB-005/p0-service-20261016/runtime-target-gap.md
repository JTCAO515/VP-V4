# Confirmed runtime target binding gap — before implementation lease

Exact reviewed integration source: `c0ef6edefcc2ac63ed665d14305cca1ad541504f`.
The files below are unchanged from this owner's base `5e960e6d`; no target
DB/provider/host call was made. This corrects the scope of hosted-composition.md:
the executable pipeline exists, but its deployment actor tuple is not bound at runtime.

## Reproduced causal chain

- `validate-qa-target.mjs:8–23` validates package ownerId/policyId/scopeId/noticeHash
  as closed offline metadata. `--emit-runtime` at line 47 emits only profile and endpoint.
- `ecs-worker-files.sh:128–132` consumes those two lines, then passes only profile,
  Qwen endpoint and project ref (plus operational flags) to the actual worker.
- `run-hosted-text-worker.mjs:31–33,87–103` validates project ref but has no
  trusted actor/policy/scope/notice tuple to pass to the hosted dependencies.
- `hosted-text-worker.ts:379–397` sends discovery only limit/model/priceVersion/
  endpoint, then accepts the returned group through `planQaGroup`.
- `qa-agent/hosted-profile.ts:60–64` selects owner/policy/scope from that group.
  `qa-agent/worker.ts:31–38,52–54` protects those job-selected identities and DB
  target, but never compares them with the approved offline tuple.
- `qa_ready_groups_v2` in QA migration lines 703–740 qualifies original policy/
  consent/budget, but has no approved owner/policy/scope/notice inputs. Its LIMIT
  follows broad qualification. groupLimit=1 is not actor selection.
- `qa_authorize_dispatch_v1` rechecks the original lease/policy/budget/context;
  it does not prove equality to the approved deployment tuple. Policy notice is
  immutable in the original policy schema, but the runtime has never established
  that its policy ID is the approved one or that its hash equals the package.

Local direct reproduction using the real `parseQaHostedProfile`/`planQaGroup`:
valid `/4` profile, groupLimit=1, an approved synthetic tuple A and a qualified
synthetic returned group B differing in all three IDs. Result: B produces a
non-null executable `qa-agent-worker/2` job. The approved noticeHash is not even
a planner parameter. Assertions PASS; network calls=0. No assertion that B is
unauthorized by SQL: the defect is B is not the operator's approved deployment
actor, even if independently eligible in the shared database.

## Minimal repair interfaces for Main to assign

1. Preserve the canonical target/2 package; emit an additional **nonsecret closed
   runtime binding** from its existing validator, then installer passes that
   binding into CLI. Require exact projectRef + ownerId + policyId + scopeId +
   noticeHash, with a version discriminator. No keys, default/latest fallback or
   actor inferred from returned discovery.
2. CLI parses the binding and supplies it as independently trusted hosted
   dependencies. `/4` without it fails before discovery/claim. Legacy /1–2
   remain unchanged; /3 stays historical-only.
3. `planQaGroup` rejects any returned owner/policy/scope/hash mismatch; worker
   construction independently checks job against this trusted binding, not
   merely against its own selected IDs. Preserve unique matching-scope checks.
4. Protected discovery must filter the approved tuple **before LIMIT**, including
   actual immutable policy notice_hash. Main can choose a new exact versioned
   discovery port or a reviewed compatible change; this owner proposes no edit
   to the old applied migration. Post-LIMIT JavaScript filtering alone can
   starve the approved actor and is insufficient.
5. Protected dispatch must independently verify the approved tuple. Minimal
   adaptation can inject the trusted tuple in the worker RPC adapter while
   retaining the context owner's existing logical authorization port. Main
   must choose/lease the append-only SQL seam and any context port change; do
   not widen the accepted actor set or enable the global switch to test it.
6. Required negatives: missing/malformed binding, every individual foreign tuple
   field, foreign qualified older group before the approved actor with limit1,
   duplicate/foreign budget scope, changed notice, and dispatch-time mismatch.
   Prove no claim/provider/budget dispatch for foreign scope; preserve original
   lifecycle/identity/unknown-ACK contracts and legacy tests.

## Ownership / exact before pins

This owner may implement `lib/server/qa-agent/**` and dedicated service tests.
Main retains the following shared seams until explicit exact lease; deploy
validator/installer belong to original deployment owner `01a13387`. Context
adapter remains original context owner. DB migration/GRANT/RLS belong to Main.
No shared edit is made or implied by this proposal.

| Path | SHA256 at c0ef6ede |
| --- | --- |
| deploy/hosted-worker/validate-qa-target.mjs | e4e45e84022ca735f99cf573f2642940f62c6bf86582c600dcb32d141a01b1a0 |
| deploy/hosted-worker/ecs-worker-files.sh | 8cfa236a42bdcde9132b3da5a812a962597672da3c78f66cdd15039f44a2dfa3 |
| lib/server/jobs/run-hosted-text-worker.mjs | 1ecff7560372319f32658b55da996d61e653e5e5aac5ffddcc1fbf14e952add9 |
| lib/server/jobs/hosted-text-worker.ts | eec95793a5591563f225f0f9af815515aac9a9c27ddc30668611193697ac1a31 |
| lib/server/qa-agent/hosted-profile.ts | 70958ae30f8dc17fa8bf21a20fdda45e7167e6d8e83e909732ec41667b1903f5 |
| lib/server/qa-agent/worker.ts | c34785aa897de3a36d315644b969c159ee447dbb8cdbdc43b7cbd0cd33287a4e |
| supabase/migrations/20261013050429_qa_agent_web.sql | 73b6fa9ee63ad48bdff43da4a1f88ddf19e28e46786948e30314a111bb25285d |

Patch/after hashes will be generated for the exact leased implementation;
none are invented for this interface proposal. Actual target writes/start/
provider remain STOP. The separate minimum-SQL closure analysis continues.

## Exact proposed contract for lease confirmation

- Env: `VISEPANDA_QA_RUNTIME_BINDING`, JSON with exactly
  `{schemaVersion:"qa-runtime-binding/1",projectRef,ownerId,policyId,scopeId,noticeHash}`.
  Produced from validated target/2, emitted as the third line after profile and
  endpoint, never derived from a discovery group. IDs canonical lowercase UUID;
  hash exactly 64 lowercase hex; project ref must equal the approved profile/root.
- Owned module candidate: `lib/server/qa-agent/runtime-binding.ts` exports the
  closed immutable binding parser/type. `HostedWorkerDependencies.qaBinding`
  is optional for legacy profiles and required for `/4`; this is independently
  supplied to planner and `QaWorkerDependencies`, with missing/mismatch rejected.
- New append-only SQL candidate:
  `public.qa_ready_groups_v3(p_limit integer,p_model text,p_price_version text,p_endpoint text,p_owner_id uuid,p_policy_id uuid,p_scope_id uuid,p_notice_hash text)`.
  Preserve original qualification; filter exact owner/policy/notice before LIMIT,
  retain original unique matching-scope requirement and verify its ID equals
  p_scope_id. Return noticeHash from the real protected policy for defense in TS.
- New append-only SQL candidate:
  `public.qa_authorize_dispatch_v2(p_turn_id uuid,p_lease_token uuid,p_scope_id uuid,p_policy_id uuid,p_provider text,p_context_digest text,p_owner_id uuid,p_notice_hash text)`.
  Lock/check the actual immutable policy row and protected lease owner/policy
  against supplied tuple, then call original `qa_authorize_dispatch_v1` in the
  same transaction, retaining original budget/lease/context/dispatch semantics.
  The existing notice authority is `turn_private.text_policies.notice_hash`,
  protected by `immutable_text_policy` (only revocation updates allowed).
- QA worker adapter can translate its existing logical
  `qa_authorize_dispatch_v1` request to physical v2 and inject p_owner_id and
  p_notice_hash from the independent trusted binding. Existing scope/policy
  params must equal it. Context composer stays untouched; original logical v1
  API is not rewritten or globally upgraded.
- Main allocates the new migration timestamp and exact SQL/role scope; this
  proposal does not grant any SQL writer or new function privilege. Old v1/v2
  functions, old QA migration, root profiles and all non-QA modes remain intact.
