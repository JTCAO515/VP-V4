# VPJ-02 frozen26→33 preparation verification

Base `cd2201194402b87e6322f4b703dd780707fcae2e`; dedicated worktree. Related to #189, not closing.

## Fresh Staging metadata

Official CLI uniquely matched `VP - V4 / ap-southeast-1 / ACTIVE_HEALTHY`, then executed the
committed `BEGIN READ ONLY / ROLLBACK` query by explicit project reference. No link/config overwrite.
Current26 migration versions/names match;3 Auth/2 Trip observed as counts only. The15 expected
migration27 definer body MD5 values match, but effective execute privileges expose3 additional
public definers to authenticated. Metadata preflight correctly returns **BLOCKED / exit2**.
See `staging-metadata.json` for exact signatures/hashes/types/ACLs. No user rows/credentials read.
The separately bounded platform function definition read contained only public-table RLS DDL;
its MD5 matches the retained local simulation fixture. No remote write was executed.

The first CLI metadata query lacked `--linked` and failed before an accepted result; its raw
output was suppressed. Subsequent explicit target Management API query succeeded. A first
comparison stopped on the unexpected18-function inventory; the retained report records that
real mismatch rather than treating expected15 as actual. This is not a direct-host/pooler test.

## Local upgrade and recovery

`local-rehearsal.json` records the final runner hash, frozen manifest hash, existing image ID,
41 passed checks and exact start/end/cleanup status. The runner creates two unique owned
PostgreSQL17 containers with `--network none`, no published ports and `--pull=never`.
The Docker context is checked for a local Unix socket and pinned for every command; explicit
Docker endpoint/context overrides are refused. Row digest snapshots use one SQL statement.
**Auth tables/claims are SQL fixtures, not GoTrue sessions or JWT verification.**

- Baseline26 holds synthetic existing Auth/session/Profile/Trip/history/legacy receipt and
  pending/reserved budget records. All33 baseline table projections are checked for byte-equivalent
  ordered row digests after each migration; only the new nullable `trip_idempotency.proposal_id`
  column is excluded from its old projection, then explicitly checked null for the old receipt.
- A logical dump stays in process memory and restores into the second fresh container with
  all baseline table digests equal. It is not a real Staging encrypted backup, PITR or Storage proof.
- The observed extra3 effective grants and exact platform source are simulated. Unmodified27
  rejects the inventory; its entire transaction rolls back, no identity schema appears, history
  remains26 and old rows remain unchanged.
- Guarded normalization rejects additional function, changed source and changed ACL. Exact
  normalization and explicit pre27 ACL restoration roundtrip preserve all old data. Trip initial
  snapshot trigger and platform RLS event trigger still function without ordinary direct EXECUTE.
- Both source and restored instances then apply the frozen27–33 with matching version records.
  New mobile epoch/proof/tombstone records established at27 survive through33; existing Web
  sessions remain readable. These are SQL-role observations only.
- Old digest, direct reject and receipt-write paths fail closed. The retained unbound legacy
  receipt cannot masquerade as a v2 replay. Fetching the v2 digest confirms the old pending
  proposal, replay is idempotent, and version history appends instead of being overwritten.
- Policy/consent/content/work stay empty; unknown policy acceptance is blocked. Owner/other/anon
  isolation and revoked direct Trip update are observed. Budget stop preserves pending700 micros,
  releases only the undispatched reservation, disables new admission, and leaves identity/Trip
  digests intact. Ops metadata reports the retained hold, not an invoice.
- Original ACL restore refuses after27. Both owned containers are removed. No existing local
  service, remote DB, provider, device or user data is used.

Five early harness-development failures are retained in `development-attempts.json`: identifier
validation rejected numeric table names, then the minimal Auth fixture lacked schema USAGE for
an invoker RPC. The fixture was corrected; no application SQL was weakened. Subsequent successful
runs are separate evidence. The real Staging18-versus15 blocker is not one of those harness errors.

## Frozen package and checks

The package receipt identifies a new unlinked local directory containing exactly33 migration files
plus separately placed administrative SQL. No roles/seed/.env/link cache or future34+ file is copied.
Three offline package tests pass: exact hashes and future-migration exclusion; refusal to overwrite
an existing directory; hash/earlier-migration drift rejected before output creation.

`--verify`, JavaScript syntax, package tests, docs:check and diff checks pass; exact commands are
in `commands.jsonl`. Existing required PR CI and independent exact-HEAD review remain merge gates.
Only scripts/docs/artifacts changed; Web/native runtime was not rebuilt or reverified locally.

## Remaining limits

Remote normalization and27–33 application remain unrun and need explicit scope authorization,
a fresh encrypted backup/restore and caller maintenance plan. Direct-host path previously failed;
existing Session pooler evidence is historical, worker identity/deployment remains separate.
Native service/client still enforce loopback and need independently reviewed remote configuration.
No actual C2 recipient, policy, team role, provider call or production release is activated.
