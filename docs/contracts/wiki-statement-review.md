# Wiki revision to source-linked statement candidate (#359)

`submit_wiki_statement` is an editorial operation on the existing
`POST /api/ops/review` / `ops_review_workspace` entry. Its closed input consists of
`action`, `operationId`, `candidateId`, `title`, `wikiRevisionId`,
`expectedWikiVersion`, and the existing `KnowledgeStatement` payload.
It is not automatic LLM extraction and never grants publication eligibility.

The database checks the live Ops actor before reading any receipt. Exact replay
returns the historical receipt; changed replay conflicts. New submissions require
the selected Wiki revision to still be the page's current version, have a saved
body, and not be rejected. Each selected source must be an actual dependency of
that revision with an exactly matching stored declaration. Client-supplied changes
to source text, publisher, locator or revision do not create a new source.

Existing statement submission creates the candidate, statement, source joins and
audit. The new private `wiki_statement_candidates` relation pins the candidate to
its Wiki revision and canonical statement digest in that same transaction, along
with the outer receipt. A per-revision/digest advisory lock and unique constraint
prevent duplicates across new operation IDs, including concurrent submissions.
A duplicate returns the canonical candidate ID; it does not change that candidate's
author or state. Historical generated `statement_refs` are not rewritten to imply
that an operator's later statement was part of the original model output.

Candidate JSON exposes `wikiOrigin` with pageKey/revisionId/version and explicit
`method: operator_statement`. Review, publication, expiry and withdrawal remain
with the original functions and separate-author/reviewer rule. Readers receive the
existing qualified bilingual statement projection, not Wiki body or operator notes.
The Wiki origin is provenance for the editorial process, not external evidence.
Source revisions/locators remain the evidence boundary; precise multi-span extraction
and automatic source/procedure/topic generation remain later #359 work.

The Wiki page links to a query-pinned review form. It shows the original draft/gaps,
lets the operator select 1–3 original source declarations, and reuses existing
bilingual conditions/exceptions and review controls. Sources are not editable in
this mode. A missing/stale/rejected revision fails closed. Unknown acknowledgement
retains the same operation for retry, and actor drift follows the existing guards.
The login return allowlist permits only `/ops/wiki` and the exact three validated
Wiki query fields on `/ops/review`; external targets and arbitrary queries reject.

No remote migration, account change, paid call or production activation is included.
Disable the new entry for rollback while retaining the private linkage, original
candidate/source data and receipts. Applied migrations are forward-repaired.
Evidence: [verification](../../artifacts/VPJ-75/wiki-statement-review/verification.md).
