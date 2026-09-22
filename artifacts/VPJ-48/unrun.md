# VPJ-48 remaining acceptance

UNRUN: shared Staging/production migration, real accounts/reviewer grants, real
GoTrue + cookie/PostgREST chain, browser/native screens, public UGC, employee/official
attribution beyond explicit community-reviewer qualification, place/Save/Add to Trip,
community lifecycle export/delete worker and #238 protections. No authorization for
these actual environment/account actions is inferred from this preparation slice.

Native build/tests: NOT APPLICABLE to this server-only PR; #235 native acceptance
remains UNRUN. Existing identity modules are reused unchanged. No place-v7 regression.

Isolated SQL tests use synthetic auth schema/claims, not real credential issuance.
A skipped opt-in DB test in generic suites is UNRUN, not a successful SQL execution;
only the dedicated Community PostgreSQL job provides that evidence.
