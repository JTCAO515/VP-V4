# Saved translation history v2

Related to #563; incremental private-tool consumer, not full Library or provider
acceptance. Uses the existing [current-input translation](vpj-26.md) producer,
policy, consent, retained text and `projectTranslation` validator.

## Explicit reader and permission

`GET /api/translate/history/v2` accepts optional `cursor` and optional `query`.
Without query, the original UUID cursor and response shape remain unchanged.
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
checks return 401 only for explicit UNAUTHENTICATED/SESSION_REPLACED or a valid
subject/session mismatch; ordinary RPC/transport/5xx and malformed protocol replies
return 503, so a temporary read failure does not invalidate the native login. Each read is
bounded; the existing 10-second request deadline remains. This is live traversal,
not a snapshot or a full-history completeness guarantee across concurrent edits.

## Opt-in bounded keyword search

A query-present GET uses at most120 raw UTF-16 units. The server trims outer
whitespace and uses JavaScript Unicode default lowercase for literal substring
matching within each of original, translation and back-translation independently.
Percent, underscore and backslash are ordinary characters; there is no wildcard,
NFKC/accent normalization, tokenization, cross-field concatenation or model call.
The original query is echoed only in successful query-present pages. Omitting
query retains the existing browse response, including no query field. An empty
query-present value matches all eligible translations but retains its query scope.

Filtering happens after the unchanged SQL128+sentinel bound and canonical/numeric
projection. At least21 fully valid matching phrases permit20 results and a safe
continuation. Raw tail or malformed candidates without a safe continuation remain
uniform unavailable with no partial phrases; sparse scans cannot claim all history
has no matches. There is no text index/copy, new SQL or permission/recipient change.

Search cursors use `q1.` plus canonical base64url JSON with exactly `turnId` and
raw `query`, bounded to1200 ASCII characters. The raw query must equal the request
byte-for-byte; the SQL reader still validates current owner/policy/consent/source,
and the HTTP projection rechecks that anchor is canonical and matches this query.
A valid cursor belonging to another query, actor or no-longer-eligible/nonmatching
anchor is unavailable. Malformed tokens are invalid input. This unsigned binding
is not encryption, authorization or proof that the server previously issued the
cursor. An actor can name an eligible anchor; every source qualification still runs.
The old no-query UUID cursor remains compatible and cannot be passed as a search
cursor. Exact read accepts no query and retains its original permission contract.

The Translation-tool field submits an explicit browse/search read. Editing it
immediately clears page/cursor/card and invalidates late responses; the next request
starts at the first page. Raw UTF-8 equality fences query scope and echo, preserving
the distinction between Unicode spellings that Swift String equality considers
canonically equivalent. Search reads have an independent UI task and do not cancel
translation submission/polling. Query changes do not renew a loaded page's lifetime;
a fresh read is required. Actor/background changes clear the keyword too. Library's
no-query reader/Read alias and its current-page local matching remain unchanged.

## Wire byte ceiling

HTTP and both native transport/decoder checks use a shared documented ceiling of
1,000,000 UTF-8 response bytes for pages and exact reads. One page contains at most
20 records, each with original600 + translation2400 + back-translation2400 UTF-16
units. Even six-byte JSON Unicode escaping requires at most648,000 content bytes;
closed keys, UUIDs, locales/state and envelope metadata fit well within the remaining
352,000 bytes. The cap also matches the existing v1 translation transport budget.
This does not increase any phrase field, stored-output8000-unit gate, provider input
or output token limit. No page is truncated to fit; an oversized HTTP response fails
503 with no partial content, and native rejects over-ceiling bytes before decoding.

A `projectTranslation`-accepted 20-record CJK page measured327,375 bytes; escaping
those same content fields measured651,375 bytes. The old250,000-byte native check
rejected this legal page. Literal and escaped forms now both decode all20 records;
an otherwise valid JSON envelope padded beyond1,000,000 bytes is still rejected.
These are structural/numeric synthetic fixtures, not translation-quality evidence.

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
