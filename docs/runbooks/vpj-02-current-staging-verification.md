# VPJ-02 current Staging verification

Related to [#189](https://github.com/JTCAO515/VP-V4/issues/189), S1. This tool delivers a repeatable
migration inventory and real two-user owner isolation matrix on the previously designated
**VP - V4 / Singapore** Staging. It never applies migrations or changes grants, roles, configuration,
provider work, Production or the TripProposal confirmation contract.

## Prerequisites and commands

Run from the repository root with Node 22+ and an authenticated Supabase CLI (observed 2.117.0).
`VPJ02_SUPABASE_BIN` optionally names the locally verified CLI executable. No credential is supplied
on the command line. Verify the current account with `supabase projects list`; a browser or another
connector's login does not establish CLI access. The hardcoded target is intentional: a different
project needs a reviewed scope change, not a new flag value.

Read-only inventory (does not request API keys):

```sh
node scripts/db/vpj-02-staging-verify.mjs inventory dzqdzetcctkhbrhlxxgn
```

The matrix uses the existing same-target authorization for exactly two ordinary synthetic Auth users
and their empty Trips. Use a **new**, absolute private directory outside every checkout for each run:

```sh
node scripts/db/vpj-02-staging-verify.mjs matrix dzqdzetcctkhbrhlxxgn /private/tmp/vpj02-unique-run
```

A private recovery journal is created before mutations; never commit it. It contains only reserved
IDs, synthetic emails, run markers and aggregate row digests, not passwords or tokens. Existing API
keys are captured from the CLI in memory. Passwords are randomly generated in memory; Admin create
with `email_confirm` sends no invitation. Each account authenticates through the real password token
endpoint and verifies its identity through `/auth/v1/user`. No fabricated JWT or `SET ROLE` is used.

The matrix checks both owners' create/read, reciprocal hidden reads, anon denied reads, forged-owner
inserts and owner/other/anon direct PATCH rejection. Direct PATCH is expected to fail for the owner too;
Trip changes still require the accepted confirmation flow. Empty Trip creation does not create a
proposal or exercise confirmation. All writes use reserved fixture IDs; original users are never used
as test actors. HTTP failures and unknown schema responses cannot satisfy denial checks.

## Cleanup and interruption

Normal completion or caught failure runs cleanup in `finally`: sign out the two sessions, verify the
exact user ID/email/run marker, verify each reserved Trip's owner/title/version, delete those exact
empty Trips and then the exact synthetic Auth users. Unexpected owned Trips block Auth cascade.
Independent cleanup attempts continue for the second identity after a first-identity failure.
A final read-only query verifies fixture users/Trips/sessions are absent and compares complete original
Auth/Trip row digests. Changes by another session cause a preservation FAIL; never restore old rows
or remove someone else's records to make the comparison pass.

After process/host interruption, retain the journal and run:

```sh
node scripts/db/vpj-02-staging-verify.mjs cleanup dzqdzetcctkhbrhlxxgn /private/tmp/vpj02-unique-run/journal.json
```

Recovery reads only recorded identities and never searches for deletion candidates by email prefix.
A create request is journaled before sending, so an unknown acknowledgement still has a reserved ID.
If the service returns an unexpected identity or ownership has changed, stop destructive cleanup and
investigate the private receipt. Do not widen filters. Recovery skips unrelated migration/UPDATE
acceptance gates. Without the in-memory token, recovery cannot claim an observed logout; exact Auth
deletion and the final zero-session check establish refresh-session removal, **not immediate expiry of
previously issued access JWTs**. No access token is persisted; fixture ownership disappears on cleanup.
Keep a failed journal until residual objects and original-data preservation are reconciled.

## Evidence and limits

Only sanitized JSON is printed. CLI/HTTP errors and response bodies never go to logs. Exit 1 means a
failed check or incomplete run; inspect the named checks and cleanup result, then diagnose without
printing credentials. `PASS_FOR_RECORDED_SCOPE` is not full Issue acceptance.

Migration evidence compares version/name, including the historical first24, with all current files.
It separately lists unapplied files, remote-only versions and name drift. It does not compare deployed
DDL/function source hashes. Public/private ordinary-table RLS inventory excludes other schemas/views.

The CLI linked query is a **Management API path**. Direct PostgreSQL, Session pooler and worker
connection identity each retain their own UNRUN status unless separately observed with the actual
connection. Do not present management SQL, role simulation or PostgREST JWT success as worker proof.
The tool does not discover/reset SQL passwords, disable TLS, apply pending migrations or enable a
worker. Historical successful pooler and failed direct-host evidence retain their dates.

Behavioral tests:

```sh
node --test tests/integration/db/vpj-02-verification.test.mjs
node scripts/docs-check.mjs
git diff --check
```

The adjacent `tests/integration/db` path is necessary for executable cleanup/security regression
coverage and is automatically collected by the existing integration suite. Mock transport tests
prove tool behavior only; real Staging matrix output is recorded separately under `artifacts/VPJ-02`.
