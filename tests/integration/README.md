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
| `supabase-rls` | Docker + Supabase CLI | one disposable stack with all migrations: identity, RLS, Trip confirm/revise/reject/rollback (v2 protocol) |
| `supabase-http-native` | Docker + Supabase CLI | real Auth → Next.js native routes → PostgreSQL |
| `supabase-http-ops` | Docker + Supabase CLI | Ops review, knowledge publication/private source (34→35), service cases |

```sh
node scripts/ci-suites/db-integration.mjs --list            # classification
node scripts/ci-suites/db-integration.mjs --lane postgres    # or supabase-rls, ..., all
```

A lane passes only with a node:test summary, zero failures and zero skipped/todo/cancelled tests.
Supabase lanes start uniquely named stacks on their own ports and stop them afterwards; they never
use an existing local project. `VP_OPS_BROWSER_EXECUTABLE` (a Chromium path) adds the Ops browser
subtests. The `DB Integration` workflow runs every lane on each PR; its aggregate check is
`db-integration`.

To add a gated test: put its switch in a lane (or add a reasoned `EXCLUDED` entry) in the same PR.
