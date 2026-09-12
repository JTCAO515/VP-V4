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
final UI rerun is PENDING at this checkpoint. Simulator diagnostic collection
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

Real Staging migration41, dedicated Preview, real Qwen classification, target
native history/restart and final required CI are PENDING. Migration40 remains the
observed shared Staging baseline. A fresh encrypted backup and isolated full
restore passed before any migration41 application. An initial backup's final
connection check failed and was retained; a new complete backup was verified.
No production deployment, alias movement, real booking/payment or Issue closure
is part of this checkpoint. Existing read/Ops switches remain disabled until an
explicit bounded validation window.

Contract and rollback: docs/contracts/vpj-16.md. Ordinary modes use their existing
policies and RPCs. This mode requires separate notice/consent and opt-in runtime
configuration; disable that entry/worker to stop new processing while retaining
history and budget records. Applied migrations are append-only.
