# VPJ-03 #190 closure evidence — 2026-09-17

Scope: policy/notice completeness and fail-closed correction only. Base `origin/main@ffcd194`.

## Live observations

| Check | Result |
| --- | --- |
| Supabase project | `VP - V4`, `dzqdzetcctkhbrhlxxgn`, `ACTIVE_HEALTHY`, `ap-southeast-1` (Singapore) |
| Vercel project | `vp-v4`; default functions `iad1` (US); production has Testing Chat configuration names |
| Main source | no Testing Chat route; route exists only in unmerged `testing-chat-vpv4` history |
| Active policy before repair | one GLM `internal-testing-v1`, registry ID `84b7b1ee-e6ef-407e-b660-d27d9f7ef3fd` |
| Defect | registry recipient/regions conflicted with its bilingual notice and observed path |
| Repair | exact guarded terminal `revoked_at` update returned one row at `2026-09-17T05:33:11.776661Z` |
| Active verified C2 policies after repair | zero |
| Runtime gate after repair | `turn_private.text_policy_current(revoked-policy-id)` returned `false` inside a transaction that rolled back |

The repair did not read secrets, policy-consented input/output, or user identity. It did not delete
content or consents. It leaves the protected Testing Chat key names in Vercel untouched; policy
checks deny a call with the revoked policy before provider dispatch.

## Commands

1. `supabase projects list --output json` — PASS, target selected by exact name/region/status.
2. `supabase db query --linked --project-ref dzqdzetcctkhbrhlxxgn --file /tmp/vpj03-policy-schema.sql --output-format json` — PASS.
3. Read-only policy inventory inside `BEGIN TRANSACTION READ ONLY … ROLLBACK` — PASS.
4. Guarded `UPDATE … WHERE id = exact-policy-id AND revoked_at IS NULL AND current` — PASS; one row only.
5. Repeat read-only active-policy inventory — PASS; zero valid entries.
6. Initial `READ ONLY` call to `text_policy_current` — expected PostgreSQL rejection because its implementation takes `FOR SHARE`; no result was misreported.
7. Short `BEGIN; text_policy_current(...); ROLLBACK` — PASS; returned `false`, no mutation.
8. Vercel project/environment-name metadata and Git route/branch trace — PASS.
9. `pnpm docs:check` and `git diff --check` — recorded after this documentation update.
10. `node scripts/vpj-program.mjs verify-remote` — FAIL outside #190: remote dependency edges for
    #188/#191/#193 drifted from the manifest. No related file or tracker mutation was made here.

These observations do not prove customer-facing release, provider-side deletion, billing, full
data lifecycle, or that a historic Qwen call is occurring today. Those limits remain in
`../unrun.md`.
