# Exact PostgreSQL failure / bounded diagnosis for Main relay

PR662 exact13abbe2e MERGEHOLD. Run37346374071/job111886484632: isolated-postgres
537 tests,536PASS1FAIL0skip, unique failure tests/integration/community/review.test.mjs:81
`opposing reviews and withdrawal/review race commit exactly one transition`.
The withdrawal/review race's exactly-one-success assertion passed; the loser error-text
assertion `COMMUNITY_CONFLICT` failed. CI gives no actual loser stdout/stderr or post-state.
No root cause inferred. Quality/native/other green gates do not replace this FAIL.
Official clean log /tmp/vpj662-postgres-failed.log (same as coordinator's clean job log).

Performed ONE necessary bounded diagnostic invocation, retaining original assertions and
runtime unchanged, using a temporary copy of the existing test solely to print results.
Selected the original default-disabled/setup case plus the single opposing race case;
no whole537 rerun/no new fixture matrix. Network-none uniquely owned disposable PG
instance replayed current migrations, cleaned through original exact owned after hook;
temporary diagnostic test removed. Current branch/production/head unchanged.
Full safe synthetic output /tmp/vpj662-legacy-race-diagnostic.log:

- Original setup + race2PASS0skip, remote failure NOT reproduced.
- Opposing review winner code0/statepublished/version2/audits3/receipts2; loser code3,
  stdout empty, stderr `ERROR: COMMUNITY_CONFLICT`, original workspace line64 RAISE.
- Withdrawal winner code0/statewithdrawn/version2/body erased/audits2/receipts2; reviewer
  loser code3/stdout empty/stderr `ERROR: COMMUNITY_CONFLICT`, same original RAISE.

Actual CI loser remains UNKNOWN; no demonstrated production corruption or fixture-only
root cause. Do NOT accept broad lock/timeout/other errors, remove assertions, reopen core
issues from a guessed cause, or blindly rerun all CI. Main please decide exact next
shared-test diagnostic/SQL-owner lease: smallest suggested next step is adding bounded
actual loser code/stdout/stderr + persisted row/audit/receipt assertion diagnostics to
the existing race assertion without changing any allowed result, then capture the
specific failed scheduling path. TS never edits runtime SQL or another owner's source.
No evidence-only push; this WIRE is local relay only until a concrete next action is assigned.

Main now authorized minimal observability in this original same test, with exact diff
first: proposed-legacy-race-observability.patch. Only adds a helper and failure messages
for original assertions: both results code, empty/JSON status+version or non-record byte
shape (never raw stdout body), stderr with fixed synthetic body/note values redacted,
and own source ID/status/version/audit+receipt counts/bodyErased boolean. Every original
one-winner/COMMUNITY_CONFLICT/count assertion remains unchanged. No broader error regex,
retry loop, runtime SQL, matrix or new test. Proposed file syntax PASS; original single
case2PASS diagnostic remains distinct UNKNOWN CI cause. Main please review this exact
diff to complete the necessary shared test lease; only this original TS integrator writes it.
The persisted-state diagnostic query runs ONLY if an original one-winner or exact
COMMUNITY_CONFLICT check would fail. Healthy scheduling paths execute no new query,
preserving their original timing and assertions. No runtime/CI/workflow writes yet.

Explicit final Main lease received for this original test hunk. Applied source preserves
every original assertion; diagnostics emit ONLY nonzero-code losers, stdout safe shape,
redacted stderr bounded8192 characters with original stderr byte count, source-free
persisted metadata and winner count. Normal success paths execute no new SQL. Syntax,
lint and diff checks PASS; the already performed original targeted2PASS is reused as
unreproduced evidence, no new run/matrix. New instrumented head is for actual CI schedule
observation, NOT a root-cause fix or old13abPASS. Original FAIL remains MERGEHOLD until
the actual new required gates complete; core issues stay Main-owned.
