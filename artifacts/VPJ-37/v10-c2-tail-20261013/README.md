# #229 W2 C2 tail — isolated source regression

Base: `77e7892dc26285ad85d3aac09035e168c084ab4a`; branch `codex/v10-w2-c2-tail-20261013`.
Owner: this delegated C2 tail chat; Main: `01a13311-9212-7db3-8c75-691eac0f03ea`.
Only this new artifact directory is committed. No shared product file, CI registry, original lifecycle evidence or other owner's resource was modified. No new PR or Issue close/merge.

## Result

- Original exact overlay baseline: **10 PASS / 4 FAIL** in `baseline-results.json`, `baseline.log`. Hidden text, withdrawn consent, revoked policy and unfinished original source could expose a historical done job or complete its original running job. Failures remain recorded.
- Final candidate: **19 PASS / 0 FAIL**, no skips, `candidate-results.json`, `candidate.log`.
- Full fresh **155 migration replay PASS** (154 original + the reviewed candidate for W2), ordered immutable SHA manifest in `candidate-replay.json`.
- Full candidate migration rollback restores prior function bodies and ACL exactly and leaves the new namespace absent: `candidate-full-migration-rollback.json`.
- Function-level candidate installation/rollback PASS. Fixed catalog remains enabled and all ten installed/recovery/schema/runtime/hooks checks return true: `module-caps-source-pins.json`.
- Physical model fetch **0**, budget attempts **0**. The refusal/pending/done paths used the actual `runGroundedAiAssistJob` TypeScript function with a throwing physical-fetch seam and credential/destination/lookup seams.
- Owned resource cleanup **PASS / ABSENT**, no in-flight process, writer scope released to Main. `cleanup.json`.

## Exact shared candidate for Main

Shared input migration SHA256: `5e07bc1ce41f236c0fd29ece8f9f15525c9e234e78f9a7a25ab22751082babdf`.
Candidate full migration SHA256: `42f2fd6c0117579bedb24aa1cf75659c0bb90eff8c32f7bd6b3cacfeae89afa1`.
Original read-only helper SHA256: `2d79e2166bc3e2161eab493dc1f3773417a3c51816fa7c4b317cc1e005464057`.

**Main has reported a newer source SHA `543e2617627fe7eddb8564ee4027e4c59cb986d77db2508da12a7a37ae633dea`, adding budget ACL repairs and role-name policy pins. Do not replace that source with this historical full-file candidate.** `logical-candidate.json` supplies the two exact before/after function definitions and metadata entries for Main to compose while preserving those newer managed fixes. `shared-migration-candidate.sql` is retained only as the full historical tested input against 5e07. `shared-candidate.sql` contains the equivalent isolated runtime installation used for the function-level rollback proof. `focused-diff.txt` shows the readable behavioral delta; two large fixed catalog entries are recorded exactly by their before/after JSON. No unknown hash was accepted.

The candidate:

1. Reuses existing `read_grounded_turn` historical owner/session/consent/task/source qualification in existing `read_grounded_ai_assist_context_v1`. This closes the missing consent and service-task/source gates without a new API or authority model.
2. Rechecks context before returning historical pending/done or accepting completion. Missing/ineligible original source returns `unavailable`; a genuinely answered/partial original remains `not_applicable` and never becomes fresh execution authority after source withdrawal.
3. Completion reads the identity, acquires the original source/turn fence, then locks and rechecks the job. The exact claim token, ID, terminal conflict and original-result readback remain.
4. Preserves the two original fresh ensure/reclaim closed-refusal paths. No immutable C2 execution/provider/budget source exists; no provider is borrowed from the original text policy and no new claim, job, fee, Task, Trip or Proposal is authorized.
5. Updates exactly the two affected `installed_supported_v1` catalog entries (52 entries remain). No grant, RLS, trigger, function-count, hash or recovery guard was disabled or relaxed.

The helper remains unchanged. Its owner must update its explicit migration source pin after Main applies this candidate; it will correctly refuse a changed migration until then. If Main has since changed the migration, do not copy this candidate over it: rebase the bounded guards/catalog against the new exact source and rerun the affected checks.

## Test scope and provenance

Network-none cached image: `sha256:86a2e078779e5bdccda1f6f6c5063aa9779a322d1fface5fb408d051909b230f`, PG17.6. No image pull, ports or mounts; user postgres, private data/socket 0700. Labels and immutable image/name checked before every database operation and cleanup. Resource/nonce is recorded in `resource.json`; all fixture databases were inside that sole owned container. Other containers were untouched.

Original grounded eligibility was produced through actual submit → ordinary owner consent → service claim/dispatch authorization → completion SQL. Published original factual coverage used ordinary, independent submit/review/publish RPCs; subsequent statement revocation changed current support to partial while the authoritative original answered outcome remained, and C2 stayed ineligible. Admin-inserted historical C2 jobs are explicitly synthetic fault injection; they do not establish genuine execution enrollment.

The final 19 cases cover exact refusal and zero effects, missing/foreign turn, valid historical pending/done, stale reclaim, foreign/wrong-token completion, absent consent/source, hidden text, withdrawn consent, revoked policy, incomplete original outcome, stale Auth session, original completion and repeated conflict, published original/source withdrawal eligibility, control-stop no new/reclaim/provider, eligible original completion after stop, ordinary anon/service/table ACL refusal, and SQL native login epoch replacement.

Native source review: `native-ai-assist-http.ts` rejects ambiguous browser/cookie inputs, verifies ordinary JWT through `verifyNativeCredentials`, reads `native_session_v2`, and compares subject/session before handing the same authenticated client RPC seam to the job runner. Native HTTP, GoTrue-signed JWT, external provider, target deployment, device and human acceptance are **UNRUN**. SQL session rows/claims and synthetic local policy are not evidence for those targets.

Read rules: repository AGENTS/HANDOFF/development workflow, the current V10 rules located at the existing `VP-V5-worktrees/DEVELOPMENT-RULES.md`, and C2 SQL/runtime contract sources. PostgreSQL main skill: `supabase:supabase-postgres-best-practices`. Actual Docker/Node/tools were available; no permissions/model/config/project settings were changed. The model ID was not independently exposed by a runtime metadata tool; inherited session settings were kept.

## Reproduction and remaining integration

On a fresh owned resource, choose a new random nonce and update `resource.json` with new name/socket/data (omit database for the initial postgres DB). Then run from the worktree:

```
node artifacts/VPJ-37/v10-c2-tail-20261013/fixture.mjs prepare
node artifacts/VPJ-37/v10-c2-tail-20261013/fixture.mjs replay candidate
node artifacts/VPJ-37/v10-c2-tail-20261013/proof.mjs candidate
node artifacts/VPJ-37/v10-c2-tail-20261013/capture.mjs
node artifacts/VPJ-37/v10-c2-tail-20261013/fixture.mjs cleanup
```

The candidate generation script retains exact original function snapshots and source pins; it cannot accept another migration SHA. Existing cluster-role verification is used only for additional empty databases inside the same owned container. Product migrations are replayed without source rewriting.

Fixture-authoring repairs (wrong task schema/URI, consent column, void RPC parsing and candidate catalog-string generation) were fixed before final evidence. The actual baseline four source failures are preserved separately; intermediate candidate consent failure was resolved by the full existing historical qualification chain. No final result is inferred from the older setup failures.

Main still owns candidate application, helper pin integration, exact integrated-head formal review, required CI and PR679 merge. This artifact commit alone does not complete #229, activate C2 execution, or establish any target-environment acceptance.
