# Staging 26 → 33 execution — 2026-09-11

JT explicitly authorized Staging maintenance, migrations and the direct-write pause. Scope stayed on the existing VP - V4 / ap-southeast-1 database and its vp-v4 Vercel project.

- The approved three-function ACL normalization completed: authenticated public SECURITY DEFINER inventory18→15, preserving owner/service permissions.
- Native Supabase CLI applied exactly migrations27–33 from the hash-frozen33-file package. `--skip-vault` was used; no seed, role push, include-all, migration-history repair, or migration34/35. The process exited0 and actual history33 matched the manifest.
- A fresh AES-256-GCM backup was restored in an isolated UTF-8 PostgreSQL instance with no network or published ports. All55 old-table original-column summaries matched; the restore container was removed. After migration the same55 original table records, including old migration rows, were preserved. Auth/Trip counts remain3/2. No original data or secrets are stored here.
- Whole-project maintenance was activated before DB changes. Existing/current deployment and alias probes64/64 returned403; the existing automation-bypass channel42/42 also returned403. These checks preceded the user's later instruction to stop verification.
- Vercel's full configuration objects were deeply equal but arrived with different object-key order. An exact prior raw-fingerprint match anchored the canonical JSON fingerprint; all content and array comparisons stayed intact. No configuration-drift gate was waived.
- Production/Preview now have `VISEPANDA_TRIP_PROTOCOL_V2=true`; the other environment records were unchanged. New deployment/host routing is recorded in `web-cutover.json` and the final #189 operating comment. Older deployment hosts remain denied by the scoped allowlist.

## User-directed closeout

JT subsequently instructed: no further review or verification, finish, push directly to GitHub main, then pause development. Therefore the planned new two-account Web/API/browser acceptance was **NOT_RUN_USER_WAIVED**; zero temporary accounts or Trips were created. No new independent review or test run is claimed after that instruction. Deployment status reads and publishing the owned maintenance draft were operational closeout, not business acceptance.

#189/#191/#195 and the Harness parents are not closed by this execution. Native remote consumers, worker activation, eligible knowledge, current direct-host connectivity and full business/network acceptance are separate unfinished items. Migrations34/35, real provider traffic, production database creation and new team memberships were not activated.
