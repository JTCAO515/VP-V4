# AI-50 unrun checks

No identity/right verification, legal decision, Ops UI, provider/cache/media deletion, durable
storage, public Fact update, Trip mutation, external request, staging or production action was
attempted. The C0 ledger returns only private metadata and cascade/recheck intent.

`pnpm test:integration` completed without failures, but 8 of 13 existing tests were skipped because
local Supabase was not running. They are not claimed as durable Report-storage or deletion evidence.
