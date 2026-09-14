# VPJ-74 slice 4: apps/ops UI surface for provenance read

Follows slice 1-3. Closes the remaining `UNRUN` item from earlier slices —
an `apps/ops` UI for `ops_knowledge_provenance_read_v1` — with an actual
new page, not just the RPC.

## What's new

- `lib/server/knowledge/provenance/http-provenance.ts`:
  `handleProvenanceRequest`, a GET-only counterpart of the existing
  `handleOpsRequest` (review workspace), following the same dependency-seam
  pattern (`RequestLifetime`, injectable `Rpc`). No body to stream —
  `factId` travels as one query parameter, validated by
  `isProvenanceReadInput` (already existed from slice 1).
- `app/api/ops/provenance/route.ts`: thin wrapper reusing the existing
  `createWebRpc`/`opsRuntimeConfig` exactly as `app/api/ops/review/route.ts`
  does — same auth boundary, same env-gating (`OPS_LOCAL_REVIEW` locally,
  `OPS_STAGING_REVIEW` + exact Preview-origin match remotely), no new
  authorization surface introduced.
- `app/ops/provenance/{page,workspace}.tsx`: a read-only lookup form
  (Fact ID → relation, sources, source history, audit trail), reusing
  `app/ops/review/workspace.module.css` rather than duplicating styles,
  and the existing `localeOptions`/`getLocaleAttributes` i18n machinery.
- `opsProvenanceCopy` added to `lib/i18n.ts` for all 5 existing locales
  (zh/en/es/ru/ar), matching the existing `opsReviewCopy` pattern.

## Validation

- `tests/contract/ops/provenance-request.test.mjs` (6 tests): disabled/
  bearer/malformed-input rejection before RPC creation, failed-auth never
  dispatches, successful passthrough, known-error status mapping,
  unknown-error fallback, hung-call/abort bounded by the shared lifetime.
- `docs:check`, `lint` (272 files), `typecheck`, `test:contract` 326/326
  (0 skipped, includes the 6 new tests) all PASS.
- `npm run build` succeeds; `/ops/provenance` and `/api/ops/provenance`
  both appear as expected dynamic routes in the build output.

## Real browser verification (local, disposable)

Started a disposable local Supabase instance (already had this session's
earlier VPJ-74 local test data), created a real GoTrue user via the admin
API (`vpj74-ui-demo2@example.test` — the browser sign-in flow rejected a
raw `INSERT INTO auth.users`, since GoTrue's password grant needs a user
created through its own admin path, not just a matching bcrypt hash),
added it as an active `knowledge_review_private.members` row, then drove
the actual browser:

1. Signed in through the real `/auth/sign-in` page.
2. Navigated to `/ops/provenance`, entered the one real published `factId`
   left over from this session's earlier local testing, submitted.
3. **Real result rendered**: `已发布 · 发布版本 1`, subject/predicate/object,
   the correctly-resolved relation (`接受支付方式` — `service_entity` →
   `payment_method`), the source (key/revision/publisher/URI/locator/
   `snippet_hash`/`lineageStatus: 历史记录（未追踪血缘）` i.e. `legacy`, with
   `未知`/unknown fetch/effective times — correct, since this fact predates
   slice 2's write-path change), source history, and the audit trail entry
   with its real timestamp.
4. Submitted a well-formed but non-existent `factId` — rendered
   `未找到该 Fact，或它尚未发布。` (not-found), no crash.
5. Switched locale to English via the selector — the whole page (heading,
   boundary text, error message) re-rendered in English immediately.

## Cleanup

Deleted both synthetic auth users (and their `identities` rows) and the
`members` rows created for this test, restored
`knowledge_review_private.settings.enabled` to `false`, stopped the local
Supabase instance, removed the temporary `.claude/launch.json` used to
start the dev server for this verification (not part of the repo's
tracked config).

## Still not decided

- **Staging deployment of this UI specifically.** Slice 3 verified the SQL
  against Staging; this slice's browser verification was local-only. The
  route/page code is identical regardless of environment (same
  `opsRuntimeConfig` gating already proven correct for the review page),
  but a literal click-through against Staging was not repeated here.
- **Non-member/anon browser-level negative case.** The contract tests
  cover this at the handler level (`OPS_FORBIDDEN`/401 status mapping,
  unit-tested); an actual signed-in-as-outsider browser click-through was
  not additionally performed, since slice 3 already proved the underlying
  RPC's `OPS_FORBIDDEN` behavior against real Staging.
