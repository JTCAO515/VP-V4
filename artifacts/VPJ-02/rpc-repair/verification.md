# VPJ-02: verified upgrade prerequisites and RPC repair

Related to #189. Class B repository preparation. User authorized necessary backup,
original13 Staging migrations and two temporary ordinary identities; that authorization
remains valid. The new appended repair migration is separately identified, not silently
included in the original13-file grant. No remote migration or Auth creation occurred.

## Actual verification

A dedicated local Supabase stack (Postgres17.6.1.159/Auth/PostgREST/Kong) replayed the
original11, then13 pending files, then the final appended repair: counts11 ->24 ->25.
Original24 file hashes stayed identical. A synthetic pre-upgrade Trip kept its title/version.
After the independent rollback-parent finding was fixed, frozen-v2 was rebuilt cleanly
from11 and the final files; no incremental function patching was used for final evidence.

Integration29/29 and security82/82 PASS, zero skips, actual exit0. DB lint at error level,
docs and diff checks PASS. A temporary environment adaptation changed only the two hardcoded
local Docker container names; database assertions matched final repo tests. The earlier
failures and the stronger final checks are retained in local evidence, not hidden.

Real database tests exposed nonexistent jsonb_object_length, UUID/text comparisons,
ambiguous PL/pgSQL output names, and legacy revision locking after direct UPDATE revocation.
The appended migration fixes existing interfaces. The restricted revision definer is an
explicit privilege-model exception with auth/owner/rollback/expiry/version checks;
see docs/contracts/vpj-02-rpc-repair.md. No direct UPDATE or wider caller grants were added.

Tests now correctly expect403 for ordinary table UPDATE and trusted-writer calls, exercise
a permitted local service actor separately, and use matching JSON keys in bulk fixtures.
New profile/privacy RPC tests exercise previously untested callable paths without performing
real export/deletion. Rollback-parent revisions are denied before any status/child/Trip write.

## Backup and transport

The selected SG Staging has a completed managed physical backup at2026-09-08T19:43:45.659Z;
its existing Auth/Trip update times are earlier. A fresh affected-schema logical archive
(public/private/auth/supabase_migrations) was independently created through a verified
Session pooler, encrypted directly with AES-256-GCM, and stored outside the repository/cloud
Documents folder with0700/0600 permissions. Its key is in a dedicated macOS Keychain item.
No plaintext archive, identities, credentials, backup keys or project ref are committed.

A new no-network/no-published-port PostgreSQL container decrypted and fully restored the
archive. Auth3/Trip2/history11 and complete Auth/Trip row digests matched. That restored
actual-data copy also accepted the original13 plus final repair SQL while preserving Auth
and original Trip fields. That additional SQL-only rehearsal did not manually advance
history; the separate frozen Supabase replay above verifies actual history progression.
All restore containers created for this check were removed. Their failed bootstrap attempts
were local initialization issues, resolved before accepted restore; they did not affect Staging.

This is affected-schema data/schema restore evidence, not full physical-project, role-password,
Storage-object or cross-machine recovery acceptance. Recovery of the local encrypted copy
requires the owner's Keychain; the managed backup remains separate. Local private manifest
contains its exact location and restore metadata. Only sanitized summary/hash is in this PR.

The public CA source is Supabase's official Studio custom-content.json and hosted production
certificate URL. Standard libpq and native CLI verify-full succeeded using that CA; no global
SSL enforcement, certificate verification, ban, routing or network settings were changed.
Explicit Session pooler avoided a direct-host TCP/SSL failure in automatic selection.
The native CLI observed maintenance rolepostgres and a dry-run listing exactly original13,
no seeds or custom roles. This is maintenance connection evidence, not a user JWT matrix.

## Remaining gate and rollback

Remote still has11 migrations and existing3Auth/2Trip. Two test identities and real Staging
JWT isolation are not claimed complete. The appended repair adds one file beyond the
previously authorized13; record additional authorization before remote application.
Do not apply the known-failing original13 alone and call it validated.

After permission, recheck source hashes/target/baseline, use ordinary CLI append-only
migration handling, and execute the bounded two-identity probe. Preserve existing records;
clean only the newly recorded fixture IDs, never by prefix. No Production DB operations.
Revert this repo PR for code preparation rollback; applied DB changes need reviewed forward
recovery, not rewritten history or regranting direct UPDATE. #189 remains open.
