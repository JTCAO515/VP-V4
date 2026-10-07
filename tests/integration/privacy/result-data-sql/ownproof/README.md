# ResultData SQL delivery

Owned base `bdb92b2b7dabf64b4d89fee1b657dcf06998dded`, branch
`vpj58-result-data-sql-20261007`. Sole protocol producer is sibling TS
`d0591196440c59910f4baac96b2a964a64586785`; `wire.mjs` loads that actual producer
in this standalone checkout and the repository producer after integration.
No separate SQL/Swift wire is invented.

`20261007010000_result_data.sql` implements the complete default-denied owner RPC:
list, preview, fixed 30s full-row CAS erase, immutable original-byte recovery and
explicit 1..20-operation progress cleanup. Only one owned artifact, every revision
and event, and exact qualified completed execution/journal copies are erased.
Permanent artifact/publication/execution/journal fences come only from finite
immutable decisions; original source Conversation/Task/Turn/Trip/Memory and
financial records stay intact. Ordinary writers retain original locks/errors.

The fixed registry/schema digest came from actual migrated PG17.6 catalog:
251 original tables, full columns/types/PK/FKs/checks; no unknown incoming cascade
can be admitted. The complete original schema and actual source JSON/scalar/BYTEA
relations are inspected; reverse dependency/mixed-copy cases block before erase.
Current original consent pairs, all historical text/planning sources and complete
binding witnesses enter the CAS. Budget scope, provider limits, profile, tariff
and collector principal rows are retained witnesses, not new permissions.
Authority overflow fails `RESULT_CAPACITY` before operation insertion; no partial
or replacement authority is persisted.

Run from the repository root:

```
VP_RESULT_DATA_DB_TEST=1 node --experimental-strip-types --test tests/integration/privacy/result-data-sql/postgres.test.mjs
```

PASS evidence: fresh full migration replay and 5 actual PG verification modules
(no-copy source, complete execution/journal, financial/config witnesses, original
core-job fence, adversarial suite). The adversarial suite has 16 passing cases,
zero failure/skip/cancel, including actual large bigint events, withdrawn/history,
sole-TS sensitive/progress/fifth-type list decoding, original message source
receipt producer, full source/reverse CAS, actual six-table cross-set closure,
Brief original BYTEA, future FK drift, complete byte overflow, revocation/epoch/
reauth/foreign negatives, private immutable operation state and inert sessions,
progress pagination/cleanup, same-id publisher original 23505, real writer/erase
NOWAIT overlap, actual late-delete 30s rollback, and exact ACK recovery past TTL.
Used confirmed Trip content/history/proposals and explicit Memory whole rows are
byte-identical. Completed copy erasure preserves original planning job, settled
attempt, scope/limits/profile and all retained source rows.

`final-postgres.log` records the fresh combined run. After that run, the authority
union >100 branch was changed from an unpersistable oversized preview to the
existing explicit capacity error; actual PG function replacement and fresh
ordinary source/preview/erase/recover verification pass. Other successful evidence
is reused because its source behavior is unchanged. `before-fifth-fixture-revision-fix.log`
retains the prior fixture failure: the fixture assumed proposal revision 1, while
original create API returned revision 2. It now uses that actual returned revision.
A first nested-test runner inherited NODE_TEST_CONTEXT and correctly failed its
zero-test guard; the runner now isolates child test context and proves zero skips.

Original affected regression suites PASS: worker/five-result lifecycle 14,
Trip lifecycle 11, concurrent task capacity/Trip binding 2. These include current
new migration replay and preserve original publication/capacity behavior. No
unaffected full Native/UI/provider matrix was repeated.

No target grant, policy/config activation, remote data, deployment, provider send
or fee action occurred. All PG claims/financial/config fixtures are administrator
synthetic provenance. Signed GoTrue/Auth + registered coverage caller, Native
integration, formal exact-head review, all merge CI, protected merge and actual
target/device/backup acceptance remain with Main/sole TS integrator.

`CI-REGISTRATION.patch` is a checkable candidate for the existing DB lane's file
list (the existing VP_PRIVACY_DB_TEST flag already enables the test). It is not
applied; no shared registry, old migration, TS, Native or shared handoff file was
changed by this SQL owner.

## Signed Auth schema compatibility repair

The original isolated signed Auth runs r1/r2 both failed owner-list HTTP503 and
cleaned up successfully; they remain recorded by the sole TS producer in
`lib/server/privacy/result-data/AUTH-SCHEMA-FINDING.md` at f0407c93. Earlier
standalone PG success did not establish Supabase runtime compatibility.

The application hash constant and complete original application columns/types/
PKs/FKs/checks remain unchanged. Only the six actually observed managed operational
namespaces (storage, realtime, _realtime, vault, supabase_functions,
supabase_migrations) are outside that hash. They are not automatically trusted:
all excluded-origin incoming application FKs, typed application identity columns,
application regclass/webhook-table-OID consumers, and typed JSON links to actual
application identities or permanent result fences reject support. Arbitrary
UUID/title strings are not authority. New application schemas/tables and the
original private schema remain hashed. There are no system-table grants, writer
triggers, architecture/config changes or new source/attachment domains.

The compatibility module tests nine explicit supported/rejected boundaries on a
fresh migrated owned PG fixture, with original default-denied RPC privileges,
actual source list/preview/erase and the same TS decoder. It restores its own
simulated schemas and fixture grant. A separate ordinary no-system-schema
source/preview/erase/receipt/recover check passes after the repair. Existing source,
copy, finance, CAS, locks, Native and TTL evidence is reused unchanged; no full
matrix was rerun. The runner includes this module before its original modules.
`schema-compatibility.log/json` and `schema-compatible-rpc.log` are scoped PG
proof only. The sole TS integrator must rerun the preserved actual signed Auth
chain using this fixed SQL increment; no signed Auth success is claimed here.
