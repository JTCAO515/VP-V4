# Report ledger C0

AI-50 accepts a closed, metadata-only private Report reference. It does not receive report text,
identity documents, provider payloads or any public Fact mutation. A server-supplied verifier, rather
than the resolve request, authorizes an independent reviewer before one `deprecate`, `update`, or
`tombstone` resolution is recorded. Resolution time cannot precede the private submission time.

Resolution returns an audit reference and a deterministic intent-only cascade: cache, retrieval,
Explore and SEO invalidate; media rechecks; user Trips remain intact and only become
`recheck_required`. It performs no external deletion, cache purge, provider operation, Ops UI action
or legal determination. Rollback removes this isolated ledger and its evidence.
