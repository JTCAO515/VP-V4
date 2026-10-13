# Main review proposal — not approval and not an executable authorization record

Recommended scope: fixed Staging `dzqdzetcctkhbrhlxxgn`, Go2China organization `ppfsagymaozpbkbarhes`. Main prepares the exact source hashes, fresh official metadata, approval JSON and human-readable action list. JT approves the concrete actions; JT is not asked to write JSON. A proposal file never authorizes itself, and the operator TTY gate never replaces JT's approval.

## Recommended values

- Isolated recovery destination: one freshly owned local Docker PostgreSQL17.6.1.155 container, cached image ID `sha256:3866d94d8426927e8db3f1c5d790752292bfbe27b5f1f46e199ae1b7d3c1710b`, network none, no ports or mounts, unique owner label; destroy recovered copy after verification. No paid project or shared container.
- Encrypted archives: `/Users/jtsm5p/.codex/secure-backups/qaw005-fixed-staging/archives`.
- Separate recovery identities: `/Users/jtsm5p/.codex/secure-backups/qaw005-fixed-staging/identities`.
- Keep FileVault On, private0700 directories,0600 files. Recommended retention for ciphertext + recovery identity: **2026-10-20 23:59:59+08:00**. No retention/deletion automation was created; Main records the approved retention/disposition owner.
- Maintenance window: **60 minutes**, starting only after approval, local preparation and the verified safe writer boundary. Main fills actual ISO timestamps at that point; no invented current window.
- Scope of service impact: fixed-Staging writes pause; original workers stay stopped and QA feature stays disabled. No Production configuration/deployment/domain is changed. Main must verify no Production writer shares this project before claiming Production is unaffected.

## Timing and stop budgets

Measured `managed-restore-proof-03.json`: three synthetic ciphertext captures0.222s; positive isolated restore1.835s; full managed-profile positive/negative proof plus source/cleanup5.777s. This fixture has14 fake rows, not the actual119-relation target dataset; these are plumbing timings, not a real-data ETA. Prior own synthetic75→155 proof took9.535s; exact-target-hook .155 proof7.999s, including bootstrap/cleanup, at reviewed migration835cb185... (not a measurement of newly supplied df5565ae...). Main's latest full155 PASS has no measured duration here.

Conservative60-minute allocation: capture/integrity up to10min; independent restore and schema/role/ACL/count checks up to15min; reviewed80-version action budget15min; final verification10min; failure/exit reserve10min. If approval covers backup/restore only, the80-version slot remains reserve and **no target migration occurs**. Any80 migration on a real restored copy or target must use Main's exact final reviewed package and matching authorization; the historical synthetic replay is not real-data evidence. At a phase overrun do not borrow the final10min reserve to start a new phase. Preserve protected failure artifacts, keep QA disabled and exit at the maintenance boundary. Actual long-duration remote transport/capture remains UNRUN.

## Writer quietness — required evidence, currently UNRUN

`writersAndMigratorsQuiesced` must remain **unset/false** until Main resolves every source below. Feature disablement alone is insufficient.

| Writer class | Existing control/evidence | Owner action before window |
| --- | --- | --- |
| QA Web/API admission | `VISEPANDA_QA_AGENT` must not equal `true`; real gate is `lib/server/qa-agent/config.ts` | Main/deployment owner records exact deployment/project/env readback, verifies disabled API behavior and no alternative deployment points at this DB. No secret values logged. |
| Original hosted worker | `turn_private.hosted_worker_control.enabled=false`; heartbeats0 was prior observed metadata, not a fresh guarantee | Worker/runtime owner confirms process/service/job/scheduler stopped, records fresh control/heartbeat metadata and absence of leased/in-flight writes. Turning off discovery alone does not stop an already running worker. |
| Dedicated QA worker / local worker runs | Process/service stop under original owner | Main/runtime owner confirms every instance and restart/scheduler disabled for the window; no worker is started by this proposal. |
| Native apps, older Web previews, local dev/test clients | Client/test suspension; existing session/connection inventory by owner | Main collects explicit confirmation from active client/test owners; disconnect active Staging clients, including Auth refresh/sign-in writers, for the window. RLS is not a maintenance lock. |
| Migrations, CI/acceptance scripts, manual SQL, ops/research writers | Existing owner leases and scheduler/run inventory | Main blocks dispatch of writers against this exact ref, confirms no active applied migration or operator write, and preserves ownership. No new writer/thread is created here. |
| Managed Auth/Storage/Realtime and other unlisted writers | Fresh connection/transaction and write-counter metadata only; never SQL text or user rows | Main records a bounded observation plus responsible-owner confirmation. Quiet counters prove only the observation period. Unknown writers or managed activity that cannot be bounded remain a blocker; do not silently set the boolean true. |

Use only content-free backend/session state, migration history, counts and counter deltas in readiness evidence. Every read refers to this exact ref. The future capture rechecks exact75/catalog and before/after metadata/counts, and now requires platform base-table counts outside the14 captured schemas to be zero. This catches some concurrent or uncovered state; it does not replace the writer inventory or prove all future writers are stopped. Any nonempty/unreadable out-of-scope platform table, changed migration/extension/role, or unexplained activity stops before a successful recovery-point claim.

## Concrete future commands, after Main approval preparation

Preview source readiness now with `python3 scripts/qa-agent-staging-replay/controlled-backup.py --dry-run` and `python3 scripts/qa-agent-staging-replay/controlled-restore.py --dry-run`. Both are offline defaults.

Future controlled capture is `controlled-backup.py --execute <Main-prepared-approval.json> <fresh-official-metadata.json>`; it still requires human TTY confirmation after checking the exact code hash/scopes/window. Future local restore is `controlled-restore.py --restore-approved <Main-prepared-restore-approval.json> <CAPTURED_RESTORE_UNRUN.json> <recovery.agekey>` with exact paths/hashes and renewed post-prompt checks. Do not run these now. Neither command grants target migration authority.

The exact five-extension local bootstrap has now passed synthetic owner/role/ACL/count verification. Real source locale/bootstrap identity, effective postgres permissions on all required metadata, zero out-of14 platform data, real archive/restore, managed services and80-version actual-data behavior remain UNRUN until authorized and observed. Source scripts fail closed for unknown profiles. This package avoids silently substituting a pure-schema or synthetic PASS for a real recovery point.

## Platform-count correction and explicit incremental scope

This supersedes the earlier assumption that all outside14 tables might be empty. Fresh authorized official COUNT found **realtime.schema_migrations=89**, with realtime.messages/subscription/vault.secrets=0. The original all-zero gate correctly blocks this target. See `platform-coverage-assessment.md` for exact query/evidence and classification; no actual row values were read.

The minimal revised proposal has **four** ciphertext archives: the existing14-schema data, full schema, no-password globals, plus one data-only Realtime migration-ledger supplement. It requires explicit additional capture and local-restore action approval for that ledger, the updated code hashes and verification contract2. Main prepares those approval records for review; the proposal does not self-authorize. No whole-Realtime or Vault data permission is inferred. Every other outside14 data table must still be empty; new rows/tables/partitions or changed ledger count/structure stop for review.

Source ledger records will be copied exactly under that future increment, with restored count and logical digest checked; no fabricated seed values. The89 fake local fixture rows are solely a test. Existing destination/directories, recommended2026-10-20 23:59:59+08 retention and60-minute allocation remain recommendations; no maintenance window or writer attestation is currently true. This scoped fix makes the observed ledger state representable by the candidate, not a claim that real execution/permissions/quietness are verified.
