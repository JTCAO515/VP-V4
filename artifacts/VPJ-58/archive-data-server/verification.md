# Archive data owner exit: source and verification

Integrated runtime `0d1ee010ed6573fe97009f02dfe589d3b9d32ca4` combines TS,
SQL `f91ca39d35e2c55b1f740056ac499aec4feac928` (evidence `328edd9c`) and Native
`326ed3c05834f05e7cc28493c6e071eb5e7df6ed`. Original archive/lifecycle/D2 runtime
has no change. Catalog replaces only archive, keeps34 modules and all other
missing entries. Two explicit scopes include the finite inventory/exit of this
new request metadata; selected Trip deletion stays with the original handler.

PASS: eight affected TS closed-command/source/collector/registration tests;
sixteen original coverage/archive/lifecycle-export affected tests, separately run.
PASS: typecheck, source lint, docs check, full diff whitespace check and actual
DB CI classification (PG gate plus owned Auth runner63240).
PASS: full Next production build on TS `d6c1cec0`; later decoder changes only
reject coerced enums/non-null-schema violations and deduplicate catalog metadata.
Affected tests/typecheck cover these later changes; no repeated full build.

PASS: [SQL19 tests, zero skips](../archive-data-sql/verification.json), including
actual PG payloads through the sole TS decoder/collector. This uses controlled
SQL claims and fixture grants; it is distinct from signed Auth.

PASS: one signed ordinary Native Auth/HTTP complete chain on combined `b594e98c`,
owned fixture `vp-native-ask-0d6da3ee`, base63240. Original create, visible Proposal
diff, confirm and archive precede real owner list/preview/export. The registered
mother coverage response remains partial until private local file verification.
The file source includes the actual safe head, two stored snapshots and an empty
operations section with its own terminal proof. Selected metadata erase/recovery
preserves the original archive while invalidating that file request; a new
explicit request can export the same source. Original Trip deletion returns202
queued (not completed) and immediately invalidates list/validate; the endpoint
offers no GET/public URL. Fixture RPC revocation denies access. Fixture cleanup
PASS; only this isolated fixture receives the grant. Later non-null decoder
correction preserves all legal actual payloads from this chain.

PASS: final Native `326ed3c0` unsigned App/testbuild (r4), then affected app5 plus
actual Session1, six total/zero skips in r5. `xcresulttool` confirms this result at
`/tmp/vpj58-archive-app-final-r5/tests.xcresult`. The separately corrected legacy
selection runs exactly3/zero skips in r6 at
`/tmp/vpj58-archive-legacy-final-r6/tests.xcresult`; the original r5 legacy selection
did not run those cases and is not counted. Three support cases were separately
run in an iOS package, not a single12-case App run. The Native owner reports all
owned simulator shutdown/deletion exit0. No new business source follows from
these final runs; they validate the final non-null decoder/fixture and the actual
Session and original catalog consumers.

UNRUN: target RPC grants/roles, deployment, Storage/provider/fees, real user data,
physical device, ALL2 and all-account/full-ALL1 missing-handler acceptance.
Whole#239 remains Open; allUserDataCompleted is always false. External copies and
financial/backup/source fields outside the original safe projection retain their
explicit boundaries. This source introduces no business restore or second delete
engine and does not reinterpret an old D2 artifact.
