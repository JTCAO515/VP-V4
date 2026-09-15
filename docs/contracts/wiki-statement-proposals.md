# Bounded Wiki model proposals and exact source quotes (#359)

`runWikiStatementProposalJob` is a new one-shot, explicit **C0 synthetic-only**
entry using the existing provider transport/protocol and CostGuard. It adds no
scheduler or automatic retries. Non-C0 inputs reject before transport; shared C2
exits still do not admit this task. Real data dispatch requires its own accepted
policy binding and is not enabled by this implementation.

The versioned prompt requests at most5 atomic v1 statements, each with1–3 supplied
source IDs and verbatim quotes, bilingual conditions/exceptions, summary and gaps.
The model cannot supply source declarations, reviewer, TTL or publication authority.
Application validation reuses the existing statement schema without exposing its
validation-only sentinel as data. Canonical source declarations are selected from
the caller's snapshots. Unknown IDs, absent/ambiguous quotations and malformed
structures reject. Unicode code-point offsets are computed in the stored snippet
without normalization; the model never chooses offsets.

A `wiki-draft/2` body contains exactly schemaVersion, summary, gaps and
statementProposals. Each proposal contains its canonical statement plus evidence
(sourceRevisionId, quote, startOffset, endOffset). Old `{summary,gaps}` bodies and
NULL historical bodies remain compatible. The completion adapter accepts either
body version; its existing receipt/expected-version transaction still persists
body, page, job and receipt atomically. The appended migration changes no old data.

On completion, PostgreSQL independently verifies all referenced source rows,
canonical declarations, unique quote occurrence and code-point offsets. Validation
uses source row locks inside the existing completion transaction. A raw RPC caller
cannot forge a source or offset merely by bypassing TypeScript validation.
Source binding proves quotation identity, **not claim entailment or semantic quality**.
Human review remains mandatory before any statement becomes published knowledge.

Ops displays proposals and quotes, including prior revision details, and links to
a query-pinned review form. It pre-fills the existing statement editor while keeping
fields editable and sources immutable. An optional wikiProposalIndex(0–4) identifies
the original model proposal; it must exist in that exact current revision. Candidate
origin retains `operator_statement` and the optional proposalIndex. This is the
operator's starting point, not evidence that every later edit is model-verified.
Final candidate evidence and publication still use existing reviewed declarations.

The login allowlist admits only the original closed Wiki target fields plus the
optional bounded index. Review/publication, user/actor guards, expiry/revocation and
budget/unknown-cost semantics are not bypassed. The worker returns observed token
usage on success; invalid/failed results do not manufacture settled cost. Full
persistent worker leases, unknown-fee recovery and bounded real-provider spending
remain existing #359 follow-up work.

Evidence: [verification](../../artifacts/VPJ-75/wiki-statement-proposals/verification.md).
Rollback disables the new producer/UI consumption while preserving structured
bodies, links and receipts. Applied schema receives compatible forward repair.
