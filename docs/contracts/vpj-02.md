# VPJ-02 current Staging identity and isolation verification

Related to [#189](https://github.com/JTCAO515/VP-V4/issues/189); all three defined acceptance criteria are satisfied.
See the [final acceptance mapping](../../artifacts/VPJ-02/staging-verification-20260917/acceptance.md). GitHub records merge/closure state. The current
[runbook](../runbooks/vpj-02-current-staging-verification.md) defines the explicit-target inventory,
real GoTrue/PostgREST matrix, bounded cleanup and recovery commands.

Observed 2026-09-17 on the designated VP - V4 Singapore Staging:50 version/name-matched migrations
against62 local files,12 pending, no remote-only version or name drift. The historical24 match; this
is not a deployed-DDL/source-hash comparison. Existing7 Auth/3 Trip records were preserved byte-for-byte
as measured by complete row digests. All31 listed public/private ordinary tables have RLS enabled;
this inventory does not cover every private schema or view.

The two ordinary password-login accounts passed server identity verification and reciprocal owner,
other-user and anon read/write checks. Direct Trip PATCH remained denied, including to the owner.
Exact fixture IDs were cleaned and final Auth/Trip/session absence and original-data preservation
passed. See [dated evidence](../../artifacts/VPJ-02/staging-verification-20260917/verification.md).

Management API, ordinary HTTP JWT, Session5432 and Transaction6543 read-only SQL are now
separately observed. The two pooler paths return the expected database/session identity and
50 migrations/7 Auth/3 Trips. Two failed password attempts are retained alongside two successful
operator runs. No password reset was needed. Direct5432's normal path still closes before TLS;
a temporary relay through the existing local proxy and public IPv6 target passes official-CA/
hostname TLS verification and authenticated direct-port SQL now PASS through that route.
This does not establish an unproxied IPv6 route; the original path failure remains recorded.

The actual existing HTTP scoped worker passes11 empty-poll checks, including server identity
access, anon rejection, exact claim source/grants and unchanged queue/policy/budget/original data.
This is empty-poll connection evidence only. Full task execution/provider behavior and the legacy
SQL SystemDataAdapter runtime are not established by this connection check. Full task processing
belongs to VPJ-07#195; ADR-0016 applies when a concrete SQL adapter is introduced. These do not
add requirements to the unchanged VPJ-02 criteria. Historical
[2026-09-10 evidence](../../artifacts/VPJ-02/staging-apply-20260910.md) keeps its original scope.

No migrations, ACL/roles, provider work, Production configuration or release state were changed in
this round. Cleanup never restores original data or broadens permissions. Complete TripProposal,
native, customer and release acceptance are outside this bounded matrix and remain separate.

Historical26→33 preparation and execution remain available in the
[upgrade runbook](../runbooks/staging-26-to-33.md),
[local rehearsal](../../artifacts/VPJ-02/staging-33-preparation/verification.md) and
[actual33 execution](../../artifacts/VPJ-02/staging33-execution/verification.md).
The prior26-state prerequisite is historical, not a current blocker or an instruction to reapply it.
