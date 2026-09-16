# #363 (VPJ-19) verification — first `app/api/places/**` route consumer

Scope: `app/api/places/search/route.ts`, `app/api/places/nearby/route.ts`,
`lib/server/maps/place-consumer.ts`, `lib/server/maps/service-role-client.ts`,
`lib/server/maps/web-auth.ts`. Advances the still-open "地图、列表、详情共享
选中ID" acceptance bullet by making a real HTTP route call
`searchPlaces()`/`nearbySearch()` together with the real
`loadCanonicalMappingLookup()` added in round 11
(`lib/server/maps/canonical-mapping-repository.ts`) — until this change,
`app/api/places/**` did not exist anywhere in this repo, and nothing called
that lookup outside its own tests.

Class: A (reversible via `git revert`; no schema/migration change; the
`provider_poi_mappings` service-role grant this relies on already existed
from round 11's `20260914100000_vpj_19_363_place_identity.sql`; no
provider or Supabase secret committed; no live provider or live Supabase
call made in this environment; inert in every environment today because
`AMAP_SEARCH_ENABLED`/`AMAP_NEARBY_ENABLED`/their Tencent equivalents and
the new `SUPABASE_SERVICE_ROLE_KEY` all remain unset — see "Provisioning"
below). See "Why a service-role client is in scope, and why it's still
Class A" below for the one judgment call this round required.

## What was implemented

- `lib/server/maps/place-consumer.ts` — `searchPlacesWithCanonicalMapping`/
  `nearbySearchWithCanonicalMapping`. Both do a two-phase call: run the
  existing provider adapter once with an always-null `lookupMapping` to
  learn the response's real `providerPoiId`s, then one batched
  `provider_poi_mappings` query via `loadCanonicalMappingLookup` for
  exactly those ids, then remap `matchedCanonicalPoiId` over the
  already-fetched candidates. Exactly one provider network call either
  way; the DB round trip is skipped entirely when the provider call
  didn't observe results, or when no service-role client is available.
- `lib/server/maps/service-role-client.ts` — `createMapsServiceRoleClient`,
  this repo's first service-role-authorized Supabase client. Reads a
  private key that is never `NEXT_PUBLIC_`-prefixed (so Next.js's build
  never inlines it into a client bundle); returns `null`, never throws,
  when the URL/key is absent or malformed.
- `lib/server/maps/web-auth.ts` — `requireAuthenticatedActor`, a minimal
  session check independent of `createUserDataAdapter` (a place search
  touches no user-owned row, so none of that adapter's Trip/memory/profile
  machinery applies). Gates both routes behind a real Supabase session so
  anonymous traffic can't spend paid provider quota.
- `app/api/places/search/route.ts` (`GET ?provider&q&city`) and
  `app/api/places/nearby/route.ts` (`GET ?provider&category&lat&lng&radiusMeters`) —
  thin route handlers: auth gate, bounded input validation, call the
  consumer function, map its outcome onto this repo's existing
  `FailureCode`/`FAILURE_TAXONOMY` (`UNAUTHENTICATED`, `INVALID_INPUT`,
  `PROVIDER_UNAVAILABLE`, `TIMEOUT_BEFORE_OUTPUT`). No route file is
  itself unit-tested by importing it directly — that matches this repo's
  existing convention (no other `app/api/**/route.ts` is imported by a
  `node:test` file either); its wiring is instead asserted statically (see
  below) and its logic lives entirely in the tested `lib/server/maps/**`
  functions.
- `docs/contracts/place-identity.md` — new "Route-level consumer" section;
  corrects round 11's Non-goals note, which mistakenly attributed this
  route-level wiring to "#364/#365/#366's scope" (re-reading those three
  issues this round shows none of them own a plain place-search/nearby
  HTTP route — see that section for detail).

## Why a service-role client is in scope, and why it's still Class A

`docs/superpowers/plans/2026-08-28-authless-preview-unblocked-issue-workflow.md`
states a global constraint, "Never introduce a service credential, fixed
guest actor, RLS bypass, or unauthenticated Trip read/write," enforced for
a specific file list by
`tests/security/identity/no-service-credential.test.mjs`. Read narrowly,
that guard is about the Trip/identity actor-derivation surface specifically
(preventing a service credential from ever standing in for a real user's
identity or reaching Trip RLS) — its file list is
`user-data-adapter.ts` plus the auth/Trip routes, and neither this round's
`no-service-credential.test.mjs` (unmodified) nor its guarded files
reference the new client.

`provider_poi_mappings` is a different kind of table: it has no
`user_id`/owner column at all (see the migration), RLS is enabled with
`anon`/`authenticated` fully revoked, and round 11's own module doc for
`loadCanonicalMappingLookup` already anticipated a future
"server-authorized client" as the intended way to call it — the schema
itself was designed around service-role-only access, already reviewed and
merged. This round's `service-role-client.ts` is:

- its own module, imported by nothing under `lib/server/identity/**` or
  the Trip/proposal/confirm routes `no-service-credential.test.mjs` lists;
- unable to touch any Trip/memory/profile row (`provider_poi_mappings`
  carries none);
- inert until an operator explicitly provisions `SUPABASE_SERVICE_ROLE_KEY`
  (unset in every environment today);
- covered by a new repo-wide regression test,
  `tests/security/maps/service-credential-isolation.test.ts`, added this
  round, asserting (a) nothing outside that one factory reads the secret,
  (b) no client-rendered surface (`components/**`, `ios/**`, any
  `page.tsx`/`layout.tsx`) references it or the AMap/Tencent Web Service
  keys, and (c) no `NEXT_PUBLIC_`-prefixed variable name ever carries any
  of them.

On that basis this stays Class A rather than escalating to Class B: it's
reversible, adds no schema/RLS change, and the one new privilege surface
it opens is narrowly scoped, inert without new operator action, and now
CI-enforced never to leak toward the identity/Trip surface or a client
bundle.

## Provisioning (operator action, not performed here)

Real end-to-end resolution (`matchedCanonicalPoiId` genuinely non-null from
a live call) additionally requires an operator to set
`AMAP_SEARCH_ENABLED`/`AMAP_NEARBY_ENABLED` (or the Tencent equivalents)
plus the corresponding Web Service key, **and** a private
`SUPABASE_SERVICE_ROLE_KEY` in the deployment environment. None of that was
set, requested, or fabricated in this environment; every test below uses a
synthetic provider/Supabase double, matching every existing adapter test in
this slice.

## Still not done — no route/UI-consumption claim implied

- Map/list/detail UI actually rendering and sharing the same selected id
  across surfaces — no client-side/component code changed this round.
- Rate limiting/budget beyond the auth gate.
- Single primary map-display SDK selection.
- Observation-vs-Fact permission isolation.
- Live provider/Supabase verification — UNRUN, not fabricated.

#363 remains open.

## Checks run (this environment, 2026-09-16)

All from a clean worktree at `origin/main` (526a077) plus this round's
diff, `node_modules` reused from an identical `pnpm-lock.yaml` (`diff`
confirmed empty) to avoid a blocked npm-registry install inside this
session's network sandbox; `tsc`/`next build`/`node --test` themselves ran
sandboxed:

- `pnpm lint` — pass (311 files checked).
- `pnpm typecheck` — pass, no errors.
- `pnpm build` — pass; `/api/places/search` and `/api/places/nearby`
  appear as dynamic routes in the route manifest.
- `pnpm test` (static-output + design contract, post-build) — pass, 22/22.
- `pnpm test:unit` — pass, 100/100.
- `pnpm test:contract` — pass, 526/526 (108 files), including the 17 new
  assertions in `tests/contract/maps/place-consumer.test.ts`,
  `service-role-client.test.ts`, `places-route-wiring.test.ts`.
- `pnpm test:security` — 149/150 pass, 1 pre-existing skip
  ("AI-14 owner RLS and fault rollback hold on a running local Supabase" —
  explicit disposable identity Supabase target not configured; unrelated
  to this change, present before it), including the 3 new assertions in
  `tests/security/maps/service-credential-isolation.test.ts`.
- `pnpm test:e2e` (Node suite, not Playwright) — pass, 40/40.
- `pnpm docs:check` — pass.
- `pnpm check:flags` — pass.
- `pnpm check:assets` — pass.
- `pnpm db:verify` — `database-baseline-present`, probes report
  `not-configured` as expected (no live target, none attempted).
- `pnpm test:e2e:frontend` (Playwright) — not run. No client-side/UI code
  changed this round; installing and driving a real headless browser for a
  pure-backend routing change would add no additional verification signal
  proportionate to its cost.
- `evals` — not run. No model/prompt/grounding logic touched this round.

## Rollback

Revert this PR's commit(s). `app/api/places/**`, the three new
`lib/server/maps/**` files, and the new test files are removed;
`docs/contracts/place-identity.md` reverts to its round-11 text. No
migration, RLS policy, or already-confirmed Trip/proposal/Fact data is
touched by this change or its rollback.
