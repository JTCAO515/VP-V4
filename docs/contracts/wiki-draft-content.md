# Wiki full draft persistence and Ops reader (#359 slice 3)

A successful `ops_wiki_generation_v1` completion now requires `outcome.draftContent`
with exactly `{summary, gaps}`, matching the existing model output. Summary is
1–600 UTF-16 code units; up to five gaps each contain 1–160 units. JS trim whitespace
is rejected at both ends. The SQL validator matches the provider validator,
including emoji. New completions allow at most 20 source revisions and 100 statement
references. `changeNote` remains a separate short reason, never a body substitute.

`completeWikiGenerationJob` sends the complete validated worker result through the
caller's existing authenticated Ops RPC. It performs no provider call or automatic
retry. Retain the same completion input and operationId for lost-response recovery.
Claim, provider invocation and completion remain caller-owned, as in slice 2; this
increment does not introduce a production scheduler or expand paid-call authority.

The appended migration adds nullable `draft_content`: pre-upgrade rows remain NULL.
Old exact receipts still replay before the new payload validation, with live Ops
authorization checked first. New success without a body is rejected; deploy the
migration before the new consumer. Page lock precedes job lock on both claim and
complete. Body insert, page version, job terminal state and receipt commit together.
A failed transaction persists none of them. Expected-version and receipt conflicts
remain errors; no overwrite, backfill, grant or publication is added.

`ops_wiki_read_v1({})` lists the latest 50 page keys. `{pageKey}` returns the current
and immediately previous revision in one SQL snapshot, with up to 10 recent jobs,
source declarations/snippets/locators, status and generation metadata. The read
reuses `current_actor()` and private schema RLS/ACL boundaries. Missing historical
sources/body are represented honestly. Source links are revision-level metadata;
statement/span-level validation remains a later #359 slice.

`GET /api/ops/wiki` and `/ops/wiki` reuse the existing Cookie session and Ops runtime
switch. Authorization headers are rejected as on the provenance route, the request
lifetime is bounded, and responses are private/no-store. The page provides zh/en,
plain-text summary/gaps, additions/removals and original version comparison. Model
and source strings are never interpreted as HTML. Background reads recheck access;
hidden/failed reads clear data. Successful refresh keeps expanded revision sections.
The existing review entry links here; its author/reviewer/publication flow is unchanged.

Validation and environment limits: [verification](../../artifacts/VPJ-75/verification.md).
Rollback by disabling the consumer, preserving the added body column, old records and
receipts. Database repair is forward-only after application. #359 remains open.
