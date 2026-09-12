# Bounded continuous Staging worker — local verification

Scope: #195/S2; one owner/policy/budget, explicit expiry, continuous processing of
later native HTTP submissions through the existing job. No remote activation,
new provider request, scheduler installation or native UI claim in this receipt.

- PASS: service/job unit tests 13/13; actual CLI creation, private journal,
  SIGTERM, duplicate journal refusal and fail-closed expiry/recording behavior.
- PASS: lint and TypeScript checks for the runtime increment.
- PASS: full contract suite 244/244, zero skips.
- PASS / INCOMPLETE: full security suite 142 passed, zero failed, one skipped.
  The skipped AI-14 RLS/fault-rollback test requires its separately configured
  disposable identity database; this is not a complete database-security result.
- PASS: `node tests/integration/turn/run-native-http.mjs --service`, 1/1, zero
  skips, 44.65s test body. Disposable Auth/Postgres + Next native HTTP + controlled
  model server; two actual service CLI processes, stopped and restarted once each.
  Later v1/v2/v3 requests were consumed, task history retained, settled replay stayed
  settled once, cross-owner reads stayed empty, cancellation/withdrawal/session
  replacement remained enforced. Both restarts retained the original absolute expiry.
- Initial integration FAIL (twice): the final assertion incorrectly required no
  failed service exit even after deliberately cancelling an in-flight request.
  Metadata journal showed the underlying worker returning unavailable; service
  stopped as designed. Test now requires zero failed exits before cancellation,
  then exactly that service exit, retained unavailable receipt and one provider
  call for the cancelled request. Runtime behavior was not weakened to pass.
- Independent runtime permission/cost review: Critical0 / Important0. Additional
  deadline-abort probes passed. Local test-helper changes were author-reviewed.
- PASS: docs generation/check and diff whitespace check.

Required CI/build remains pending at receipt creation. Real Staging continuous
operation, native submission through this service, retained bilingual semantic
failures and complete #195/S2 acceptance remain open. The bounded-thinking
experiment did not resolve the fixed clarification case. Phone validation is deferred.

Rollback: stop the explicitly launched process. No service auto-restart is installed;
keep journal, accepted Turns, database leases and unresolved supplier cost holds.

## Actual scoped Staging/native observation

Runtime/native source49e0b4febd61c4cd4cb765ba38b303f0df13a0a6; API
b542eadff6a5057445c6d3311ebd5d166c0dad55 at the existing Staging alias. Existing two
synthetic owners, policy and budgets only; no policy, budget, deployment or daemon
configuration changed. Three explicitly launched service processes (English,
Chinese, then one English restart) each processed one request and stopped normally.
Both English processes retained the exact same configuration digest and expiry.

Observed via the actual native UI, without submitting through a test-only API:

- Chinese exact-input case: native Send → automatic worker → real Qwen → native
  `answered`, “面朝东。” Same final restored after app termination/relaunch.
- English initial case: **fixture FAIL**. AXe HID typing encountered the Simulator's
  Chinese IME and changed the intended English into mixed-language text. The actual
  input and Qwen clarification were retained. This does not pass the original case.
- Corrective continuation: paste text into the native composer and compare its
  actual accessibility value byte-for-byte before sending. One explicit supplement
  to the test plan permitted exactly one clarification in the same ServiceTask;
  no new root or original-request replay. After worker restart, the native result
  was `answered`, “You are now facing east.” SQL confirms the original parent,
  `clarification` relationship and unchanged task ID. Both Turns restored on relaunch.
- Other-owner history stayed absent; both synthetic users signed out afterward.
  All services exited0 and the owned simulator was deleted. Existing records remain.
- Three distinct supplier attempts across two ServiceTasks are all settled. The
  existing conservative tariff calculates CNY0.015516 (5658 + 4512 + 5346 micros).
  This is not supplier invoice verification or proof of user billing behavior.

The process and destination journals, exact cases, continuation supplement, SQL
result evidence and cleanup receipt are retained alongside this file. Screenshots:
[Chinese final](zh-answer.png), [English continuation final](en-answer.png).
The input mechanism was fixed only in the private test driver, not product runtime.
The native build succeeded; the changed runtime already passed the required
Quality34667887047 and Budget34667887041 checks at49e0b4f. Final evidence CI remains
required for the later documentation/artifact commit.

This establishes a bounded real Staging service run, native input/final recovery
and one real same-task clarification. It does **not** establish always-on operation,
crash-ambiguous submission persistence, full outcome coverage, grounding, the fixed
missing-direction clarification criterion, or complete #195/S2 acceptance. Prior
semantic failures are retained and are not replaced by these fully specified inputs.
