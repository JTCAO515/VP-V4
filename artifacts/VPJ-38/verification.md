# VPJ-38 K1 synthetic rehearsal — 2026-09-27 (Asia/Shanghai)

Scope: #230 K1, isolated synthetic recovery only. Base `0fff80e8b1b0fd0fb1ccffffd5c71fd92f06e1c9` matched remote main at start. #189 is CLOSED for its Staging identity/migration scope; that does not provide a recovery backup. #504 remains OPEN. PR #551 is merged and supplies the Trip deletion receipt/worker; StoreKit migration `20260926113804_vpj34_storekit_grants.sql` supplies revoked/erased transaction states.

Implemented: an operator runbook and a standalone synthetic rehearsal script. The script creates two fresh network-isolated PostgreSQL containers, backs up synthetic DB rows and object files, separately retains post-backup deletion/revocation events, restores them, checks SQL and files, then opens only its isolated test read gate for owner/other/anon probes. Revert these files to roll back preparation; no shared runtime data was modified.

Verification:

- **PASS** `node --check scripts/db/restore/synthetic-recovery.mjs` — script syntax only.
- **PASS** `node --test tests/integration/restore/rehearsal-plan.test.mjs` — existing plan boundary tests 7/7.
- **PASS** `pnpm docs:check` — VPJ documentation baseline passed.
- **PASS** `git diff --check` — no whitespace error.
- **PASS, SYNTHETIC ONLY** Main executed `node scripts/db/restore/synthetic-recovery.mjs --execute` against script SHA-256 `5e38fa2ff8d9bf4eed2d6f300e5b952bc2aae2b6ccbb08adb519bc30c611d592` in the authorized outer environment; exit 0. Output: `PASS_SYNTHETIC_RESTORE_ONLY`, two fresh `--network none` PostgreSQL containers, logical DB dump plus two object files, separately stored and integrity-checked journal, and owner/other/anon probes passed. Measured synthetic restore-and-probe time: **1195 ms**; full synthetic run: **3711 ms**. Main checked `docker ps -a --filter name=vpj38-k1-` and `/tmp/vpj38-k1-synthetic-*` after the run; neither had residue. These are command-level synthetic timings, not service RPO/RTO.
- **UNRUN** actual service backup/restore, RPO/RTO, real Storage policy and cross-module reconciliation; details in [unrun.md](unrun.md).

The executable synthetic rehearsal reads actual SQL and object state before opening its local test gate. It does not use the full application schema, a real Supabase backup, actual user data, shared Staging or Production. #230 remains OPEN.
