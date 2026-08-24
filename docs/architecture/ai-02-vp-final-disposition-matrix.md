# AI-02：VP-Final 资产处置与高质量迁移矩阵

- Issue: [#4 AI-02](https://github.com/JTCAO515/VP-V4/issues/4)
- V4 baseline: `2dec7b0cbe3929eefac96997ed7e30d9db852727`
- Legacy evidence baseline: VP-Final `b5ef081f5e5766a59c547454f297acc69e908c56`
- Status: `implemented` as a migration-disposition artifact; it is not a runtime implementation or an accepted replacement for the pending R0 operator decisions.
- Owner: Codex for the matrix and later V4 implementation; operator retains DEC/ADR, account, region, retention, contract, deployment, and public-promise decisions.

## Objective and boundary

The V4 AI Core starts from a frontend-only landing page. VP-Final contains useful behavior and test evidence, but it is a different system with a multi-app workspace, pre-existing persistence assumptions, and historical provider/runtime defaults. This matrix prevents directory-level copying.

Every legacy asset receives exactly one disposition:

1. `reuse-contract/test` — carry a behavior invariant or fixture into a new V4 contract suite; do not copy the old implementation.
2. `port-behavior` — preserve an observed user/domain behavior through a new V4 owner and interface.
3. `rewrite` — implement a new V4 boundary after the required R0 decision or contract is accepted.
4. `retire` — do not migrate the behavior, data, UI, configuration, or default.

This issue does not copy source directories, migrations, environment files, secrets, production data, provider defaults, or public product claims. It does not activate Supabase, a model provider, a queue, an external-data provider, or an Ops deployment.

## Source inspection evidence

| Legacy evidence | What was verified | V4 implication |
| --- | --- | --- |
| `packages/domain/src/trip/index.ts` and `index.test.ts` | Typed `TripPatch`, deterministic `applyPatch`, duplicate day/block rejection, and deterministic `diffTrips` tests exist. | Preserve these invariants as new V4 golden contracts; V4 schema remains pending AI-03. |
| `apps/server/src/modules/trip/versionedService.ts` and tests | A version check happens before deterministic patch application; conflict behavior is tested. | Carry CAS/retry/conflict behavior, but implement it only in the V4 `TripWorkspace` transaction after actor/RLS and schema decisions. |
| `apps/server/src/modules/copilot/service.ts` and `router.test.ts` | The historical Copilot path has `demoDialogueOnly`; its test configuration does not prove a live model-to-Trip writer. | Do not claim or port a working Chatbot write path. V4 replaces it with buffered validated `AssistantTurn` plus immutable `TripProposal`. |
| `apps/server/src/modules/knowledge/service.ts`, `apps/server/src/db/knowledgeService.ts`, and review tests | Draft/reviewed fact lifecycle, version checks, review queue and evidence gates exist. | Preserve reviewed-fact eligibility and negative tests; rebuild the V4 Knowledge contract around canonical Fact, EvidenceReceipt, and candidate-first import. |
| `packages/domain/src/knowledge/seed.ts`, `createInMemoryKnowledgeService`, `apps/web/src/app/explore/*` | Static POI seed data and public Explore/SEO consumers are present. | Do not import static seeds or publish them in V4. Explore must consume V4 reviewed projections only. |
| `apps/ops/src/app/api/knowledge/*` and bulk-import tests | Import/review/audit flows have useful permission and review behavior. | Preserve behavior as an eventually separate protected Ops surface; no public-Web privileged route is copied. |
| `apps/server/src/db/schema.ts`, versioned DB services, and ADR-0004 | Existing migrations/RLS/CAS patterns are evidence, not a V4 database lineage decision. | Rebuild migrations after DEC-04/AI-04; migrate tests only after V4 actor and ownership contracts freeze. |
| `packages/ai/src/providerInventory.ts` and Copilot model runtime | Provider inventory and model defaults are historical candidates. | Rewrite under V4 ModelGateway conformance; no provider name, model alias, key, region, or retention default is inherited. |
| `apps/web`, `apps/server`, `apps/ops`, `apps/mobile`, shared packages | VP-Final is a four-app workspace/monorepo. | V4 remains a modular Next.js monolith until independent Ops/worker deployment evidence is accepted. |

## Disposition matrix

| ID | Legacy asset and consumer | Disposition | V4 owner and seam | Required migration evidence | Not migrated / failure risk | Follow-on Issue |
| --- | --- | --- | --- | --- | --- | --- |
| M-01 | `TripPatchSchema`, `applyPatch`, `diffTrips`; consumed by Trip API, Copilot, mobile sync | `reuse-contract/test` | `TripWorkspace`: `createProposal`, `confirmAndApply`, `applyUserEdit` | Golden fixtures for create/update/delete, duplicate IDs/day numbers, deterministic diff, invalid patch rejection | Legacy `TripState` shape, implicit fields and direct client forms are not copied | AI-03 #5, AI-09 #11, AI-10 #12 |
| M-02 | In-memory and DB versioned trip services; consumed by server trip router | `port-behavior` | `TripWorkspace.confirmAndApply(actor, proposal)` | Owner isolation, expected-version conflict, atomic event/snapshot/receipt, reload and idempotency tests | In-memory behavior is not persistence proof; no old table/migration reuse | AI-04 #6, AI-10 #12, AI-14 #16 |
| M-03 | `CopilotEnvelopeSchema`, execution safety and policy evals | `reuse-contract/test` | `TurnCoordinator` and response validator | Preserve malformed-envelope, unsupported claim, invalid patch, citation and policy-negative fixtures where compatible | The old envelope lacks the V4 `AssistantTurn` card/proposal boundary; no schema is accepted by this matrix | AI-03 #5, AI-12 #14, AI-20 #22 |
| M-04 | `demoDialogueOnly` and direct Copilot completion path | `retire` | None | Regression check confirms V4 has no demo flag that implies model-generated Trip persistence | A dialogue demo could be mistaken for a durable AI workflow | AI-12 #14 |
| M-05 | Fact eligibility, scoped facts and review policy tests | `reuse-contract/test` | `KnowledgeSystem.resolveEvidence` and shared eligibility view | Candidate/draft/expired/deprecated/license-blocked negative fixtures; reviewed/current positive fixture | Existing POI-only taxonomy does not define V4 Fact/EvidenceReceipt/ExternalEntityRef | AI-11 #13, AI-18 #20, AI-22 #24 |
| M-06 | In-memory knowledge service, `INITIAL_POIS`, static Explore and SEO seed consumers | `retire` | None | V4 tests assert candidate/draft data cannot become Chat, Canvas, Explore or SEO truth | Seed data could create unsupported coverage or bypass human review | AI-24 #26, AI-27 #29 |
| M-07 | Knowledge import, review queue, audit and private bulk-import behavior | `port-behavior` | `KnowledgeSystem.prepareImport/commitImport/reviewAndPublish` | Private candidate, dedupe/identity, reviewer-only publication, expiry and append-only audit tests | No inherited Ops app, roles, routes, database records or service key | AI-23 #25, AI-24 #26, AI-25 #27 |
| M-08 | Database schema, RLS and ownership ADR/tests | `rewrite` | ActorResolver + V4 Supabase/Postgres boundary | New actor matrix, migration, RLS, fault-injection and restore fixtures after DEC-04/DEC-05 | No historical migration or policy SQL is copied; no database is created in AI-02 | AI-04 #6, AI-08 #10, AI-14 #16 |
| M-09 | Provider inventory, model runtime and completion worker | `rewrite` | `ModelGateway.invoke(taskRequest, signal)` | Provider-specific protocol/schema conformance, bounded repair/fallback, trace/cost and region/retention gates | No old provider key, alias, cost setting, queue, or production assumption | AI-16 #18, AI-17 #19 |
| M-10 | Full `apps/web`, `apps/server`, `apps/ops`, `apps/mobile` monorepo topology | `retire` | V4 modular monolith | Architecture test/review confirms new code stays under V4 owner modules; separate deployment needs an accepted trigger | Directory-level copy recreates obsolete deployment, permission and coupling assumptions | AI-01 #3, AI-25 #27, AI-26 #28 |
| M-11 | Public Explore presentation and commercial/outbound surfaces | `retire` | None until reviewed Fact and partner gates exist | No static POI, availability, partner, inventory or SEO page is emitted from legacy data | Unsupported local facts or commercial claims could leak into public V4 UI | AI-27 #29, AI-28 #30, AI-29 #31 |
| M-12 | Existing browser, unit, integration and eval harness conventions | `port-behavior` | V4 test/eval command set | Add only tests that exercise a frozen V4 interface; record L1–L7 evidence and explicit unrun gates | Existing green tests do not prove V4 runtime, provider, RLS or product behavior | AI-07 #9, AI-15 #17 |

## Explicitly prohibited migrations

- No directory-level copy from VP-Final.
- No copied environment files, `.env*`, secrets, Supabase identifiers, service roles, provider keys, model aliases, rate limits, retention defaults, payment configuration, or production data.
- No direct model or Copilot write into Trip state. V4 writes only after validated immutable proposal, user confirmation, version revalidation and deterministic transaction.
- No `demoDialogueOnly` path represented as AI runtime evidence.
- No static POI/Explore/SEO seed or public coverage claim.
- No inherited four-application deployment shape; no public Web application receives Ops privileges.
- No unreviewed content, expired fact, candidate, raw provider payload or user artifact becomes a public Fact, RAG claim or Trip value.

## V4 implementation order

1. **Operator gate:** AI-01 records DEC-01–DEC-11 and accepts the R0 ADR baseline. Until then there is no runtime write path, provider flow, database lineage or public capability change.
2. **Freeze contracts:** AI-03 defines the V4 Turn/Evidence/GroundedClaim/TripProposal types; AI-04 and AI-05 define actor, RLS, retention and purpose boundaries.
3. **Migrate contracts first:** AI-09 and AI-11 import only adapted golden fixtures for TripPatch and Fact eligibility.
4. **Reimplement behavior:** AI-10/AI-12 produce the durable fake-model tracer bullet: reviewed fixture -> validated turn -> proposal -> confirm/apply -> reload/audit.
5. **Expand only through gates:** model, RAG, import, Explore, media and external-data work remain blocked by their parent Issues and operator/contract decisions.

## Acceptance and rollback

### AI-02 acceptance evidence

- Each matrix row has one and only one allowed disposition.
- TripPatch/CAS, Fact eligibility, import/review/audit, model routing and Explore/monorepo evidence link to an inspected legacy path and a V4 owner seam.
- `demoDialogueOnly`, static Explore seed, full monorepo topology and unreviewed provider defaults are explicitly retired.
- The migration sequence begins with golden contracts and accepted V4 interfaces, never implementation copying.
- The matrix does not assert that Chatbot, Canvas, database, RAG, Explore, model, media or external-data runtime exists.

### Verification commands

```bash
git -C /Users/jtcao/VP-Final rev-parse HEAD
rg -n "applyPatch|expectedVersion|demoDialogueOnly|INITIAL_POIS|createInMemoryKnowledgeService" \
  /Users/jtcao/VP-Final/packages /Users/jtcao/VP-Final/apps
pnpm check
git diff --check
```

### Rollback

Revert the commit that adds this matrix. No runtime schema, migration, account, secret, provider, external data or user data is created by AI-02.

## Residual blockers and next action

- AI-01/#3 remains `ready-for-human`: DEC-01 through DEC-11 require operator decisions. AI-02 cannot substitute for them.
- The next runtime-capable work starts only after the resulting R0 ADR and contract frontier are accepted and labelled `ready-for-agent`.
- Until then, this matrix is the authoritative guard against legacy-copy drift for all later Issue lanes.
