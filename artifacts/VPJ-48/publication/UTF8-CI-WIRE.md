# New exact e46f PostgreSQL failure / shared fixture transport diagnosis

Run37351437710/job111904019137,537 total536PASS1FAIL0skip. This is a DIFFERENT failure:
tests/integration/community/submission-j1-postgres.test.mjs:104 maximal legal title
80 emoji/content2000 emoji succeeds in SQL but canonical TS decoder rejects operation.
Original legacy race now PASS in this run; old13ab loser cause remains UNKNOWN.
Actual clean job log /tmp/vpj662-postgres-e46f-clean.log. No actual rejected payload is
present in the old test assertion, so do not invent the exact CI payload/root cause.

Concrete deterministic bug found in shared fixture transport:
tests/integration/cost/fixtures/postgres-rpc.mjs command() accumulates Buffer chunks
using `stdout += b` / `stderr += b`, decoding each independently. Forced valid UTF8
emoji split across two child output chunks returns code0 with THREE U+FFFD replacement
characters, UTF16 length3 instead of expected2. Current helper reproducer (no database,
no secrets, no product writes) actual output /tmp/vpj662-utf8-command-diagnostic.log.
That corruption can turn otherwise legal boundary content into a canonical decode
failure. It is a proven fixture transport bug; exact CI payload remains unobserved.

Main please coordinate precise original shared-helper lease, no TS runtime SQL writes:
only set stdout and stderr stream encoding to utf8 before data listeners, preserving
the command/sql API, arguments, stdout/stderr strings, errors, all caps/decoders/assertions,
PG isolation/cleanup and test schedules. Proposed minimal hunk below; not applied yet.
No wide allowed-error list, no weakened decoder, no blind whole-lane retry.

Main execution lease received. Actual scan134WTS finds zero dirty competing helper writers.
Applied EXACT two setEncoding('utf8') lines before stdout/stderr data listeners. Deterministic
after-proof /tmp/vpj662-utf8-helper-after.log: both split streams preserve exact emoji,
nonzero exit3 stays3, original canonical maximum legal response remains160/4000 UTF16,
no U+FFFD; stdout/stderr command contract and SQL/API/caps/assertions unchanged. Original
maximum-emoji case plus its original necessary setup case is running ONCE, no new matrix.
The helper bug is fixed; old legacy13ab race cause and e46 exact payload remain unobserved.
Old real FAILs retained, final new head will require actual formal/CI, not inference.
Actual ONCE original J1 full-replay/default/ACL setup + maximal-emoji case2PASS0skip,
unchanged original tests/typed decoder; /tmp/vpj662-original-emoji-after.log. No additional
cases/matrix or runtime source edit. This verifies the fix under the original consumer
path and deterministic split proof; exact old CI response bytes were not captured.
