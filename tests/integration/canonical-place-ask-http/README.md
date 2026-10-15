# Canonical Place Ask: real HTTP / SDK / native PostgreSQL

Own scope: only this test directory. The actual production v7 handler and original Supabase SDK run behind real loopback HTTP listeners. Auth/REST is a strict **C0 synthetic identity adapter**, not GoTrue or PostgREST: complete pre-registered tokens select fixed actor/session pairs, arbitrary decoded claims cannot select actors, and only the existing session and selected-submit/read RPC routes are exposed. Each RPC executes the real SQL body with `SET LOCAL ROLE authenticated` in a real transaction. No production wrapper, grants, provider, target environment or real user credentials are added.

The PostgreSQL cluster is independently initialized with explicit PG17.11 and pg-client paths, a unique 0700 Unix socket, and no TCP listener. It never reads another owner's cluster resource. Source migration and fixture bytes come only from an explicit reviewed Git checkpoint descended from accepted707; every loaded source SHA256 is emitted. There is no working-tree SQL or latest-head fallback. The SQL owner's portable fixture factory receives only this test's own connection function.

Run after the final SQL checkpoint is fixed and reviewed:

```sh
VP_WIKI_PG_BIN=/path/to/pg17.11/bin \
VP_WIKI_PG_MODULE=/path/to/pg/lib/index.js \
CANONICAL_SQL_CHECKPOINT=<reviewed-40-character-commit-sha> \
node --experimental-strip-types --test tests/integration/canonical-place-ask-http/postgres.test.mjs
```

CI must have that exact checkpoint's Git objects available. Main owns registration in the existing native17 step. Invocation without required fixed inputs fails; it does not silently skip or use a mutable seed.

Coverage: real ordinary admission, one original Task/Turn/link/capacity reservation, unchanged question and full raw UTF8 digest, lost ACK and unknown SDK result recovered only with the original five-key GET, source/consent withdrawal, mobile actor replacement, and rejection of an unregistered token with forged claims. The same operation's actual recovered DTO is compared to a direct ordinary-role SQL read. No second submit, replacement Task or original Trip/content/reference mutation is allowed.

Current validation: syntax checks only while awaiting the SQL owner's final reviewed checkpoint. This is not yet a joint runtime PASS and does not assert complete settlement/lifecycle, live Auth, actual PostgREST, Native UI, delivery or provider acceptance.
