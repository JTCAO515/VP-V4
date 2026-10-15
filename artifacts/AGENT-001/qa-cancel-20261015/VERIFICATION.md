# AGENT-001 explicit QA cancellation

Base: 22559396eec5cd47d3a4d3d2a2bd5e49d52c6c7c; isolated owner branch
codex/agent001-qa-cancel-20261015. Early real route/contract source: 05bdfaca.

PASS: 3 strict public-contract/service cases; real loopback HTTP invoking the actual
GET/POST route exports + real Supabase SSR cookie SDK with synthetic signed JWK and
intercepted RPC, including missing Cookie, Origin/CSRF, Bearer rejection, exact closed
body, duplicate stops, unknown POST ACK -> original GET recovery, not_observed,
foreign Session, revoked session and malformed authoritative receipt. This is actual
HTTP/controller/SDK behavior, not actual GoTrue/PostgREST or target acceptance.

PASS: 14 original-role native PG17.11 cases after replaying the fixed Git baseline
and the sole Main-allocated append. No fixture GRANT was added. Cases cover pure
not_observed GET (no account/request creation); actor/Session/request/QA-mode isolation;
authenticated-only EXECUTE; distinct request UUID -> canonical Turn; queued/leased/
dispatched stop; duplicate event; consent/policy/budget disabled; immutable Trip and
ledger snapshots; preserved terminal text; publish-first and cancel-first concurrent
transactions; revoked active auth session; late output cannot revive a cancelled Turn.
All existing function ACL/config/source and table/view/sequence ACL/RLS metadata were
compared before/after. New function owner=postgres, SECURITY DEFINER, empty path,
auth true, anon/service false. Proof uses synthetic auth.users/auth.sessions/claims,
not real GoTrue/JWT enrollment. Provider/fees are synthetic; no remote call occurred.

PASS: 34 selected contract + affected original QA service/read/capacity/reconciliation
cases; full repository TypeScript and source lint (847 files); diff checks. Original
qa-agent/1 projection and model/worker/identity/Native/Trip code were not changed.

CI/node:test entry: node --experimental-strip-types --test tests/integration/qa-agent-cancellation/pg-proof.mjs
Optional test-only QA_CANCEL_PG_BIN selects the installed private PG17 bin directory.
Darwin defaults to the approved Homebrew PG17; Linux can use /usr/lib/postgresql/17/bin.
This explicit file is not automatically collected as a generic network test; Main
CI owner assigns the existing isolated DB lane. No CI file is edited here.
PGPASSWORD/PGSERVICE are excluded and PGPASSFILE=/dev/null prevents credential lookup.
It creates only a unique /private/tmp/a1c-<nonce>-* 0700 data root, short private Unix
socket, no TCP, and always stops its own pg_ctl data/PID. All recorded proof instances
were stopped; synthetic data/logs retained for diagnosis. It never uses Docker, Stage,
Main's existing nonce or another process's resources. Git-pinned migration replay
avoids untracked parallel migration preparation; the one new allocated file is applied
separately. Raw pg-result-*.json records original and final checks, including the first
candidate proof and subsequent ACL/Trip/GET-read-only strengthening, without deleting
prior evidence. No test failure was hidden or check weakened.

Boundary: original cancel_chat_turn updates canonical Turn/event/capacity only. This
bridge does not cancel a supplier's physical request, release/settle model cost,
undo an applied Trip, or create a new Task/message/queue/receipt store. Unknown costs
remain unknown; an ACK loss cannot certify a stop. UI must retain original IDs.

UNRUN: original Web owner actual consumer integration/browser joint checks; real
GoTrue, target migrations/75+80 gates, shared DB/provider/fees/ECS configuration,
independent exact-head review, selected CI and protected merge. Main owns global ACL
allowlist/new-function registration and target sequencing. #680/#681 are not closed by
this source slice. Public DTO/route stable source is provided for Web integration;
no components/qa-agent file was edited here. Prior cross-chat send auto-review rejection
was respected; this owner uses local source/final delivery, no alternate send workaround.
