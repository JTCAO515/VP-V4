# VPJ-48 internal travel experience moderation

Related to #235. This is a server/API preparation slice, not public UGC acceptance.

## Current J1 consumer extension (2026-10-05)

The canonical closed request/output contract is `lib/server/community/contract.ts`;
`lib/server/community/WIRE.md` records the coordinated producer semantics. J1 adds
registered Native v2 `POST /api/community/native/v1` and Cookie-bound
`POST /api/ops/community`, plus `/ops/community` and the native author consumer.
Every ingress binds expected actor/session, verifies live authority before dispatch
and checks again before releasing data. The original GET/unenveloped SQL protocol
remains the PR #502 historical interface described below.

New paginated `mine`/`queue` use ID keysets, 50+sentinel and explicit completeness;
`read`/`inspect` return exact current submission, history and author-visible result.
`experience` and `help` remain distinct text types. Trusted author/reviewer affiliation
is independent of qualification; missing producer evidence is `unknown`/null.
User-authored benefit disclosure is identified separately. Only new J1 review notes
are author-visible; legacy internal notes are not disclosed. Stored `published`
continues to mean **internally approved**, with `publiclyVisible:false` and
`retrievalEligible:false`. There is no public feed, Fact promotion or Trip writer.
Optional place association comes from an explicitly selected own saved canonical
Trip reference qualified by the original mapping producer. Frozen current Trip head
and mapping digest are rechecked at submit; changes require explicit reselection.
The native picker reuses the original saved-place Bearer reader and does not Save
or write a Trip. Unlinked submission is an explicit choice, never title matching.

Mutation operations preserve exact original bytes, owner/session/epoch and operation
ID. Status queries and atomic abandonment prevent unknown acknowledgements from
creating a replacement mutation. Replay projects current state; withdrawal/erasure
never restores old text. Ops saves the exact review request before sending, refuses
new review while unresolved, and clears visible content on auth/lifecycle invalidation.
The native author journal shares the same operation semantics in its owned scope.

`export`/confirmed `delete` are owner-scoped module commands with explicit
`community_module` / `complete_for_community` coverage and 100+sentinel capacity
checks. Inventory: `lib/server/community/inventory.ts`. Erasure covers owned content,
authored review text/attribution, place metadata and qualification/disclosure rows;
minimal operation fences, submission tombstones and audit metadata remain to prevent
resurrection. Foreign authors' content/status remains intact. All-account export
jobs are explicitly **not enrolled**; these commands do not claim their completion.
Owned cleanup remains available while the business switch is off, within the original
configured local/native or Ops environment and current ordinary identity authority.

The new SQL package is append-only and retains the original RPC signature/ACL.
Private helpers/tables remain revoked; default switches are off, reviewer/source
qualification is never seeded for a target. The verification entry points for SQL and Auth/HTTP integration
are the package's disposable tests; observed results are reported separately in
`artifacts/VPJ-48/j1-verification.md`. Target deployment, real producer identity,
real-user/device and human acceptance remain separate from fixture proof. #235 remains
open for J3 and #238 protection before any public publication.

## Historical PR #502 preparation boundary (superseded scope)

The following records what PR #502 delivered and left open at that time. Its older
50-item list, absence of consumers/data handlers and broader remaining-gap statements
are historical facts, not the current J1 interface.

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
