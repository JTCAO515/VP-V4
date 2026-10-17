# Portable cancellation proof and canonical UUID delta

Production source: cancellation service validates UUID syntax then normalizes both
original identifiers to lowercase before RPC and strict same-scope decode. No shared
wire keys, states, ack, original cancellation or permission semantics are widened.
Two alphabetic-uppercase cases reproduced 503/unknown before the fix (2 FAIL), then
POST + same-ID GET and unknown-ACK recovery pass (2 PASS). A different UUID remains
refused. Real loopback route/SSR test now uses alphabetic-uppercase URLs and verifies
canonical lowercase success while preserving the original UUID identity.

PG entry (same file, no default skip):

```
QA_CANCEL_PG_BIN=/absolute/installed/pg17/bin node --experimental-strip-types --test tests/integration/qa-agent-cancellation/pg-proof.mjs
```

VP_WIKI_PG_BIN is also accepted when QA_CANCEL_PG_BIN is absent. No pg module is needed
because this proof uses the installed psql. There is no install, PG16 change or old pin
change. Darwin defaults to the approved Homebrew17 bin and /private/tmp; Linux defaults
to /usr/lib/postgresql/17/bin and /tmp. Every root is a short unique 0700 nonce, Unix
socket only, no TCP, fixed local socket port. The selected postgres must report 17.x
before startup. libpq service, password, hostaddr and options inheritance is excluded;
PGPASSFILE=/dev/null. Only its own data/PID is stopped.

The proof snapshots current HEAD's complete sorted migration set and each SQL SHA,
not fixed QA225. Dirty or untracked SQL causes explicit failure; no source is silently
omitted. The allocated cancellation append is applied at its sorted position; old
function ACL/config/source/guard and table/sequence ACL/RLS pins are compared around
that append. Later candidate migrations are also replayed. Main's stable QA3f9b51d0
was normally merged into this owner branch without reset so local proof includes #709
and its already-integrated dependencies. No CI file was edited; CI5 files remain the
original owner's scope. Select the existing native-PG17 lane and explicit entry above.

Default output is <private-nonce-root>/result.json (0600, exclusive create), never a
tracked repository file. Optional QA_CANCEL_PG_RESULT chooses a NEW private output
path; existing results are not overwritten. stdout reports RESULT and own shutdown.

PASS: current candidate b8d26802 source snapshot includes all 157 migrations, including
20261015024450_ios001_goal_return_current.sql. Both explicit output and default private
output runs passed all 14 unchanged original-role/cancellation/race/ledger checks,
with before/after catalog pins equal and own shutdown confirmed. Results remain
/private/tmp/agent001-cancel-portable-pg-result.json and the private nonce result path;
CI will write its own temp results. Linux execution itself remains CI-owned/UNRUN
locally; the portable source does not claim a Linux run. No actual target/GoTrue/provider.

PASS: 5 cancellation contract cases including two new UUID regressions, real HTTP
uppercase recovery case, TypeScript and source lint850/diff. Existing 34 QA and prior14
unchanged production evidence are reused; only PG portability/new-source behavior and
UUID-affected paths were rerun. Main owns the exact-head review, ACL registration and CI.
