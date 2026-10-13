# QAWEB-01 service delivery evidence

Product source head: d1c692f98160be48780d7ee1fd89dc3e8e6c78c0 (2026-10-13).
Subsequent evidence/build-script pin changes do not change runtime source.
Own branch codex/qaw005-service-20261013, base daa7bae44a660381fb3295d0d2afc327ea98d3ba.

PASS: 26 tests under tests/security/qa-agent-service, including actual SSR cookie SDK
with intercepted synthetic Auth/PostgREST transport; strict Origin/authorization/host
negative paths; original IDs/bytes, duplicate/lost ACK, refresh, foreign Session and
revoked consent; new policy-mode refusal, same canonical Task continuation; original
lease-budget identity, single physical send, unknown dispatch/settlement/completion,
hostile cancellation; concrete provider/DB credential isolation; hosted v3 candidate
plus sole context composer plus original model protocol/transport and secure journal;
read-only auditor valid cost, foreign/hash/duplicate inconsistency rejection.
All provider/DB responses in this suite are synthetic; this is not actual target evidence.

PASS: full repository TypeScript with own source. PASS: full repository TypeScript
through a virtual compiler host overlay of both exact shared after-candidates plus
context writer source (no writes to shared paths). PASS: source lint 825 files.
PASS: both zero-context patches apply-check against their exact base; diff whitespace.
PASS (unchanged evidence reused): 25 original scoped/hosted worker tests, including
budget/unknown ACK/cancellation; no existing worker source was modified by this writer.

Local commands:

```
QA_CONTEXT_TEST_ROOT=<context-writer-WT> node --experimental-strip-types --test tests/security/qa-agent-service/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
QA_CONTEXT_TEST_ROOT=<context-writer-WT> node artifacts/qa-agent-service/hosted-worker-candidate/typecheck.mjs
node scripts/lint.mjs
```

After Main integrates context, omit QA_CONTEXT_TEST_ROOT and use the same checkout.
Shared candidate application is Main-only, after matching pins.json and
usage-audit-pins.json. Use `git apply --unidiff-zero` or write the exact after file;
only check/apply against the recorded before SHA. Build.py refuses an unknown base.

Observed failures retained: first SSR test used 127.0.0.1 while NextRequest canonicalized
it to localhost; fixture Origin was corrected without relaxing production checks.
Initial reused dependencies lacked @apple/app-store-server-library; own frozen pnpm
install resolved it without manifest/config change. Virtual typecheck initially lacked
virtual directoryExists support; its loader was fixed, then full candidate check passed.
Initial full-context patch text had whitespace-only diff context; regenerated zero-context
patches retain the exact same after source SHA and pass whitespace/apply checks.

UNRUN: real QA deployment/browser login/provider answer and refresh; actual ECS worker
installation/stop switch/credentials/budget/policy activation; real target migrations,
usage invoice/ledger reconciliation; independent final-head review and required CI.
Main owns target integration and platform access. Local filesystem absence is not
proof of missing keys on the actual Hong Kong ECS worker.

Existing worker secure inputs, names only: VISEPANDA_HOSTED_TEXT_WORKER,
VISEPANDA_HOSTED_WORKER_PROFILE (closed v3), VISEPANDA_HOSTED_WORKER_JOURNAL_DIR,
VISEPANDA_HOSTED_WORKER_SECRET_MODE=files with original tmpfs db.key/qwen.key,
or the original VISEPANDA_HOSTED_WORKER_DB_KEY / VISEPANDA_HOSTED_WORKER_QWEN_KEY
closure handoff. The worker remains outside Vercel; no secrets were printed/read here.
