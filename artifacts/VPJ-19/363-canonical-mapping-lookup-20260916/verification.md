# #363 (VPJ-19) verification — real canonical-mapping lookup

Scope: `lib/server/maps/canonical-mapping-repository.ts`. Addresses the
concrete gap behind the still-open "地图、列表、详情共享选中ID"
acceptance bullet: `searchPlaces()`/`nearbySearch()` have always required
a caller-supplied `lookupMapping: (provider, providerPoiId) => string |
null`, by design, but no real implementation existed anywhere in the repo
before this change — every call site (including both adapters' own
contract tests) supplied a hand-written in-memory mock. Without a real
`provider_poi_mappings` lookup, a search/nearby result's
`matchedCanonicalPoiId` could never be genuinely non-null outside a test.

Class: A (reversible, repo-only, pure server code — no schema/migration
change, no RLS change, no new provider credential, no secrets committed,
no live provider or live Supabase call made in this environment).

## What was implemented

- `loadCanonicalMappingLookup(client, provider, providerPoiIds)` — takes a
  caller-supplied `SupabaseClient` (mirrors
  `lib/server/model-gateway/budget/supabase-rpc.ts`'s
  `createSupabaseBudgetRpc(client)` factory pattern; this module never
  constructs its own client or reads credentials itself) and every
  `providerPoiId` already present in an adapter's response, and returns
  `{ lookupMapping, dbError }`.
- `lookupMapping` is a **synchronous** `(provider, providerPoiId) =>
  string | null` closure over an in-memory `Map` built from one batched
  query — the exact shape `searchPlaces()`/`nearbySearch()` already
  require, so neither existing adapter changes. Batched because the
  adapters call `lookupMapping` once per response row while normalizing an
  already-fetched provider response; a live per-row DB round trip would be
  both the wrong shape (synchronous, not async) and needlessly slow.
- The query: `provider_poi_mappings` filtered to `provider = eq.<provider>`
  and `provider_poi_id = in.(...)`, after deduplicating the input ids and
  dropping any id outside the migration's declared 1-128 char bound
  (`20260914100000_vpj_19_363_place_identity.sql`'s `provider_poi_id`
  check constraint) — never sent to the database, not merely filtered from
  the result.
- A DB error (network failure, malformed row, service-role
  misconfiguration) collapses to "no known mapping" for every id in that
  batch and is never thrown — the same "unknown when unavailable, never
  guessed" posture this slice already uses for entrance data and
  coordinate systems. It never turns into a search/nearby failure, since
  the underlying provider result is still valid without a canonical
  match. `dbError: true` on the return value lets a caller that cares
  (logging, retry policy) distinguish "checked, no match" from "could not
  check" without changing the synchronous lookup function's own
  `string | null` contract.
- `provider_poi_mappings` is service-role-only (RLS enabled,
  `anon`/`authenticated` fully revoked by the migration) — a caller must
  supply a server-authorized client, never a request-scoped user client;
  this module does not itself enforce that (it cannot: it only receives
  the client, never constructs one), so the module doc says so explicitly.

## Still not a consumer

No route in `app/api/places/**` calls this yet — `app/api/places/` does
not exist anywhere in this repo. This change makes `lookupMapping` real
for the first time; wiring a genuine HTTP producer/consumer pair (with
the auth/session/budget handling a request-facing route needs) remains a
separate, larger future slice and is not claimed as done here. `#363`'s
other remaining acceptance bullets (single primary map-display SDK,
server/native/Web credential domain separation, observation-vs-Fact
permission isolation) are unchanged and still open.

## Commands and results

| Command | Result |
| --- | --- |
| `node --experimental-strip-types --test tests/contract/maps/canonical-mapping-repository.test.ts` | 7/7 pass |
| `node scripts/run-ci-suite.mjs contract` (`pnpm test:contract`) | 512/512 pass, 0 fail, 0 skip, 105 test files (includes this slice's 7 new tests) |
| `pnpm typecheck` (`tsc --noEmit`) | clean |
| `pnpm lint` | 306 files checked, clean |
| `pnpm build` (Next.js production build) | succeeds |
| `pnpm test` (static-output/design suite) | 22/22 pass |
| `pnpm test:unit` | 100/100 pass, 0 fail, 0 skip, 13 test files |
| `pnpm test:integration` | 23/99 pass, 76 skip, 0 fail, 34 test files — pre-existing env-gated skips (live Supabase/provider dependent); this change touches no integration test path |
| `pnpm test:security` | 146/147 pass, 1 skip, 0 fail, 52 test files — pre-existing env-gated skip; this change touches no security test path |
| `pnpm test:e2e` | 34/34 pass (source/contract inspection only, no browser) |
| `pnpm evals` | 15/15 test files pass |
| `pnpm check:flags` | passed (2 R1 flags) |
| `pnpm check:assets` | passed (49 ledger records, 9 blocked preview files) |
| `pnpm docs:check` | VPJ plan (76 tasks) + AI Core/VPJ baseline pass |
| `git diff --check` | clean |

## Verified by test (deterministic, mocked `SupabaseClient`, no live DB)

Following `tests/contract/cost/supabase-budget-rpc.test.ts`'s pattern of
injecting a stub `global.fetch` into a real `createClient(...)` so the
PostgREST request shape itself is exercised, not just the wrapper logic:

- An empty id list never dispatches a request and returns an always-null
  lookup (`dbError: false`).
- The dispatched request is scoped to `provider_poi_mappings`, filtered by
  `provider=eq.<provider>` and `provider_poi_id=in.(...)`, deduplicated —
  verified against the actual PostgREST query string, not a mock of the
  query builder.
- A `provider` argument that does not match the batch's own provider never
  returns another provider's match (defense against a caller mixing up
  which provider a batch was loaded for).
- A DB/transport error (403 response, or a thrown network failure) both
  collapse to `dbError: true` with every lookup answering `null` — never
  throws, never guesses a match.
- Malformed rows (missing field, wrong type, `null` row) are skipped
  rather than crashing the batch or producing a spurious match.
- An id longer than the migration's 128-char bound is dropped from the
  outgoing query rather than sent.

## Explicitly UNRUN — not fabricated

- Any live Supabase call against a real `provider_poi_mappings` table —
  no local or hosted Supabase instance is available in this environment.
  The query shape is verified against the actual `@supabase/supabase-js`
  request the client library builds (see above), not merely asserted.
- Consumption by an `app/api/places/**` route, UI, or native client —
  none exists yet in this repo. `#363`'s "地图、列表、详情共享选中ID"
  bullet needs that route in addition to this lookup to be genuinely
  satisfied; this slice only removes the missing-implementation blocker.
- Any change to `searchPlaces()`/`nearbySearch()` themselves — both are
  untouched; this slice supplies a real value for a parameter they
  already accepted.

## Files changed

- `lib/server/maps/canonical-mapping-repository.ts` (new)
- `tests/contract/maps/canonical-mapping-repository.test.ts` (new, 7 tests)
- `docs/contracts/place-identity.md` (documents the addition, updates
  "Non-goals")
- `artifacts/VPJ-19/363-canonical-mapping-lookup-20260916/verification.md`
  (this file)

## Label/scope note

`#364`, the next issue in the `maps-20260913` delivery-supplement queue
(`docs/program/2026-09-05/issue-plan.json`), was evaluated this round and
found not safely sliceable in one round: its own acceptance bullets need
a route/matrix/directions provider capability that does not exist
anywhere in this repo (no `route`/`directions` adapter — only
search/detail/geocode/suggest/nearby exist), and its acceptance also
requires a "真实两端演示包含定位拒权、无路线、超时、过期、起终点错误"
(real two-end demo of permission denial/no-route/timeout/expiry/wrong
endpoints) that this environment cannot produce as genuine evidence. Its
formal blocker, `#363`, is also not "in fact" satisfied yet: three of its
five acceptance bullets remain open (shared selected ID, single primary
map SDK, credential domain separation, observation-vs-Fact permission
isolation) — the merged server-side adapters (#422-#427) cover unified
transport, not those bullets. This PR advances the first of those —
"共享选中ID" — by supplying the missing real `lookupMapping`
implementation. `#363` and `#364` both remain open; this PR does not
claim to complete either.
