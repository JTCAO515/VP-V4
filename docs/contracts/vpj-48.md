# VPJ-48 internal travel experience moderation

Related to #235. This is a server/API preparation slice, not public UGC acceptance.

## Interface and authority

`GET /api/ops/community` reads only the authenticated author's latest 50 submissions.
`POST` accepts a closed JSON action: `mine`, `queue`, `submit`, `review`, or `withdraw`.
The path is colocated with internal tooling; an author does not need an Ops role.
The current Web cookie/session adapter is reused. Bearer headers are rejected by this
HTTP adapter; native submission UI/adapter is not delivered here. Mutations require
same-origin and JSON; reads and responses are private/no-store. The streaming body
limit is 24 KB; the inherited request deadline bounds authentication, body and RPC.
Unknown acknowledgement after dispatch requires retrying the original operation ID.

The HTTP gate requires `COMMUNITY_INTERNAL_REVIEW=1` plus the existing explicitly
configured local/preview Ops environment. Independently, the database switch
`community_private.settings.enabled` defaults false. Neither migration nor deployment
creates a reviewer or enables the switch. Shared Staging and real identities require
separate authorization. There is no public read RPC, UI, feed or publication gate.

`public.community_workspace(jsonb)` revalidates a registered, non-anonymous live Auth
session, native revocation guard, switch, and action-specific authorization on every
call, including receipt replay. Reviewer qualification is exclusively an active row
in `community_private.reviewers`; knowledge Ops membership grants no community access.
The private schema/tables/helpers deny application-role access and enable RLS. Only
the explicit authenticated RPC is granted. The definer uses an empty search path.

## Requests and state

- `submit`: `operationId`, `submissionId` UUIDs, title (1–160 characters), content
  (1–4000), and exact consent `internal-review-v1`. The caller must be informed that
  this is an internal review submission. No consumer UI presently records this consent.
  Author is always the session actor. `authorIdentity` is server-derived
  `registered_user` or `community_reviewer`, not a client-asserted official identity.
  Broader employee/official attribution requires an authoritative identity source
  and remains outside this slice.
- `review`: the two UUIDs, `expectedVersion: 1`, decision `approve` or `reject`, and
  internal note (1–400). An explicitly qualified different actor reviews pending
  content. Audit events record `reviewed` and `published`/`rejected` atomically at v2.
  `published` means internally approved only: every response says visibility
  `internal`, `publiclyVisible: false`, `retrievalEligible: false`.
- `withdraw`: the two UUIDs and expected version 1 or 2. Only the author may withdraw
  pending, published or rejected content. The transition increments the version and
  clears title/body. Reviewer identity/note and audit remain internal.
- `mine`: author projection only, without reviewer ID, note, review time or audit.
- `queue`: qualified reviewer only, latest 50 pending items. No public listing.

Row locks serialize decisions/withdrawal; stale competing writes fail with conflict.
Operation IDs are actor scoped. Receipts store a request digest and submission ID,
not text or stale JSON snapshots. A same-input retry returns **current state**, so
withdrawal is never undone by replay. A changed-input retry conflicts. Permission
revocation is checked before replay. Audit failure rolls back the whole mutation.

## Lifecycle, release and rollback

This content never becomes a Fact and writes no Trip. Place linking, Save/Add to Trip,
consumer/native and Ops UI, official/employee disclosure, real GoTrue/HTTP integration
and #235 complete acceptance remain open. #238 report/block/appeal/deletion protections
must exist before public UGC can be considered. No public exposure exists in this PR.

#228 is unmerged and its Trip-only handler is not a community lifecycle integration.
There is no community export/deletion job or account-deletion receipt integration here.
An eventual physical Auth user deletion cascades owned submissions/audit/receipts, but
that FK is not proof of the application's requested-deletion lifecycle. Internal audit
actor/reviewer IDs and notes require scoped retention/deletion handling by that work.
Until then, only authorized isolated synthetic testing may enable this module.

Rollback: first disable the database switch and HTTP environment gate. Existing rows
remain private and replay is denied. Revert the API/module if needed; retain this
append-only migration and private data until an approved forward cleanup exists.
Never restore withdrawn bodies or grant public reads to recover service.

## Verification boundary

`node --experimental-strip-types --test tests/contract/community/request.test.mjs`
exercises the actual HTTP handler with injected RPC/auth transport, not a real login.
`VP_COMMUNITY_DB_TEST=1 node --experimental-strip-types --test tests/integration/community/review.test.mjs`
applies the complete migration history to a disposable network-none PostgreSQL.
It uses SQL-only synthetic claims/auth rows and production session-guard functions;
it does not prove GoTrue issuance, browser cookies, PostgREST or real-user consent.
The dedicated Linux workflow has no project credentials or self-hosted runner.
See `artifacts/VPJ-48/verification.md` and PR CI for observed results.
