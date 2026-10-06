# VPJ-58 selected archive SQL

Base `31e8db3110c05cb156d3d6f37595818efccbff9d`, branch
`vpj58-archive-data-sql-20261006`. Sole append migration:
`supabase/migrations/20261006050000_archive_data.sql`. The sole server producer's
`lib/server/privacy/archive-data/WIRE.md`, `contract.ts`, and `rows.ts` are the
closed contract; this SQL does not introduce another wire or a new export domain.

`public.privacy_archive_data_v1(text,text,bigint)` takes original UTF-8 command
bytes and the expected mobile epoch. `export_start` carries `action:"export"`;
other RPC actions equal their command action, including `validate`. Validation
returns the stored original export-byte digest for the consumer's original file
binding, rather than a digest of the different validate command.

The current ordinary owner must have a non-anonymous authenticated role, an
existing auth user/session, matching current mobile account/attempt/epoch and an
original session creation time within five minutes. Lock order follows the old
owner advisory (`hashtextextended(owner,34)`) → auth user → mobile account →
existing lifecycle owner head → session → confirmation proposal → Trip →
archive/state/snapshot/confirmation event/idempotency/operation → new metadata.
Locks use NOWAIT. Unlike the old lifecycle lock helper, this reader never inserts
an owner head. Authority and reauth checks precede input parsing and all writes.
Foreign and absent recovery IDs use identical owner-filtered unknown responses
before new key/row locks.

Archive source uses the original `export_private.trip_content_v1` safe projection
and the original event/proposal/idempotency confirmation join. Trip owner, archive
head and head snapshot title must agree. Available snapshots are exported as
stored, version 0 through the archived head; missing versions are counted without
fabrication. The actual snapshot column is NOT NULL, so missing history is proved
by absent versions rather than invented nullable content. Only original operation
rows with matching owner and selected `trip_id` are exported, and their receipt's
Trip must match. Previous-active-only rows remain in the original lifecycle domain.
No raw operation bytes, hidden snapshot fields or arbitrary attachment domain is
exported. Digests include the actual source rows and confirmation provenance;
queued deletion, source changes and revocation invalidate live export/validate.

New private tables contain only bindings, fixed time/digest/nonrenewal fences,
flat section counters/cursors and a finite immutable metadata erase receipt.
They contain no Trip body, snapshot payload, file bytes, URL or recursive receipt.
Owner and original session FKs retain account/session cascade. Trip deletion does
not silently delete the independent metadata privacy exit. Lists discover all
retained requests, including expired and historical-session records.

List pages are 20; source pages are 50. Inventory and each source section have
10000-row bounds with a 10001st sentinel. The complete JSON bundle plus HTTP
wrapper is checked against 1000000 UTF-8 bytes before effects. Empty sections
require a terminal page. Only the exact last cursor/limit replays without recount;
complete proof requires every section's expected rows/pages and terminal state.
One original 30-second deadline is checked after source hashing, before effects
and after effects/serialization. A late decision rolls back the entire RPC.

Explicit progress erase clears only selected transient counters, marks the
selected records `progressErased`, and retains the original fences and any prior
minimal receipt. It creates its own immutable finite receipt. The erased old key
cannot restart an export or validate an old file. Exact same-byte receipt retry
and recovery survive TTL with the original decidedAt, but still require current
owner/session/epoch/reauth. Source Trip, original archive and original deletion
handler are untouched; external file copies are not erased.

All private schema/table/helper and public RPC privileges default to revoked for
PUBLIC, anon, authenticated and service_role. Both new tables use RLS without
ordinary client policies. No target grant, role, key, Storage/provider enrollment
or deployment is part of this change.

Run the owned fixture suite:

```sh
VP_ARCHIVE_DATA_DB_TEST=1 \
VP_ARCHIVE_DATA_TS_ROOT=/path/to/sole-server-worktree \
node --test tests/integration/privacy/archive-data-sql/postgres.test.mjs
```

The optional TS root loads the actual sole producer's strict decoder and collector;
after integration it defaults to this checkout. The shared registry's sole owner
registers this exact file and flag in the existing PostgreSQL lane. This SQL task
does not edit the registry. The fixture replays predecessors in a disposable
network-none PostgreSQL 17.6.1.159 container, makes separately scoped local fixture
grants, and removes its container. SQL claims fixtures and corruption probes do
not prove signed Auth, Native delivery or target activation.

Rollback removes only the new RPC/schema/consumer registration through the
reviewed append/compatibility path. It never edits applied migration history or
restores erased/revoked business data. The suite separately verifies transactional
rollback, owned fixture drop/replay, and unchanged original source/schema/RLS/ACL.

## Local evidence and remaining acceptance

Runtime/owned tests fixed at `f91ca39d35e2c55b1f740056ac499aec4feac928`.
PASS: 19 tests, zero failures/skips/cancellations, 82.378 seconds, with the actual
sole server producer decoder/collector. Evidence is retained in
`artifacts/VPJ-58/archive-data-sql/pg-final.log` and `verification.json`, including
the code and producer file hashes. The container was removed after the run.
Docs check, source policy lint, owned test syntax and diff whitespace checks passed.

The cases include default deny/RLS; transactional rollback and owned drop/replay;
unchanged ALL original function source/config/ACL and table columns/RLS/ACL;
ordinary authority before parsing/writes; original confirmed Trip creation/archive;
safe head/all available history and missing versions; exact bytes and selection;
foreign/absent recovery; independent ordered pages/replay/empty terminal/proof;
queued deletion and corrupt owner/head/title/archive/source negatives; historical
sessions and original account/session cascades; finite metadata export/erase;
nonrenewal and current reauth; late source and late effect rollback; natural
30-second expiry with byte-identical original terminal receipt recovery;
10001-row inventory/archive/snapshot/operation overflow; UTF-8 overflow; an actual
source below 1 MB whose complete wrapper exceeds 1 MB; real NOWAIT source/session/
account locks, concurrent erase CAS and zero database deadlocks.

Two added fixture expectations initially failed: attempting NULL content violated
the actual source NOT NULL constraint, and the preliminary wrapper fixture size
estimate was too low. The final cases preserve the source constraint, test actual
missing head/history instead, and compute the exact source bytes before asserting
the wrapper overflow. No runtime guard was relaxed to pass these tests.

UNRUN in this SQL task: signed GoTrue Auth/HTTP, target GRANT or deployment,
provider/Storage, real-user deletion, Native private-file/share/foreground delivery,
physical device, whole #239/ALL2 and unified target acceptance. The sole TS and
Native owners retain their respective independent integration work. This is
complete owned SQL development, not whole parent or production acceptance.

## PR #667 CI fixture correction

The original `721b4fb0` PostgreSQL run `37393259342` / job `112043318371`
failed case 14's direct historical source-size query under the existing 5-second
statement budget. The old fixture placed thousands of ASCII-title items in one
snapshot array, exercising cumulative JSONB append cost in the unchanged original
safe projection before reaching the public RPC's wrapper-capacity assertion.
Only this byte-bound fixture was adjusted: equal near-limit UTF-8 bytes now span
the two actual stored historical versions, with legal 1..160-character titles.
Source >999700/<1000000, exact actual source bytes, public RPC ARCHIVE_CAPACITY
and unchanged metadata after refusal remain asserted; no budget/guard changed.

One local run observed case 14 PASS, source exactly 999950 bytes, 964 items per
historical version, direct source query 207 ms and complete case 2642 ms. That run
is FAIL overall (17 reported nodes PASS, case 15 and parent FAIL, zero skip): the
unchanged eight serial held-lock probes took 33228 ms and their shared original
preview correctly expired after 30 seconds. Its ARCHIVE_EXPIRED differs from the
test's expected lock-conflict error. That separate fixture issue was reported to
Main; it was not changed under the case-14-only freeze scope. Preserve both prior
CI FAIL and this local FAIL in `ci721-case14-fail.log.gz`, `ci667-fixture-after.log.gz`
and `ci667-fixture-diagnosis.json`. New-head CI remains UNRUN/MERGEHOLD; this is not
a runtime performance fix or renewed whole-scope/target acceptance claim.
