# VPJ-78 conversation reads during producer rollback — 2026-10-01

Base: `27c45b054879c0c57adc75cf6e920327b6bd00da`. Related to #559, #562 and #564. This fixes the existing rollback invariant; it does not accept those complete issues.

## Defect and changed behavior

With the v5 assistant Conversation flag off, both the policy bootstrap and GET conversation were unavailable, so an already accepted goal/task lost its native read path. Only new message intake and new text-consent acceptance now require that producer flag. Policy readback and GET conversation retain the existing text runtime/policy, verified JWT, active native session, owner and current-consent checks. The broader base text-runtime kill switch still disables reads. This change does not recover withdrawn content, activate any producer, dispatch a model, change a grant or alter an RPC/migration. Existing v1 cancellation is retained.

## Local reproduction and verification

`node --experimental-strip-types tests/integration/turn/run-native-http.mjs --assistant-rollback` starts a uniquely named disposable loopback Supabase stack; no existing repository .env, shared Staging or provider account is used. The regression first failed on the baseline: owner GET returned **503 instead of 200** after turning off new intake. After the fix it passed **1/1, 0 skipped**.

The test admits real local Auth accounts, a saved goal and a referenced existing ServiceTask through the existing Next/native HTTP routes, then invokes the actual NextRequest HTTP handlers with new intake disabled against that Auth/Postgres stack. It verifies policy bootstrap, saved conversation/task read, no-store, cross-account empty reads, anonymous/cookie/origin/query denial, no new message/consent writes, task cancellation, base-runtime kill switch, withdrawn-content denial and replaced-session denial. The provider is a local synthetic HTTP fixture only. Handler invocation is not a deployed Staging/router test.

The test is registered in the supabase-http-native CI lane with the existing disposable runner; the added --assistant-rollback option uses the same target checks and cleanup. Existing native-text-http tests are untouched to avoid the active #581 owner.

- PASS: real local Auth/HTTP-handler/Postgres regression 1/1, including the baseline red reproduction above.
- PASS: lint/typecheck/docs/diff checks; DB-lane classification and its governance tests 5/5; focused native gate security 5/5; contracts 698/698.
- INCOMPLETE: full local security suite 192 passed, 0 failed, 1 skipped (the existing AI-14 disposable identity target was absent). The first full run failed its old expectation of 503 for an anonymous disabled-mode GET. The updated regression requires 401 for that read and 503 for new messages/grants on Local/Staging/Production, with zero fetch calls; all final executed security checks passed. The gated AI-14 target is covered separately by the required CI database lanes.
- UNRUN: target Staging/provider, physical device and full v5 disabled-mode UI recovery. Entire base-text shutdown requires a separate read policy and is intentionally not overridden here.

Rollback: revert this route-gating fix; no migration or stored data is changed. The previously observed read-unavailability defect would return. Keep #559 open for the remaining real consumer/export/delete acceptance.
