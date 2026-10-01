# Saved translation history v2

Related to #563; incremental private-tool consumer, not full Library or provider
acceptance. Uses the existing [current-input translation](vpj-26.md) producer,
policy, consent, retained text and `projectTranslation` validator.

## Explicit reader and permission

`GET /api/translate/history/v2` accepts only optional `cursor=<Turn UUID>`.
`GET /api/translate/history/v2/turns/{turnId}` accepts no query. Both reject
cookies/origin, verify native bearer credentials and active mobile session, use
the deployment's enabled current-input text policy, and stay `private, no-store`.
Production translation remains 503. These GETs do not admit work, reserve budget,
dispatch a model, introduce recipients or send retained history as model context.
The old GET `/api/translate` and its 20-text-request window remain unchanged.

The two authenticated-only RPCs are `list_saved_translations_v1(policy,cursor)`
and `read_saved_translation_v1(policy,turn)`. Anonymous/service roles have no
EXECUTE, and private table grants remain closed. Ordinary-read eligibility is
same owner, selected current-input policy still current, matching active consent,
unhidden text, an existing owner Turn in its active owner thread, and completed
`answered` status. Exact read also reuses `read_text_turn`'s existing session/Turn
lock guard. List and exact use one private candidate helper; only tool-prefixed
candidates reach the HTTP validator. Revoked/expired/hidden/deleted/status-invalid
sources uniformly give unavailable. Retained physical content is not restored.

## Bounded pages and exact projection

Owner/policy/created-time/Turn index supports descending `(created_at, turn_id)`
keysets, including equal timestamps. SQL limits raw source IDs to 128 plus one
content-free sentinel **before** hidden/status/translation filters. It does not
scan all records then limit translated results. The HTTP reader applies the
unchanged canonical prompt, closed output shape and numeric-token validation.
Only `translated` projections enter a saved page/card.

A successful page has `version:2`, `kind:translations`, `policyId`, at most 20
`phrases` and `nextCursor`. A 21st fully valid translation permits continuation;
the cursor is the last delivered translation's Turn UUID. It must still belong
to the same owner/selected policy/current consent and remain fully projection
eligible. There is no signature or claim that an eligible anchor was previously
issued. Unknown/foreign/revoked/malformed anchors give unavailable. No ordinary
Ask text, titles, scan-row ID or counts appear in the HTTP reply.

If raw tail remains without 21 valid translations, or malformed/needs-review
candidates prevent a safe terminal-page claim, the whole window is unavailable:
no partial phrases or false empty/completed page. An exact qualified translation
can still be reopened independently of that scan window. Exact success has
`version:2`, `kind:translation`, `policyId` and `phrase`. Other responses are
`version:2, kind:unavailable` or an explicit input/session/transport error.

The HTTP layer rereads source eligibility/content and the mobile session before
responding, failing unavailable when the projected source changes. Both session
checks return401 only for explicit UNAUTHENTICATED/SESSION_REPLACED or a valid
subject/session mismatch; ordinary RPC/transport/5xx and malformed protocol replies
return503, so a temporary read failure does not invalidate the native login. Each read is
bounded; the existing 10-second request deadline remains. This is live traversal,
not a snapshot or a full-history completeness guarantee across concurrent edits.

## Native consumer and rollback

The existing Translation tool adds an explicit “Browse saved translations”
entry, leaving the old recent-window reader used by Library intact. New fixed
GET-only `NativeSession.translationHistoryRequest` accepts only cursor or exact
Turn ID; no arbitrary path, POST or body is exposed. One page replaces another.
A fresh policy is read before and after each page/exact read. Actor/scope,
generation, cancellation, notice/policy and injected monotonic 20-second lifetime
fence publication and display, including time spent waiting for the request.
Opening requires the same complete phrase to be reread by exact Turn; no local
copy substitutes. Account/background/view exit and withdrawal clear these new
projections. Expired/unavailable content needs a fresh read, not model generation.

Rollback removes the opt-in native consumer/new routes and disables the two new
RPCs by append-only EXECUTE revocation; do not edit an applied migration. Existing
translation submission, cancellation, old 20-reader, retained sources, deletion,
model budget and provider configuration remain unchanged. Transactional migration
forward/rollback is covered in the disposable PostgreSQL test. Actual Staging,
Production, real provider quality and physical-device acceptance remain separate.
