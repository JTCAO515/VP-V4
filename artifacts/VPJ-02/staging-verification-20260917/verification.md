# VPJ-02 real Staging verification — 2026-09-17

Related to #189, S1. Outcome: a repeatable explicit-target migration inventory and real ordinary
owner/other-user/anon isolation matrix, with exact fixture cleanup and a resumable private receipt.
Parent acceptance remains incomplete; no release or migration application is claimed.

## Baseline and machine

- Repository base: origin/main `7758d01`; dedicated `codex/vpj-02-staging-verification-20260917` worktree.
  Original checkout/Xcode changes preserved. Open PRs417/433/438/439 are separate work.
- New-device checks: Node26.8.2, pnpm9.15.9, GitHub CLI access, Supabase CLI2.117.0. Docker29.8.0 is
  available after starting the installed app; no local synthetic database was needed for this run.
- The user completed official CLI login. Live CLI lists the correct VP - V4 Singapore Staging as
  ACTIVE_HEALTHY. Another connector's different project was not used. Credentials were never printed.
- Original designated test-environment and exactly two ordinary synthetic account/owned-empty-Trip
  authorization are recorded in #189; current explicit VPJ-02 request resumes that bounded scope.
  No new production, migration, role or provider authority is inferred from login.

## Actual observations

[matrix-run1.json](matrix-run1.json) records the run starting2026-09-17T04:27:34Z (12:27 Shanghai), exit0:

- **29/29 PASS**: four target/history/permission/reserved-ID prechecks, six Auth create/password-login/
  server-identity checks, nineteen reciprocal owner/other/anon empty-Trip read/write checks.
- Both owners created and read their own empty Trip; reciprocal other-user reads returned zero rows;
  anon reads, forged-owner inserts, all three actors' direct PATCH and anon insertion were denied.
  Trip title/version remained unchanged after the rejected writes. No proposal confirmation was exercised.
- Cleanup operations PASS; exact test Auth/Trip/session absence PASS; original full Auth/Trip row digest
  comparison PASS. Before and after: **7 Auth,3 Trips**. Raw identities/content/digests were not published.
- History: **50/61**, all50 version/name matches,11 unapplied files, zero name drift/remote-only. All
  historical24 match. Pending versions/names are enumerated in the JSON; no file was applied or repaired.
-31 public/private ordinary tables listed, all RLS enabled; authenticated direct Trip UPDATE remains
  revoked. This is a limited metadata inventory, not an all-schema security audit or source-hash proof.

The final follow-up adds directory fsync for durable journal replacement and records completion time.
[cleanup-repeat.json](cleanup-repeat.json) exercises the final recovery command against the already
cleaned receipt: idempotent absence and unchanged originals are rechecked without recreating fixtures.
The HTTP matrix was not rerun for that journal-only follow-up.

## Checks and review

- `node --test tests/integration/db/vpj-02-verification.test.mjs`:13/13 PASS. Mock transport/cleanup tests
  cover wrong targets, unsafe IDs, unknown create acknowledgements, identity drift, unexpected Trips,
  leftover sessions, changed originals, redirect policy, bounded responses and secret error suppression.
  These tests are tool regression evidence, distinct from the real Staging matrix above.
- Independent review required by the repository for auth/data integrity found two recovery defects:
  unrelated migration gates blocked cleanup and a fixed pending-file name blocked crash recovery.
  Both fixed; follow-up review found no remaining P1/P2 blocking the scoped run.
- Node syntax checks, docs check and diff check are required for this tooling/docs change.
  No app/iOS/schema code changed; local Web build/browser/native acceptance is not applicable to this PR.
  Existing CI still runs and its actual result is recorded in the PR.

## Remaining acceptance

| Path | Current result | Next executable action |
| --- | --- | --- |
| Management API metadata | PASS | Re-run inventory when the source or target changes |
| Real password-login / PostgREST JWT | PASS | Re-run matrix for relevant auth/RLS changes |
| Direct PostgreSQL | UNRUN on this device | Configure the designated host's existing credential through a secure local mechanism; run a TLS verify-full read-only query |
| Session pooler | UNRUN on this device | Verify exact target host/database/user and run the same read-only query through the real pooler |
| Worker identity/connection | UNRUN | Use the existing intended worker credential/path, verify current/session user and bounded probe visibility; do not substitute SET ROLE |

No relevant SQL connection variables or project env files were found; no password reset, secret search
outside the scoped locations, TLS downgrade or worker enablement was attempted. CLI login grants the
observed management/API path, not proof of the other connections. Historical2026-09-10 direct-host
FAIL (`psql` exit2, connection closed with verify-full) and Session pooler PASS remain in the earlier
record. This round does not waive or overwrite them. No real customer data, native full acceptance,
production deployment, pending migration acceptance or complete #189 acceptance is claimed.

## Work record and rollback

Implementation/review/runtime/evidence are one bounded PR. Setup waited for the user's official CLI
login; two code-review corrections were completed before remote mutation. No measured user acceptance
time or productivity gain is inferred. Remove the new tool to revert implementation; retain evidence.
For interrupted fixtures use the runbook's exact journal cleanup, never wildcard-delete or reset rows.

## Connection follow-up — 2026-09-17, user resumed

The user requested continuation with step-by-step instructions for any manual action. Added
`vpj-02-connection-check.py` and a Chinese terminal tutorial to the existing runbook. Six Python
security/result tests and their integration-suite wrapper PASS; independent review found no P1/P2.
The script prompts only in a real terminal, never persists the password, sends read-only SQL to fixed
hosts through `psql -X -w`, pins the official CA and forces verify-full. Output is allowlisted aggregates.

[Connection preflight](connections-preflight.json),2026-09-17T04:48:45Z: Session5432 and shared
Transaction6543 both pass official-CA/hostname-verified TLS1.2. Direct5432 closes before accepting
PostgreSQL TLS; SQL remainsUNRUN. Local DNS returns proxy benchmark198.18/15 addresses; no default
IPv6 route was observed. No proxy/DNS/SSL/network restriction or paid IPv4 change was made.

The browser Connect dialog confirmed the exact shared pooler host and tenant-qualified username;
Database Settings supplied the official CA download link. These are connection metadata, not password
access. The user has been given the one-command hidden-input tutorial; authenticated SQL results
remain pending until that operator step completes. The legacy worker SQL profile's transaction
connection check is explicitly distinct from a running SystemDataAdapter or a provider worker task.
