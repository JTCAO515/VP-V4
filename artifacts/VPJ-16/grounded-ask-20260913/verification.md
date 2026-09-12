# Bounded grounded Ask — development evidence

Related to #206 / #195 / S2. Base main e132baf0c17be3c67bed101bb4c0c39f1e00b36d.

Current user result: a natural-language adult foreign-passport domestic railway
boarding-document question can produce reviewed first-party facts, retain a
ServiceTask result and revalidate its original evidence on history reads. The
model only classifies the current input; compound needs remain partial. This is
not general travel-question coverage or complete S2 acceptance.

## Verified locally

- Grounded database: 10/10 PASS, all41 migrations plus rollback; city-bound replay,
  private result isolation, original claims/fact IDs, withdrawal/new-conflict
  historical suppression, no replacement by later support, four-turn cap and a
  real publication-lock wait crossing lease expiry.
- Existing explicit question: 9/9 PASS; existing text/ServiceTask: 26/26 PASS.
- Native HTTP: PASS with actual disposable GoTrue, credentials, Next API, SQL and
  worker/budget. Provider is a controlled synthetic HTTP endpoint. Four new
  requests dispatched exactly four times; duplicate POST/history did not charge.
- Gateway intent: 3/3 PASS. Deadline/worker/security: 47/47 PASS.
- Full contracts: 256/256 PASS after repairing a scheduler-sensitive old test.
  The first 255/256 run remains recorded: a25ms pre-dispatch timeout was mistaken
  for an acknowledgement-unknown result. The corrected case cancels only after
  observing RPC dispatch; production deadline code is unchanged.
- Native state/persistence/knowledge: 28/28 PASS. Signed Simulator build PASS.
- Native zh/en UI: 2/2 PASS on iOS26.5 Simulator. Real app login, consent, submit,
  qualifiers, evidence display, termination/relaunch and tab return. Two synthetic
  model calls total, one per language, current-input-only; no source egress.
- Build, lint, typecheck, static tests and docs checks PASS.

The first native UI run failed because the consent screen had no refresh deadline
and polled every second, racing acceptance. No provider call occurred. That
failure and interrupted-run exit73 remain recorded. Initializing the consent
refresh interval fixed it. A subsequent change also wakes polling when a new
pending turn appears, instead of waiting for the previous idle snapshot deadline;
final UI rerun passed2/2 on the same native source, with two calls total. Simulator diagnostic collection
reported an xcrun/simctl path warning after the successful UI tests; the xcresult
and screenshots were exported successfully. Manual VoiceOver/max-text and a
physical-device run are UNRUN.

## Independent review

0 Critical / 0 Important for the migration and associated authority boundary.
Final reviewed migration SHA256:
333133ded04a741772037f52d3b07013fe365256f9dd594a0880e9da1bd58389.
The reviewer required original-claim pinning and post-wait lease revalidation;
both are implemented and tested. Four-turn admission was reviewed separately.

## Integration boundary

Real Staging migration41 was applied after a fresh encrypted backup and full
isolated restore passed. The first backup connection-check failure is retained.
Original77 tables/data and249 pre-existing schema entries were checked, with only
the declared function changes; users6/Trips3, published11/revoked1 preserved.
Dedicated Preview on8022b5a and real Qwen prompt v2 passed16/16 semantic cases.
Actual zh/en native submissions and process restart reads passed; two native
requests produced exactly two settled attempts. Turning reading off hid all facts
and returned unavailable within9.17seconds. Read/Ops are off, active members0,
WAF returned to its previous host set at version18. See staging-v2/README.md.

A native reading defect was observed: deadline rechecking collapsed the history
and reset the scroll position. The follow-up keeps layout while hiding expired
rows from rendering, accessibility and interaction. Its cross-deadline native
zh/en regression passed2/2 (native-ui-4.log), with two synthetic calls total.
Final Staging read-only verification of the scroll correction remains pending. Physical
phones, full S2 and production release are not accepted by this evidence.

Contract and rollback: docs/contracts/vpj-16.md. Ordinary modes use their existing
policies and RPCs. This mode requires separate notice/consent and opt-in runtime
configuration; disable that entry/worker to stop new processing while retaining
history and budget records. Applied migrations are append-only.

## Real classifier v1 findings

Staging41 and dedicated Preview on688b9bd were observed. Twelve real Qwen calls
completed once each. Ten expected classifications matched; two failed: a Chinese
prompt injection whose actual question concerned a six-year-old, and an English
lost-passport/photo exception were incorrectly labelled additional_needs and
showed ordinary adult boarding facts. Their complete first-run evidence is in
staging-v1/evaluation.json. This is a semantic FAIL, not accepted partial support.
That v1 read window was closed and its policy revoked. No native model submission
was performed under v1.

Prompt v2 now first separates actual questions from format/intent instructions,
prioritizes exception-only unsupported topics and requires an independent ordinary
document question before adding a supported portion. Revalidation on the original
cases and four new contrasting cases passed16/16 once each; see staging-v2.
Schema tests alone do not establish semantic success. No factual resolver, eligibility, permission, budget or SQL contract was
changed by this prompt correction.
