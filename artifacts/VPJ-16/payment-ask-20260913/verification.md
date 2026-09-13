# S2 payment Ask — implementation and acceptance in progress

Related to #195 / #206; base c53392220e04c98028fa565812bf29893d96e358.
One user result: a mainland-China payment question receives current reviewed guidance,
with exact requested coverage, explicit gaps and original sources in native zh/en and Web readback.

## Scope

The versioned current-input classifier routes card acceptance, mobile merchant setup, cash
access, their three exact pairs, or an all-options overview. Fees, rates, specific acceptance,
transfers, failed transactions and payment execution are not inferred from general procedures.
A separately requested unsupported need remains partial. Rail-document behavior remains supported.
No model receives knowledge/source/history/Trip text. Classification is never evidence.

The appended migration generalizes the existing private resolver with fixed assertion relations.
It retains locked publication snapshots, exact subject/predicate/object matching, original
historical obligations, consent/owner/dispatch checks and the post-wait lease check. No publication,
policy activation, permission expansion or user-money operation is included. Adjacent ownership:
shared model prompt, Web projection/copy, native model/cards and tests must change with this
#206 contract; old applied migrations remain untouched.

## Observed evidence

- Local PostgreSQL reviewed-question suite: 10/10 PASS, including transactional migration
  rollback, real publication/review/revoke operations, exact payment relations, bilingual
  qualifiers, capacity, identity and concurrent publication locks.
- Local PostgreSQL grounded-turn suite: 12/12 PASS, including payment dispatch requirement,
  foreign owner denial, immutable missing historical claims after later publication,
  withdrawn original facts, terminal-once and post-lock lease expiry.
- Contract suites: 12/12 PASS (question identities, payment history projection, existing
  source/lifetime checks and current-input provider protocol). Typecheck and lint PASS.
- NativeKnowledgeTests: 12/12 PASS on owned iOS26.5 Simulator. Includes exact payment relation
  binding and rejection when a payment answer is presented to an explicit rail question.
  This is model validation, not rendered native payment acceptance.
- Web production build and final native Simulator build PASS. Rendered payment acceptance remains pending.
- Independent contract review: initially 0 critical / 2 important. Fixed railway-specific
  payment notices and unrequested card obligations on mobile+cash. Re-review: 0 critical /
  0 important. Source review only, separate from runtime evidence.
- Actual read-only Staging inventory at 2026-09-13T03:07:14.666651Z: migration42, reader off;
  mobile/ATM/exchange published, reviewed and unexpired; card acceptance still revoked.
  No migration or model call performed in this window. The research batch is not runtime input.

Logs and xcresult are retained at
`/Users/jtcao/Library/Caches/visepanda/payment-ask-20260913/`.
Owned Simulator FD335619-A706-4614-A8C7-6931E5D8D0A1 is already Shutdown after testing;
an explicit shutdown returned state405 and made no change. Original user checkout is untouched.

## Remaining acceptance and rollback

Before enabling the candidate: finish builds, freeze semantic cases, apply the reviewed append-only
migration only to the authorized Staging object, then use the matching API/worker/Web/native code.
Older clients reject unknown intents; do not expose payment histories to an old client and claim
compatibility. Real zh/en mobile, cash, combinations, revoked-card gaps, out-of-scope and injection
cases plus rail regression and rendered native/Web readback are not yet run. Full #195/#206/S2
remain open; no production release or user acceptance is claimed.

Rollback disables the existing scoped reader/worker integration before reverting consumers.
Keep publications, revoked state and saved answer/budget records. Do not rewrite migration42 or
silently convert payment histories to rail. Any applied database rollback requires a new reviewed
forward migration; ordinary old rail history remains readable by the new candidate.

Pre-deployment preflight caught an ordering error: the first candidate filename sorted before
already-applied grounded-events migration42. No Staging migration was attempted. Renamed the
unapplied payment migration to `20260913090000_vpj_16_payment_questions.sql`, after migration42;
rerun both actual PostgreSQL suites in that order before deployment. Original evidence is retained.
