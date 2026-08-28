# Frontend cutover runbook

Status: operator-only. This runbook does not authorize a deployment, store submission, map change,
or publication.

## Preconditions

1. Verify the WEB-11 acceptance audit is `accepted`, not `blocked`.
2. Confirm #116 and #43 are closed with their required runtime and observation evidence.
3. Obtain the operator rights attestation and store claim/screenshot matrix.
4. Remove every `blocked-release` public asset under an accepted, reviewed asset change.
5. Name the Preview target, Production target, cutover owner, last compliant rollback alias, and
   bounded observation window.

## Rehearsal commands

Run in the immutable release candidate checkout:

```text
pnpm check
pnpm test:e2e
pnpm docs:check
pnpm check:assets:release
git diff --check
```

The release asset command must pass. A failure for quarantined media is a release stop, not a
warning to waive. Capture only the actual candidate route, viewport, locale, maturity and current
asset tree; do not use Concept/Demo screenshots as production evidence.

## Stop and rollback

Stop before cutover if any command fails, an asset/claim/right/maturity record is missing, a map is
enabled without separate approval, a required route remains stop-ship, or the rollback alias cannot
be reached. Restore the last compliant alias, retain map-off, mark the observation as failed, and
do not change durable product data.
