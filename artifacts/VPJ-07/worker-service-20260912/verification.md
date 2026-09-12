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
