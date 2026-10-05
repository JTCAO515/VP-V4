# VPJ-31 B1/B2 SQL verification — 2026-10-05

Owned SQL worktree: `vpj31-traveler-brief-sql-20261005`.
Fresh main base: `2b49b94c`; explicit immutable #654 dependency `8675b90c`,
TS wire `89fe4de6`, privacy adapter `20ea5b46`, owner metadata `6f69963a` were
integrated normally. These dependency commits were not assumed merged to main.
The original dirty TS/source checkout was left intact. Only the new append-only
`20261005060000_traveler_brief.sql`, owned SQL tests and this evidence were authored
here; registry, TS/Native/Ops and original writers stay with their existing owners.

## Actual results

- PASS: fresh network-disabled disposable Supabase PostgreSQL 17.6 full historical
  migration replay and new migration transaction rollback. Default ACL/RLS denial
  and disabled switch were proven before granting this RPC to synthetic fixture
  actors. The package grants/enrolls no real actor and changes no target.
- PASS: `VP_TRAVELER_BRIEF_DB_TEST=1 node --test tests/integration/service-cases/brief-postgres.test.mjs`
  — 15/15, zero skipped/cancelled/todo/failed; `postgres-matrix-final.log`.
- PASS: after integrating exact owner_state TS wire `6f69963a`,
  `VP_TRAVELER_BRIEF_DB_TEST=1 node --test --test-name-pattern 'append replay|owner_state' tests/integration/service-cases/brief-postgres.test.mjs`
  requalified the actual default-deny and metadata/cleanup responses with its
  closed decoder; `owner-state-closed-wire.log`.
- PASS: `VP_SERVICE_OPERATIONS_DB_TEST=1 node --test tests/integration/service-cases/operations-postgres.test.mjs`
  — original operations regression 18/18, zero skips; `original-operations-regression.log`.
- PASS: `node --test tests/contract/service-cases/brief/sql.test.mjs tests/contract/service-cases/operations-sql.test.mjs`
  — 6/6; append-only authority, reference-only columns, default ACLs, unchanged
  original core export and incomplete attachment/account coverage.
- PASS: implementing-agent diff review and `git diff --check`.

The PG matrix observes actual original Profile/Memory/consent/goal/link/intake,
Case revoke/replace/delete, native credential-proof login/session replacement/logout,
Trip deletion, staff membership/operator/shift/slot and account cascade writers.
Real held transactions cover correction/revoke/delete/session/account racing Brief
reads and the reverse read/Memory-writer order; the actual database deadlock count
was zero. Qualification includes the exact Case Trip current head and original
owner/session/link receipt, current input frontier and policy/consent/Memory basis.
Nulls and ambiguous/unrelated intakes remain unknown. Fresh explicit per-field
share is required; selected-only Memory references survive unselected pace changes.

The owner export is a new reference-only `traveler-brief-data/1` exact 30-second
lease. Actual lease/data/source/audit changes, 10,000-row and 512-KiB limit failures
are observed. Audit returns the whole bounded set or BRIEF_LIMIT at >200; the new
owner_state metadata path still allows exact-CAS cleanup at that limit, with the
feature disabled and after revoke, without returning content or any source refs.
Deletion erases audit/previews/references/raw old operations; its original-session
minimal receipt survives original Case deletion. Original source content remains
under its original writer.

## Failures repaired, not treated as passed evidence

Initial native Auth integration stopped at login before a Brief action.
Canonical native_prepare_v2/native_session_v2 reproduced SQLSTATE 42703:
`session_changed()` planned cross-table OLD record fields. `ac4784b4` changed
only the new trigger's metadata extraction to explicit JSON record keys. The
canonical login/replacement/logout test now passes; `canonical-login-repro.log`
retains the original failure. No old Auth function or guard was weakened.

An actual auth.users cascade then exposed a new invalidation-audit FK failure
while the owner row was already removed. The event insert now checks the current
owner and Case exist; the original account deletion completes and cascades all
owned Brief data. `postgres-matrix-r3.log` retains that failure; the final held
account-delete race passes. Intermediate fixture mistakes (boolean SQL literal,
original archive minimum revision and the original withdraw_text_policy function
name) were corrected without changing source authority or original constraints.

## Remaining environment boundaries

UNRUN here: target migration/EXECUTE permission activation, real employee
qualification, real user data, provider/funds, Production, physical phone and
human/VoiceOver acceptance, full required remote CI/all database lanes. These are
not implied by the disposable fixtures. The sole TS integrator separately owns
actual Auth HTTP validation, shared registry and the final combined delivery;
its evidence must retain its exact source/environment. Default feature switch and
public/anon/authenticated/service_role EXECUTE denial remain the delivered state.
