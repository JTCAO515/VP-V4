# VPJ-21 first SIM document readiness slice — 2026-09-22

Related to #211; parent remains OPEN. Stage S3. Start basis: main
`a3a69189f349a9e9547157c3cf4ad13232ebd68c`, isolated branch `codex/s3-vpj21-readiness`.

Implemented: shared read-only readiness API; independent native/Web Ready consumers; explicit
request-local declarations; five outcomes against the existing SIM document relation; task/Trip,
date-basis, rule/ontology/publication/source bindings; existing actor/RLS/knowledge eligibility
reads; expiry and stale Trip rejection. No persistent declaration, Trip writer, migration, provider
call, reminder or production change.

## Local evidence

- PASS: `node --experimental-strip-types --test --test-concurrency=1 tests/contract/readiness/readiness.test.ts`, 9 tests. Synthetic RPC responses using existing editorial SIM-01 content, never live publication proof.
- PASS: `node node_modules/typescript/bin/tsc --noEmit --incremental --tsBuildInfoFile /tmp/vpj21-e948.tsbuildinfo` after correcting two adapter-union errors.
- PASS: `node scripts/lint.mjs`, source-policy lint.
- PASS: `node scripts/docs-check.mjs` before adding this final evidence document; final docs check is recorded in commands.jsonl.
- PASS: `plutil -lint ios/VisePanda/VisePanda.xcodeproj/project.pbxproj`; four additive, unique registrations only.
- PASS: `git diff --check`; no shared global handoff/issue-plan/lockfile change.
- Diff reviewed by implementing agent: only one Web entry link, three Native entry lines and four pbx registrations touch shared consumers; J/Overall coordinated these increments.

Initial failures retained: test fixture first selected `sourceMetadata` instead of `records`
(setup TypeError, corrected); tsc found access to union-only `environment` and `applyCookies`
(corrected by native config and Web-cookie adapter branches). Initial pbx insertion script's
expected layout assertion failed twice before writing the project; actual format then used and
plutil passed. No gate was narrowed.

## Boundaries

Knowledge eligibility is authoritative at the existing `knowledge_answer_v1` read. Two Trip reads
only detect a changed Trip basis, not atomic knowledge/Trip publication consistency. Client display
uses the existing bounded projection model: maximum 30 seconds from evidence evaluation and never
beyond evidence expiry, minus full request latency. Instant revocation during the lease is not
claimed. Displayed declarations are explicitly user reports, not verified credentials or SIM activation.

No target-environment behavior or user acceptance is established by the local checks. See
[unrun](unrun.md). CI and actual acceptance results will be reported by exact PR/head separately.

Timing/rework: exact start-to-acceptance duration was not instrumented; acceptance time remains
UNRUN. Rework is the fixture/type/layout corrections above. External waiting: shared host was
reported overloaded before assignment and measured load 594.13/511.38/387.52 at 10:42 CST;
no build, database stack, simulator or browser was started locally. Native CI must remain serialized.

Post-check integration: rebased onto main `b15635ad` after #498 merged. Two pbx append-location conflicts were resolved by retaining all Hotel entries and the Ready entries; the diff to main still adds only four registrations. Native status labels now explicitly name the three dimensions. Local checks were not restarted after Overall tightened the host restriction; final-head build/runtime checks await CI.
