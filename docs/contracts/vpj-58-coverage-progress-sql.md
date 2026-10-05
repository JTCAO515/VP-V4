# VPJ-58 coverage progress SQL owner exit

Task #239 ALL1, fixed SQL base `960f1ed761d0635769ce2a9a486b56efc94139f2`.
Sole append migration `20261006040000_coverage_progress_data.sql`; sole TS producer
contract/rows/protocol/export at `300815ca0ece12aef9b4634a8d1a5670571eeed4` and its
reviewed `lib/server/privacy/coverage-progress/WIRE.md` define the closed wire.
This SQL task edits no prior migration, shared registry, business source, Trip,
existing RPC/ACL/schema, Native or TS implementation.

`privacy_coverage_progress_v1(text,text,bigint)` consumes exact original UTF-8
command bytes. The only special dispatch is `export_start` carrying `action:export`.
Every call requires ordinary current non-anonymous owner credentials, actual mobile
session/attempt/epoch and server session creation within the original five-minute
reauth window. Lock order is owner advisory `hashtextextended(owner,34)`, auth user,
mobile account/current session, sorted `coverage-request:` advisory keys, sorted
original fences/requests/sections, sorted new requests/pages. Row and advisory
conflicts fail immediately; no source/business locks or sweep are introduced.
Foreign recovery lookup is owner-filtered before selected/advisory/row locks and
returns the exact absent `unknown`; actual owned binding/byte mismatches conflict.

List is read-only. It inventories owner collector fences and new requests,
including historical sessions with surviving original session FKs. A 10001st root
is a capacity sentinel. Its cursor digest includes flat actual metadata hashes,
so page advance invalidates continuation even when summary row counts stay equal.
Duplicate root IDs fail closed. Explicit selection is sorted unique 1..20 UUIDs.
Preview exposes every collector request/section/fence field and every flat exit
request/page field before confirmation. It writes one minimal new request only.
Source CAS excludes that operation's own row and binds selection, actor, epoch,
version and current selected metadata. Original timestamps and 30-second TTL never
renew. One SQL clock capture is used per call.

Export binds the exact bytes once, initializes one source-free page row, and
traverses at most four pages of five objects. Only the last page retries without
recounting. Partial progress returns partial proof; complete proof requires exact
selected counts and terminal traversal. The whole final bundle and HTTP wrapper
must fit 1 MB before any decision/effect; there is no truncation.

Erase deletes only selected original requests (sections cascade) and selected new
page rows. Original fences and new minimal bindings/digests/decision/effects remain;
`retainedFences=selectedCount`, `committedAt=decidedAt`. Exact receipt recovery after
TTL still requires current authority and unchanged original bytes. Erased collector
IDs cannot restart. Erased new page progress cannot reinitialize under that request
ID. New requests contain flat UUID selection and minimal digests/decision/effects,
with no raw bytes, recursive bundles, filenames, source payloads or new operation
receipt tables. The original user/session cascades are preserved.

Private schema/tables/helper RPCs and public RPC default to revoked for PUBLIC,
anon, authenticated and service_role, with RLS and no client policies. There is no
target grant or provider/Storage configuration. The test grants original collector
and new RPC separately inside a disposable network-disabled Docker PostgreSQL
17.6.1.159 fixture and removes that stack afterwards. Its auth claims and fixture
grants do not prove signed GoTrue Auth or target enrollment.

Run the owned suite from the SQL worktree:

```sh
VP_COVERAGE_PROGRESS_DB_TEST=1 \
VP_COVERAGE_PROGRESS_TS_ROOT=/path/to/sole-producer-worktree \
node --test tests/integration/privacy/coverage-progress-sql/postgres.test.mjs
```

After integration, TS modules can be loaded from this same repository without the
root override. The shared CI registry owner must classify this exact gated file in
the `postgres` lane with `VP_COVERAGE_PROGRESS_DB_TEST=1`; this task has no lease to
edit the shared registry. This is one entry, not a new lane or check policy.

PASS: 18 tests, zero failures/skips/cancellations; docs check, artifact growth and
diff whitespace checks also passed. Evidence:
`artifacts/VPJ-58/coverage-progress-sql/pg-final.log`. The suite replays
all predecessor migrations and verifies default deny, byte-identical old function
source/ACL and schemas/RLS, transactional/applied rollback, current authority,
strict DTOs, exact bytes, historical session export/erase, selection/inventory,
source CAS, cursor/proof, capacity, concurrent NOWAIT locks, fault rollback,
permanent old-ID fencing and new self-inventory/page erasure. SQL projections also
pass the sole TS decoder and actual export controller under SQL claims fixtures.
Early local failures and fixes are retained byte-for-byte in compressed
`pg-r1.log.gz` through `pg-r3.log.gz`, and in `pg-r4.log`.

Rollback for this unactivated scope drops the one new public RPC and new private
schema in a transaction; it does not touch old fences or business data. The test
verifies this rollback and a replay restoring default revoke.

Actual signed Auth→HTTP→RPC, target role/GRANT enrollment, real credentials/data,
Storage/provider, Native private file delivery and physical phone acceptance are
UNRUN in this SQL task. Main/sole producer owns combined caller integration and
required final CI. Full #239, full missing coverage and ALL2 stay OPEN.
