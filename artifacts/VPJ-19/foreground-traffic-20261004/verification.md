# #366 foreground server delivery — 2026-10-04

Base main: `8d30d0ba645552e6de3251e4d76ba09a78d652b1`.
Product source: `349080d9d0c6252e35f5ac49f48fd2752b7cd7f3` then
`f3fa1ec32eee6b2aa72be03170854c751210a95b`.
Fixed SQL dependency owned elsewhere:
`b58ae380d923bf56cf908f6964dbc14c3a7b03d7` (040000).
The backend changes are committed; Native UI and whole #366 closure remain
with Main and the separately assigned Native task. No micro PR was created.

## Actual local evidence

- PASS: initial observation service contract run, 9 tests, 0 skip on the first
  source. Preserve that scope; it is not target/provider evidence.
- PASS: affected service checks after SQL coupling and mode filtering, 4 tests,
  0 skip: actual mock fixed fetch chain, network uncertainty, concurrent stop,
  and only permitted whole-mode dispatch.
- PASS: final authority contract run, 5 tests, 0 skip: existing policy evaluator,
  closed receipt scope/date/fields, restricted producer versus owner transport,
  serialized request accounting, default missing capability, and policy-free
  scope epoch read before a single CAS stop. JSONB key order and UTC timestamp
  formatting are compared by structure/instant, not treated as origin evidence.
- PASS: actual Native/Web HTTP contract test, 1 test, 0 skip; synthetic signed
  user JWT and intercepted SDK/provider HTTPS only. It exercises ordinary RLS
  readers, separately held synthetic producer credentials, five ordered SQL
  request guards without double quota, no TMC grant/no TMC request, Web cookie
  identity/origin, invalid caller actor input, stale Trip and confirmed-Trip
  owner context without a pending Proposal. Provider calls are fixture calls.
- PASS: context contract, 2 tests, 0 skip: readable original user title and
  current typed address support, absent display source, closed scope input,
  24-item cap/partial labels and actual stop epoch metadata.
- PASS: TypeScript after final runtime source; source policy lint (553 files),
  documentation baseline and whitespace checks.
- PASS: production build for `f3fa1ec3`, including all four observation/context
  Native/Web routes. Build uses default environment; no API/provider activation.

Actual commands: `node --experimental-strip-types --test` with the named
`tests/contract/maps/foreground-traffic*.test.mjs` files; affected service run
used `--test-name-pattern='single-mode|actual Maps fetch|network uncertainty|concurrent explicit'`.
Also `pnpm typecheck`, `pnpm lint`, `pnpm docs:check`, `pnpm build`,
`git diff --check`. Unchanged Maps/old DB matrices were not repeated.

## Preserved failures

Initial typecheck failed: native Trip adapter has no `getTripPlaces`, Web
adapter has no `readArchive`, and typed route-result unions needed unknown
decoding. Fixed via ordinary JWT RLS reads, existing archive operations,
NextResponse and defensive unknown decoding. Subsequent typechecks passed.

The first new cross-layer run was 3 PASS / 2 FAIL / 0 skip. Both were test
fixture errors: policy decode test omitted the selected mode; the provider
fixture asserted a route `show_fields` value on a detail request. Fixed
fixtures; the rerun was 5 PASS / 0 FAIL / 0 skip. Do not describe those as
observed provider or SQL failures.

SQL owner-reported PG evidence is separate: core 8 PASS, lifecycle 3 PASS,
and affected unknown-budget/threshold/source checks passed on its own fixed
version. This task read the actual SQL source but did not claim those runs as
its own joint TS/Postgres evidence. Whole-result integrator owns joint checks
and registration of the gated PG test.

## Runtime boundaries

UNRUN: target migrations, current account capabilities, installed source/policy
and producer-role grants, real map provider, actual device/Web UI, full R2
Proposal confirmation, and D2 export registration. Real provider traffic 0;
new credentials/keys/policy seeds/role activation/target writes 0.

Working keys/flags do not grant display/cache/persist/derivative rights. Missing
rights/capability denies before provider dispatch. No original provider JSON,
polyline or trajectory is persisted by this code; instance summaries have
timed expiry. Query completion time is `fetchedAt`, supplier observation time
is null. Current route estimates/TMC aggregate changes never claim closures,
incidents, live arrivals or future forecasts. Ordinary owner receipt/source
qualification and the original SQL confirmation transaction remain separate
from server producer ACK. Only Main's complete UI/source scope audit can close
whole #366. Disabling the foreground flag rolls back new calls without Trip
mutation or changes to applied migrations.
