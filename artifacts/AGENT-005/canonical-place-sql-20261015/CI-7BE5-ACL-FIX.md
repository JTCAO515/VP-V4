# Exact authenticated-only ACL restoration

The real PG17.6 CI16991e… expected scalar corresponds to `{postgres=X/postgres,authenticated=X/postgres}`. The observed a57aba… is exactly `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`. Reversing two entries produces cd475b…, not the observed hash. This is an extra permission, not ordering.

The frozen296-function contract declares13 authenticated-only interfaces. Five legacy public functions omit explicit service_role revocation in their original migrations: confirm_and_apply_trip_proposal, create_trip_proposal_patch, native_session_v2, read_trip_proposal_v2 and reject_trip_proposal_v2. The other eight already explicitly revoke service_role. Source anchors are20260830100000/20260830210000,20260909223841,20260910002858 and the later anon-only20260923120000 correction. No applied migration is changed.

[Supabase official API security documentation](https://supabase.com/docs/guides/api/securing-your-api#default-privileges-for-new-tables-and-functions) explains existing public-schema function defaults can grant EXECUTE to anon,authenticated and service_role. It also distinguishes function EXECUTE from table RLS. This was read through the official Supabase documentation search only; no connected project or database was queried. Platform defaults are changing, so the fix supports both the already-correct and the legacy-default environment; it does not change global defaults.

The unique un-applied seed adds one bounded preflight/restoration block:

- It checks the five frozen source/definition/owner/config/security/language contracts before any permission change.
- aclexplode verifies every grantor,grantee,privilege and grantability tuple, with duplicates retained. Only the exact existing contract or that contract plus one postgres→service_role nongrantable EXECUTE is eligible. Other grants, grantors/delegation, grantability or code fail closed.
- After every preflight passes, only that explicit service_role EXECUTE is revoked. Authenticated keeps EXECUTE; anon and service_role remain denied. The original raw296-metadata guard and all other pins remain unchanged; no observed hash becomes allowed and no sorting tolerance is added to the guard.

A fresh private0700/noTCP nativePG17.11 with the official-style public function default grants replays the complete accepted historical migrations. Removing only the restoration block reproduces the same real-CI ACL hash and Trip failure. Applying the fix restores all five exact frozen ACLs, leaves global defaults unchanged, passes Trip runtime, and supports rollback to the original before state. PUBLIC/anon grants, grant option, unexpected grantor delegation and source drift all reject. Real SQL service/anon calls to the restored Native RPC fail at permission checking. Legitimate worker service-role contracts are untouched.

Native portable21/21 PASS,0 skip after the functional change; catalog/rollback/role/schema tests remain. Unchanged raw output fixtures are retained rather than regenerated into peer-facing fixture churn. Managed GoTrue/PG17.6 official CI is still required; this is not a claim of that run succeeding. Main owns manifest refresh and official CI validation.
