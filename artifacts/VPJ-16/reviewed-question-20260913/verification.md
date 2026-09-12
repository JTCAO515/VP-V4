# Explicit first-party question in native Ask

2026-09-13; baseline main d2360fc. Related to #206, no Issue closed.

The visible result is one explicitly selected boarding-document question for adult
foreign-passport domestic railway e-ticket journeys. The server evaluates two required
relations against current published information. Native keeps reliable partial content,
all conditions/exclusions and source locators, with observed missing/revoked/expired or
unresolved-variant reasons. This is a read-only first-party entry, not free-form question
interpretation, a saved ServiceTask, model execution or complete S2 acceptance.

## Observed locally

- PostgreSQL9/9, zero skips: full40-migration disposable database, migration rollback,
  authenticated-only function, default-off switch, closed input/scope, missing/partial/
  bilingual complete projections, corroborating publications, differing Chinese qualifiers,
  revoked/expired content suppression, capacity50→51 failure and session loss. A controlled
  advisory barrier publishes after the old base reader has run; the exact answer function
  then holds that new row's revocation lock until its read transaction ends. Auth/session
  fixtures here are SQL claims, not GoTrue/JWT evidence. See database.log.
- Actual separate disposable Supabase40/GoTrue/Next native credential/API suite9/9, zero
  skips: real credentials/login, first-party question read in both languages, payment notes
  cannot cover rail, extra query/Cookie/Origin rejection, complete→withdrawn partial→expired
  no_answer, disabled503 and old credentials401 after logout. Source metadata and all
  qualifiers preserved. Original publication/audit regressions also pass. Synthetic source
  content and test accounts only; no external model. See api.log and publication.test.mjs.
- Native8/8 unit tests: previous lifecycle/expiry checks plus required-claim/fact/relation/
  question/version/outcome validation and honest partial results. See native-unit.log.
- Native4/4 bilingual UI checks: prior Explore credential refresh/read/withdraw/disable and
  new Ask question answered→partial→expired→disabled. No read before opening the question;
  switching to Profile for32 seconds causes no hidden refresh. The final navigation-title
  correction also passed a separate final English question check1/1 including the32-second
  hidden-tab observation; final build passed. See native-ui-final.log.
- Contracts253/253, static22/22, production build, lint250 files and typecheck PASS. No Web
  UI changed; existing Web publication browser evidence is not relabelled as a new browser run.
- Independent permission/data review:0Critical/0Important after fixing both findings below.
  Final reviewed SQL SHA256 5bc653c2555311658c58a9d13b06105b8ae1800b09f1cbb545ad629b0a90c2e4;
  NativeAskView SHA256 5749587b104d2790ff73b04cfed003f0d85269aa8a8821c151df82a59e3f4e5f.

## Corrections and evidence limits

The first SQL harness lacked Supabase's extensions.pgcrypto setup; a subsequent race-test
attempt omitted the existing barrier helper's timeout. Both original failed logs are retained.
Neither was a target-environment pass. The final database test includes the real race and
capacity cases, rather than retaining an unexecuted assertion.

Review found that rereading publications after the base reader could include a newly
published row without its revocation lock. The answer now freezes its own FOR SHARE set.
Review also found missing visibility propagation to the question destination; Ask tab and
explicit navigation state now both gate reads. The final4 UI checks include a32-second
hidden-tab observation. Screenshot inspection caught the reused Explore navigation title;
the question uses Ask while the existing reader keeps Explore.

Raw logs and xcresults are under
`/Users/jtcao/Library/Caches/visepanda/reviewed-question-20260913` and the sibling
`claim-selection-merge-20260913` cache. Repository logs trim trailing whitespace only;
raw-log-hashes.json records their original hashes. Screenshot captures show synthetic content,
not a real train/operator acceptance. Physical device, VoiceOver, maximum text, real train
boarding and free-form semantic evaluation remain UNRUN for this slice.

## Delivery and next acceptance

PR CI and actual Staging40 question/native integration are pending at this checkpoint.
Current Staging was verified at39,6 users/3 Trips,11published/1revoked, read+Ops off and0active
members. A fresh encrypted backup and isolated no-network restore passed; no remote schema
change or read window was activated for this checkpoint. Supabase MCP lacked project access;
the already configured, target-checked official CLI connection verified the same authorized
Staging project. Production remains protected and unchanged.

Continue guarded Staging integration and required PR checks, then the broader durable Ask
grounding/history task. No factual text is persisted or sent to a model by this read-only path.
