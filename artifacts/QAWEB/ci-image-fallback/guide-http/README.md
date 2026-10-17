# Guide HTTP conflict assertion: synchronize the owned HOLD fixture

Failure retained: PR #686 `8c445913`, native HTTP shard 6, `place-guide-http`.
`original-8c445913-failure.log` preserves the actual observation and failed
assertion (only trailing whitespace normalized in the excerpt): changed played position expected 409 but received 503. The owner RPC
returned SQLSTATE `55P03`, `could not obtain lock on row in relation chat_threads`.
The surrounding native-text, archive and selected-source steps passed; cleanup
passed. No old job was rerun.

Applicability: Main source `4ffb1507`. Guide test, Guide runner and native text
environment are byte-identical between the failed head and this Main source.
`source-proof.json` records working base and exact before/patch/after hashes.
The local integration executes a temporary source snapshot of `4ffb1507` with
only this test patch, using pnpm 9.15.9 frozen lockfile dependencies.

Cause: the shared synthetic environment polls workers every 500ms. Immediately
after accepted submission, its grounded worker can claim/read/authorize the
same thread while the test sends its replay and changed-position request.
The Guide SQL deliberately uses NOWAIT, so that unrelated fixture scheduling
can return a transient lock error before the frozen-operation comparison.
The actual observation identifies this path; no business SQL/lib change is made.

Fix: use the existing `waitUntil` helper to observe the original HOLD question
in the local provider request log before the unchanged replay/conflict checks.
Provider transport follows the completed `authorize_grounded_dispatch` RPC;
the sequential fixture worker then stays parked on that held response. This
orders the test by an observable state, without retrying the request or changing
409, other assertions, product locks, production behavior or workflow selection.
The 10-second bound matches an existing native-text HOLD-provider barrier; no
suite/runner timeout is extended. Worker never reaching the provider fails.

Validation:

- PASS: governance 23/23, zero skipped/todo/cancelled; output retained.
- PASS: changed test syntax, docs check and diff check.
- PASS: local Guide integration 1/1, no skips/todos/cancellations, cleanup PASS; result in `guide-4ffb1507-patched.log`, running the
  existing full Auth → native HTTP → owner RPC test, not a mocked response.
  Node version is recorded in `source-proof.json`; CI uses Node 22 separately.
- UNRUN: all eight Native HTTP shards, full database matrix and exact new PR CI;
  Main owns the integration and protected merge. No target/user/provider result
  is claimed by this local owned synthetic HTTP evidence.

Resources: own temporary snapshot, port base 64800, nonce Supabase project
`vp-native-ask-f8d2fb29`. Existing 16 Docker containers remain untouched. The
runner cleans only its own project/workdir. No actual target, credential or
provider operations; all model traffic goes to the owned local server.

Rollback: revert this scoped test synchronization commit. Main reviews the
stable commit and integrates; no new PR, shared workflow, SQL or product edits.
