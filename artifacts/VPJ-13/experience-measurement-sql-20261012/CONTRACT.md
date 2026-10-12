# #203 experience measurement SQL private candidate

Base: daa7bae44a660381fb3295d0d2afc327ea98d3ba. Sole owner:
01a12e77-c953-7313-923e-164c863a37c0. Product append/shared write: NOT_GRANTED.
Purpose `journey_experience_measurement`; wire `journey-experience-measurement/1`;
notice `journey-experience-measurement/2026-10-12`. Existing users have no consent.

This directory alone is owned. Candidate SQL is not a product migration. Fixed
154 migrations are SHA256-pinned in source-preflight.json. No old writer is
changed, invoked to manufacture observations, or used as an analytics ledger.

## Source qualification and remaining genuine gaps

E1: existing service_tasks.id/created_at and owned directions intake/text/work,
including accepted tasks with failed or incomplete work. Completion/result
presence is not an admission predicate. Existing current source qualification
checks owner, policies, original consent, linked goal/input/task, current source
session and memory authority. Result presentation additionally requires the
exact current result revision and nonempty useful validated content.

Directions selected/save use directions_operations_v1, not client receipt
claims: owner, operationId, action, original source, expected+1 result revision,
immutable matching content and exact-read currentness. Selected and saved union
counts distinct admitted logical tasks once. Decision selection uses immutable
chosen decision revision/idempotency key + previous revision and common source
qualification. Trip confirmation uses proposal/event/idempotency/current
snapshot, preserving the original explicit confirmation writer.

E2 initial source finding: pdf_intake operations exist only after parsing; they cannot supply the
denominator of local parsing failures. E3: a goal/read revision does not prove
original read-request acceptance. Main later accepted pre-result Trip-anchored E2 and full Goal/input E3 Native
acceptance-report tickets. Current exact union is in WIRE.md; result association
is still an independent original-source dependency. These
entries must not silently substitute success-only admission or a fabricated
business Task. Missing admission authority is UNRUN/unsupported, not zero.

## Lifecycle

All retained measurement rows are bounded by owner count and bytes and expire
within 30 days from authority receipt. A duplicate never renews that receipt or
its expiry. Aggregation is computed over retained qualified rows; it has no
permanent aggregate table. First-ever status after lost retention is unknown;
renewing consent cannot re-admit earlier source acceptance. Local clock reports
are claims, never SQL authority timestamps. Different/missing process endpoints
produce unknown latency.

Withdraw/deletion erase this explicit new domain, invalidate consent and all
observations, and preserve only a bounded, content-free CAS receipt. Neither
old Profile erasure nor old D2 completion covers this domain implicitly.
Missing independent restore journal/latest floors must deny collection/restore;
an old backup is never its own authority. Source expiry/retirement denies reads
and triggers bounded physical purge via a controlled maintenance consumer.

Profile export currently has a closed single snapshot with ownerId/profile/
watermark/operations/sourceRows. Reusing it requires one explicit typed
measurement suffix, exact counts/order/caps/decoder/digest/source-current and
export-artifact invalidation candidate. Adding a tenth D2 engine is not chosen.
Coverage requires an explicit new owner handler/domain, not old Profile erase.
Server supplies controlled purge consumer; no existing observation purger or
scheduled target is claimed. Cleanup freshness and all lifecycle integrations
are default-denied config gates until exact shared candidates are reviewed.

## Validation scope

Own PG17.6 SQL fixture only; JWT claims are synthetic SQL role inputs, not
GoTrue/authenticated HTTP evidence. Target deployment, real consent, Native UI,
user understanding and final CI/review: UNRUN. Parent #203 remains OPEN.
