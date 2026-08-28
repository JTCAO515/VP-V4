# Import migration ledger contract

AI-23 is a C0 fixture-only port of the minimum VP-Final migration relationship. It is not an import service or an RLS migration.

## Closed input and replay

`prepareImport` accepts exactly an RFC3339 timestamp, bounded actor and Candidate IDs, and an opaque source tuple: source ID, row ID, source version, and bounded source-row hash. It accepts no source content, licence assertion, provider output, account, or arbitrary metadata. A previously seen source ID/row ID is rejected; hash drift has its own explicit denial and an exact replay cannot mint another Candidate.

Every prepared record is `candidate`, `private`, revision `1`, and author-bound. There is no browser or public route to read it.

## Review and eligibility boundary

Only that Candidate's author can create its revision-bound Change Set. Approval requires a distinct reviewer, an exact current revision, and the only accepted decision (`approve`). The successful operation creates exactly one reviewed Fact plus an `eligibility_recheck_required` event and a `publish` audit receipt in the same in-memory operation.

“Reviewed” does not mean publicly eligible. `publicFacts()` is intentionally empty: a later fact-eligibility/publication boundary must check review, expiry, licence, policy receipt, owner scope, and RLS before it can create a public projection. This ledger has no such authority.

## Explicit source dispositions

`merge`, `split`, `tombstone`, and `source_delete` are allowed only for an existing private Candidate and are recorded as immutable private audit outcomes. They do not merge records, delete source data, tombstone a database row, or modify a public projection. Those durable behaviors require their own accepted schema/RLS migration.

## Known limits

The implementation is process-local and non-durable. It is not a database transaction, does not run RLS, and cannot establish parity with unavailable VP-Final source data. `pnpm db:verify` is retained as evidence that no local Supabase runtime was configured; real migration/RLS coverage remains unrun.
