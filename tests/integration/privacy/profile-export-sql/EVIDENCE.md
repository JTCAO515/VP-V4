# Profile snapshot SQL — fixed owned source

Current TIME-boundary increment: `28bff4cba3f1fd6d0e0f46c1f07add0f7d9e9987`,
migration SHA256
`5f1502f4d93d500db35ba7ae52b6b03b474bbc67abd62b8756ec62c00eaa8989`.
The original product/fixture proofs below remain attributed to their earlier
`11df...` source; the final section records the only affected boundary change.

Product commit: `a9cd15f5c21d1e355aaabdde343132ea8c3883d9` on
`vpj58-profile-export-sql-20261007`, based on
`11cdbc2a1bdb29e3c3a4dfe6d45e68effa4cbfac`.
The inherited unmerged ProfileData `0f114f679b89553017a41d18f3fbd6444bf8259b`
dependency remains explicit. This is the sole `20261007040000` append owner.

Migration SHA256:
`11df13431271b902257f03500cc46275cc5dbef27f16aba33ac0314717a70dce`.
No target role, grant, policy/key activation, deployment or device operation ran.

## Actual checks (2026-10-07)

`node tests/integration/privacy/profile-export-sql/run.mjs`: **11 PASS, 0 skip**, final
8.998 seconds. An owned local PostgreSQL 17.6 container used `--network none`, a
private Unix socket, and the current ordered migration files. The append first
ran inside a transaction and rolled back: all prior function definitions, ACLs,
table absence and both original schema guards were restored. The append then
replayed successfully; reviewed catalog and all fixed hook identities passed.
The fixture's authenticated/service RPC grants were confined to that disposable
database. Cleanup succeeded.

The separate standalone CI entry
`VP_PROFILE_EXPORT_SQL=1 node --test --test-concurrency=1 tests/integration/privacy/profile-export-sql/postgres.test.mjs`
also passed **11/11, zero skipped**, 15.666 seconds including its owned fixture
bootstrap and cleanup. `fixture.mjs` supports this direct CI path; no pre-existing
container or target database is assumed. Syntax/diff checks and source policy
lint (774 files) passed. The sole TS integrator owns shared CI registration.

Covered actual new projection through the production TS decoder and canonical
digest: absent Profile/watermark, real saved fields, lawful supplementary,
combining, control and escaped Unicode, six fractional time digits, current pace
save/pause/revoke/Undo, and original preview/erase/progress operation decisions.
Profile receipts count one logical snapshot row/page; `sourceRows` counts real
durable rows. Source overflow and partial claimed Profile fail without artifacts.
Integral numeric scale/exponent/negative-zero normalize by value; fractional and
unsafe revisions and unknown numeric fields fail closed.

The **original public D2 RPC** performed source CAS, atomic artifact/job/provenance
commit, exact commit replay and execution-receipt recovery. Original AES-GCM
helpers decrypted exactly the canonical bundle bytes. Owner isolation, immutable
proof update/delete refusal, account cascade, and original same-owner fresh
session ticket/download behavior passed; worker recovery still rejects the old
session epoch after replacement. This is synthetic SQL authority, **not signed
Auth/HTTP or the registered-worker integration**.

Clear/edit before commit refused the old snapshot. Commit before clear retained
the genuine immutable proof and honest `coreExports` copy inventory. Stale copies
remained managed for repeated clear while read/validate/recovery/ticket/prepare/
consume denied their bytes. Original opaque/custom Profile with no proof remained
`CORE_EXPORT_COPY`; no running `modules=[]` job was called managed. The original
Result copy guard definition remained unchanged. Original unknown-application,
incoming FK and function-definition drift negatives passed, including the unique
two-argument provenance recorder.

The deadline adversary **directly staged the original artifact/job effects** after
the actual private source qualifier, retained the locked running lease deadline,
then delayed past it before calling the actual recorder. The recorder refused and
the whole transaction restored the exact prior job/artifact/proof state. This
private-gate adversarial fixture is separate from the public D2 commit proof.
The recorder also checks that same deadline after proof qualification; it never
renews the lease or substitutes job expiry.

The actual two-connection empty-source check held **original `lock_job_v1` account
locks** and the source capture while a legitimate original Web first save waited
in `guard_mobile_rpc_v2`. Neither Profile nor watermark became externally visible
until the source transaction released. Then the save committed and the old
snapshot commit was refused. A separate owner34 probe confirmed no extra source
advisory lock was present. The suspected missing-row phantom was **not observed**;
the actual original account gate serializes this production path. No additional
advisory lock or writer/enrollment change was introduced.

`node tests/integration/privacy/profile-export-sql/run.mjs --profile-regression`:
**24 PASS, 0 skip**, 73.596 seconds, cleanup succeeded. This reused the unmodified
original Profile/Result tests against the new append: sensitive clear and durable
floors, raw writer/restore refusal, ordinary unenrolled Web compatibility, original
Brief invalidation/mixed copies, old Native save/Undo/Web races, full original
progress, authority/foreign negatives, both original 30-second clock rollbacks,
and managed typed identity/incoming FK/application guards.

The sole TS integrator's separate actual canonical-PG proof is retained at its
commit `27c9853b9cace5d487085bbb0095edc5189f5d24`: **6 PASS, 0 skip**, 1.778 seconds,
cleanup PASS. It exercised every supported closed shape, five locales, safe-int
boundaries, Unicode/time/pace/Undo/full decisions and raw `4.0` mismatch followed by
integer-cast equivalence. That unchanged helper proof was reused, not rerun here.

## Exact reviewed deltas

`catalog-delta.json` and `catalog-edges.json` record one 20-column/16-constraint
private immutable table, PK `(request_id,generation)`, one original-job FK with
account/parent cascade, and one immutable update/delete trigger. Original table,
constraint and FK entries were not removed or modified. Under the schema guards'
actual `search_path=''`, removing only this new table reconstructed the previous
catalog hash `1b026808c513d02dbe168a5fd2698f624283075ba2ae8b8e265e7f4ce4381324`;
adding only it yielded
`9b12fabfeed0f94c195fff2c51a49da1552ac4575f8e2eb720e4fb6f96a3bd72`.
No namespace was newly excluded and no unknown source was silently admitted.

The six reviewed predecessor/candidate pairs preserve original D2 Memory,
entitlement and PDF hooks, commit digest encoding, AAD, policy, session, lease,
recovery and download behavior. Profile inventory includes full provenance rows
and complete composite-key ordering; it qualifies managed copies only after all
original reverse rows are locked. The 30-function `hook-identities.json` registry
contains fixed full-definition hashes, including the actual recorder. Runtime
never captures or accepts replacement hashes.

The source-cap performance delta in `profile-source-cap.patch` starts with the
entire empty-operation snapshot's UTF8 size and adds each item, the actual array
comma and operation-count digit difference before aggregation. Raw-row and row
sentinel bounds remain, and the final entire canonical snapshot is checked once.
Main reviewed these exact shared-function/table/FK/catalog/identity changes and
the original D2/PDF/Profile/Result owners released the corresponding hunks.

Read-only combined-order check: the separately owned `07030000` source at SHA256
`708d01f0f57c8347b122139ec214691712dff2345d7df2dc9ceb0c48405dfc25` changes only
`conversation_data_private.guard_source_v1()`'s body. Its body is absent from all
six exact predecessor checks and the 30-function registry. Profile's catalog
checks refer to its unchanged trigger signature/definition, not that body. It
adds no table/FK/trigger delta, so it does not require a new `07040000` catalog
hash or predecessor definition. The original TS integrator still owns live main
integration; this comparison is not another migration replay claim.

## Earlier failures and remaining integration

The first two full-append runs failed on local SQL assembly: a JS replacement
collapsed `$$` delimiters, then a replacement selected the predecessor literal
instead of the actual function boundary. Complete segment assembly fixed both;
the final append byte sequence passed rollback/replay. The first extra
two-connection run missed the sleeping query because its marker was attached to
the preceding `BEGIN`; putting the marker in the actual held statement fixed the
test synchronization. Those failures were not product/target/Auth PASS.

The original TS sole integrator `01a11667-d333-7853-8e59-cfee16af50f1` received the
exact product commit and migration bytes for the registered worker, signed Auth,
protected download and formal integration. Its read source evidence records the
same migration bytes consumed at `dc5713d2`: **one signed Auth/registered-worker/
protected-download test PASS, zero skip**, case 7209.647 ms / total 10149.559 ms,
owned fixture `vp-native-ask-fc1501b9` cleanup PASS. It used real GoTrue/PostgREST,
original configured D2 worker, actual operation metadata, exact private/no-store
bundle bytes, foreign/old-ticket denial, same-owner fresh-session download, and a
real prepare -> ordinary owner clear -> real consume denial. That result belongs
to the sole TS integrator's `tests/integration/privacy/profile-export/EVIDENCE.md`;
it was not generated by this SQL fixture. Target/provider, Native/device,
old-device, formal review/CI/merge acceptance remain **UNRUN here**.
Parent #239 ALL1/ALL2 is not closed by this bounded SQL implementation.

## Fixture current-order correction

The sole TS integrator found that the reused original Profile replay intentionally
stops at `07020000`, while this fixture then loaded only `07040000`. The earlier
standalone 11-PG PASS therefore proves the fixed `0702` + `0704` set; it does not
prove inclusion of merged `07030000` in a consumer checkout. This was a fixture
loading omission, not a SQL product change.

The owned `fixture.mjs` and `run.mjs` now share a loader which, after retaining the
original Profile replay/rollback, loads every subsequent current-checkout
migration exactly once in filename order. It captures the original Result guard
before `0704`, verifies the same guard after applying it, rejects the historical
SQL override, and requires the current Result dependency instead of permitting
the original replay's historical fallback. The explicit runner also retains the
whole `0704` rollback check after any preceding migrations. SQL SHA256 remains
`11df13431271b902257f03500cc46275cc5dbef27f16aba33ac0314717a70dce`.

Read-only execution of the new ordered-file selector against the TS integrator's
current merged checkout confirmed `0703` then `0704`, one occurrence each;
override refusal, syntax and diff checks PASS. The actual affected standalone
11-PG rerun against that merged checkout is assigned to the sole TS integrator;
it is **UNRUN in this SQL worktree**, whose fixed base contains no `0703`. No
unchanged 24-case regression or canonical matrix was repeated for this fixture fix.

Subsequent actual consumer verification: the sole TS integrator consumed the
fixture fix `df060690c468585e8cfcf104c88b01fb8edfc7c2` as `a053c36f` in its current
merged checkout. Official thread command output
`exec-7e40fdfd-8733-468b-9582-ca23651c2df1` was read here: exit 0, explicit applied
list `07030000_conversation_guide_invalidation_compat.sql` then
`07040000_profile_core_export.sql`, **11 PASS, zero skip/fail**, total 14723.2575 ms,
owned standalone fixture cleanup PASS. SQL SHA256 stayed `11df1343...7a70dce`.
This closes the current-ordered standalone verification gap without rerunning
the unchanged 24-case suite, canonical proof or Auth matrix.

## Lawful PostgreSQL TIME endpoint

The TS integrator's actual current-source probe found an original lawful saved
value which the new export had rejected: authenticated `save_user_profile` accepts
`24:00:00::time`, while `profile_row_valid_v1` originally admitted only hours 00–23.
This SQL owner reproduced original save success, real stored `24:00:00`, and old
source `PROFILE_SOURCE_UNAVAILABLE` in an owned PostgreSQL fixture.

Main reviewed and granted the exact narrow change: the export-only row validator
adds the literal `24:00:00` inside its existing time predicate. It does not rewrite
the value to `00:00:00`, change the original writer/TIME column/permissions, add
tables or change original D2 behavior. Only that function's reviewed full-definition
hash changes from `e02f265a135a57d3049e1eda9d58dfee` to
`847b8f7f39004426cc4668734e02be58` in the 30-function registry. The hook source pin
changes from `ee11dce02749b72cf002562771a3c42c` to
`06bdee5e33bbe7639acc7acd65a7fbe0`; catalog hash `9b12...` and all remaining function
identities are unchanged. The exact row/registry/schema/migration deltas are the
`time-*.candidate.patch` and `time-identity-delta.json` files.

Actual candidate PostgreSQL boundary proof PASS: original authenticated saves of
`24:00:00` and `24:00:00.000000` both project through PostgreSQL `TIME::text` to
exactly `24:00:00`. The new source preserves that value, and its SQL hash equals
the original TS `exportCanonical({snapshot:[item]})` digest. `24:01:00`,
`24:00:00.1`, `24:00:00.000001`, `24:00:01` and `25:00:00` all remain rejected by
the export validator. Strict Profile/Result schema and the fixed hook registry
were true, and owned fixture cleanup passed. No all-zero fractional wire extension
is needed for the actual PostgreSQL projection; PostgreSQL removes that fraction.

The first probe's draft SQL assembly misused JS replacement `$'` expansion and
failed to compile; literal replacement fixed it before the product increment.
An early decoder probe read the integrator's temporary adapter which was then
withdrawn, and encountered the old shared validator's rejection. That was not
counted as a stable decoder PASS. The original Profile owner owns the shared TS
validator correction; this SQL task does not author that shared source.

`time-boundary.mjs` provides one affected original writer -> actual source ->
stable TS decoder/digest proof, with strict schema/hooks and invalid-time negatives.
It is wired into the existing PostgreSQL file for CI and can run alone with
`VP_PROFILE_EXPORT_SQL=1 node tests/integration/privacy/profile-export-sql/time-boundary.mjs`.
Its stable decoder part is **UNRUN here** pending consumption of the original
Profile owner's shared validator; the rest of the earlier 11/24/6 matrices is
reused, not repeated for this time predicate change.
