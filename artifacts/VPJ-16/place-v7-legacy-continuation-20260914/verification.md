# Frozen legacy continuation — running

This is a separately journaled continuation of the interrupted isolated run, not a reroll. Original failure and cleanup remain in ../place-v7-isolated-20260914.

- Runtime2f76642/v7, APIe19 unchanged. Original scenario/run SHA-bound; remaining86 cases exactly original legacy.slice(20).
- Recover existing case46 via normal API GET with zero model calls; then at most86 new calls,65-minute cap. GET transport failure may retry once; no automatic POST/model retry.
- Reader-only window; Ops/members stay disabled, no publication mutation. Baseline405attempts0unresolved/users6/Trips3/migrations48; WAF92.
- Existing controlled budgets renewed before activation: expiry only to2026-09-14T00:26:40.762Z. Both70CNY limits, provider limits and spending history unchanged; no added funds. No renewal during active run.
- Independent controller/window review0Critical/0Important; hashes retained. Budget preflightPASS for sequential admission headroom, not worst-case funding for every case.
- Controller started2026-09-13T22:57:57.122Z, session73158. Final results/accounting/cleanup pending. No Production release or full S2 acceptance.
