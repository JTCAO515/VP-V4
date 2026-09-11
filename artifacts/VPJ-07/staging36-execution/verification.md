# Staging 33 → 36 execution — 2026-09-11

Related to #189/#195, PR325. **Executed and restored**, with no Production deployment.
[Metadata](metadata.json), [HTTP probes](restored-http.json), [operator source hashes](operator-source-hashes.json).
Runtime source is `3bf26fc`; migration bytes match the [frozen36 manifest](../staging-36-preparation/migrations.json).

JT confirmed the prepared new maintenance window and stopped other direct writers. The existing
owned WAF rule moved from8-host allowlist/version3 to all-path deny/version4.80 anonymous and56
existing automatic-protection-bypass requests returned403. No active client transaction, prepared
transaction, live work, enabled budget scope or text policy was observed before the upgrade.

A fresh AES-256-GCM backup covers public/private/Auth/migration/identity_private/turn_private.
Keychain readback and an isolated UTF-8 PostgreSQL17.6 restore with no network or published ports
passed:63 original tables/columns and211 function, owner, effective grant and RLS/policy entries
match. The owned temporary container was removed and a successful container listing confirmed absence.
Backup ciphertext, keys, table values, sessions and row digests are not published.

Recovery checking caught ACL representation and public-schema baseline differences before any
migration. ACL arrays are compared in canonical order and NULL uses PostgreSQL object defaults.
The archive explicitly recreates public but exports ACL changes relative to its initial PUBLIC USAGE.
The final rehearsal preserves the verified initdb public schema (pg_database_owner; PUBLIC USAGE,
no PUBLIC CREATE), omits exactly its single SCHEMA-definition TOC entry, and retains all ACL/comment
and other entries. The encrypted archive is unchanged; full effective grants still must match.
No grant was patched after restoration to hide a mismatch. Earlier failed rehearsals do not count as PASS.

Verified TLS and fresh official CLI credentials were used. Dry-run listed exactly34,35,36; native
`db push --skip-vault` exited0. No normalization, repair, seed, role import or extra migration ran.
Remote history36 matches the manifest. Before Auth smoke tests, all63 original-column summaries and
211 existing function/grant entries remained identical;3 accounts and2 Trips remained.

New claim EXECUTE is service-only. All7 new private review/source tables have RLS and deny ordinary
access; settings=false, members=0, sources=0. Actual SQL-role checks deny10 unauthorized operations,
return OPS_DISABLED to a synthetic authenticated claim, and return empty to service scoped claiming.
Separately,2 real ordinary Supabase Auth sessions verify claim denial, disabled Ops and foreign Trip
invisibility; both newly created synthetic accounts were ownership-checked and removed, without
sending email. Normal Auth audit history is retained. Final counts are3 accounts/2 Trips/36 migrations.
These checks send no text to any model and enable no policy, budget, worker or knowledge membership.

Security advisors report39 WARN, up from38. The only new warning is the authenticated definer
`ops_review_workspace`; both paths revalidate actor/session/membership before access and currently
reject at the disabled gate. The intended entry was independently reviewed; warnings were not
silenced by weakening the capability contract. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

WAF version5 restores exactly the prior8-host rule. All8 public entries return200 after permitted
redirects,3 anonymous API checks return401, and2 old deployment hosts remain403. Existing environment
metadata and Production deployment target are unchanged. This completes the bounded database
maintenance, not full S1/S2, a qualified Qwen recipient, remote Ask/provider execution or release acceptance.
