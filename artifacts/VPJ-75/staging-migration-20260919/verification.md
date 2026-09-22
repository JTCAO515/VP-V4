# #359 Staging migration verification — 2026-09-19

Target: the repository-pinned `VP - V4` Supabase project
`dzqdzetcctkhbrhlxxgn`, with main code at `2370391`.

## Recovery and preflight

- The operator's direct proxy path passed original-hostname TLS and read-only
  SQL on this target. The saved, redacted result is
  `artifacts/VPJ-02/staging-verification-20260917/connections-youteyud.json`.
- A new encrypted logical archive was created at
  `/Users/jtsm5p/.codex/secure-backups/vpj-75-76-staging/20260919T073953Z-87d3a1dc.dump.age`.
  SHA-256: `b820c34016455b309d7ead9b40824aafc7e12d22cc614b970b4c5761f6cf975b`.
  It covers `public`, `auth`, `storage`, `private`, `identity_private`,
  `knowledge_review_private`, `turn_private`, and `supabase_migrations`.
  The key is a separate mode-0600 file in the same FileVault-protected backup
  directory. Full decrypt and archive listing passed: 906 objects.
- The archive was restored in a fresh local PostgreSQL 17 cluster with no TCP
  listener and a private Unix socket. The isolated database read back 50
  migration rows, 3 Trip rows, and 7 Auth users; the cluster was then stopped
  and removed. This is a logical recovery rehearsal, not a Supabase platform
  physical restore.
- The exact 11 migrations below were run against the real Staging DB inside
  a transaction followed by `ROLLBACK`; the next read still showed 50
  migrations, no Wiki table/RPC, and 3 Trip rows.

## Applied migration package

`scripts/acceptance/vpj-75-76-staging-migrations.mjs --apply` applied only:

`20260914110000`, `20260914120000`, `20260914130000`,
`20260914140000`, `20260914150000`, `20260915180000`,
`20260915190000`, `20260915200000`, `20260916120000`,
`20260917100000`, `20260917110000`.

The tool used the authenticated Supabase CLI Management API because the CLI's
direct TCP migration path terminates before comparison on this host. It ran
the unchanged, merged SQL files and inserted each matching version/name into
`supabase_migrations.schema_migrations` in the **same transaction**. Explicit
preconditions required the exact 50-row baseline, absent Wiki objects, disabled
Ops/publication and zero active members. In-transaction postconditions required
all 11 versions, all required RPCs, and unchanged original data digests.

An independent, read-only query after commit observed migration count **61**
and all 11 version IDs. Existing data were unchanged:

| Data | Before | After |
| --- | ---: | ---: |
| Auth users | 7 | 7 |
| Trips | 3 | 3 |
| Source revisions | 24 | 24 |
| Publications | 27 | 27 |

The full-row Auth, Trip and publication digests matched. The source-revision
digest over its original columns matched after excluding the new nullable
withdrawal fields. Ops and publication remained disabled; active Ops members
remained zero. The new private Wiki and Ask job tables have RLS enabled with
no direct `SELECT` grant to `anon` or `authenticated`. The new public RPCs
deny `anon` execution; their authenticated execution is guarded in the RPC
body. Supabase security advisors reported existing warnings, including the
intended authenticated `SECURITY DEFINER` RPC pattern; no new anon Wiki/Ask
execute grant was observed.

## Acceptance boundary

Schema and migration-history acceptance on this Staging target is **DONE**.
No real Wiki generation, Ops review, statement publication, withdrawn-source
dispatch exercise, provider billing reconciliation, or iOS/Web Ask readback
has been performed yet. #359 remains open.
