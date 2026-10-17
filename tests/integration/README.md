# Integration suite

`pnpm test:integration` runs every file here. Files that need a real database, Auth or HTTP stack
skip themselves unless their explicit switch or disposable target is set, so that suite reports
`incomplete` locally and in Quality PR.

## Database integration (one convention)

`scripts/ci-suites/db-integration.mjs` is the single owner of those switches. It classifies every
file here as `test:integration` (always runs), a DB lane, or the short `EXCLUDED` allowlist with a
written reason; an unclassified gated file fails `pnpm test:unit` (governance) and the CI job.

| Lane | Needs | What it proves |
| --- | --- | --- |
| `postgres` | Docker + pinned images (`--images`) | isolated, network-disabled PostgreSQL SQL/RLS suites |
| `postgres-native` | `VP_WIKI_PG_BIN`, `VP_WIKI_PG_MODULE` | Wiki migrations/ACLs on native PostgreSQL |
| `postgres-native-17` | caller-supplied PostgreSQL 17 binaries + `pg@8.13.1` via the same Wiki variables | resolved-subject/QA cancellation, complete Trip suite with real nine-minute expiry, then canonical Place SQL and HTTP/SDK/PG suites |
| `supabase-rls` | Docker + Supabase CLI | one disposable stack with all migrations: function EXECUTE allowlist, identity, profile/privacy RPC, RLS, Trip confirm/revise/reject/rollback (v2 protocol) |
| `supabase-http-native` | Docker + Supabase CLI | real Auth → Next.js native routes → PostgreSQL |
| `supabase-http-ops` | Docker + Supabase CLI | Ops review, knowledge publication/private source (34→35), service cases |

```sh
node scripts/ci-suites/db-integration.mjs --list            # classification
node scripts/ci-suites/db-integration.mjs --lane postgres    # or supabase-rls, ..., all
```

A lane passes only with a node:test summary, zero failures and zero skipped/todo/cancelled tests.
Supabase lanes start uniquely named stacks on their own ports and stop them afterwards; they never
use an existing local project. `VP_OPS_BROWSER_EXECUTABLE` (a Chromium path) adds the Ops browser
subtests. The `DB Integration` workflow selects affected lanes for each PR and retains the full
set for unknown scope or explicit full runs; its required aggregate check is `db-integration`.

The native17 lane sets `AGENT005_NATIVE_PG=1` and `QA_CANCEL_NATIVE_PG=1`; it requires zero
skipped tests. The default integration suite retains the incomplete behavior above. Cancellation
uses a private Unix-socket PostgreSQL fixture and synthetic Auth claims, not a real GoTrue or
provider acceptance claim; its HTTP fixture runs independently without a database switch.

The canonical step requires `CANONICAL_PLACE_NATIVE_PG=1` and `CANONICAL_PLACE_HTTP_NATIVE_PG=1`,
with concurrency one and zero skipped tests. Both fixtures own private PG17 Unix sockets without
TCP. The HTTP entry uses production handlers/SDK and actual ordinary-role SQL, with a closed
synthetic Auth/REST adapter; this is C0 evidence, not signed GoTrue, real PostgREST or provider
acceptance. Missing default activation remains INCOMPLETE and starts no database. Unknown helper
dependencies retain full-lane fallback; no new excluded or default-runner filters are added.

To add a gated test: put its switch in a lane (or add a reasoned `EXCLUDED` entry) in the same PR.

The native-17 Trip step invokes `service-task-trip/run-integration.mjs`. Its registry lists every
Trip test explicitly; the runner maps the Wiki variables to `VP_TRIP_PG_BIN` / `VP_TRIP_PG_MODULE`
and enables `VP_TRIP_EXPIRY_TEST=1`. Missing dependencies, unknown classification, failures and skips
fail the lane. The existing Wiki lane and subject-binding step remain separate and unchanged.
Native fixtures use private Unix sockets and synthetic SQL claims; these checks do not prove
GoTrue, provider, deployment or user acceptance. The default integration suite remains incomplete.
