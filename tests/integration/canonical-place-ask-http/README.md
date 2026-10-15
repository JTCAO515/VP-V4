# Canonical Place Ask: real HTTP / SDK / native PostgreSQL

Own scope: only this test directory. The actual production v7 handler and original Supabase SDK run behind real loopback HTTP listeners. Auth/REST is a strict **C0 synthetic identity adapter**, not GoTrue or PostgREST: complete pre-registered tokens select fixed actor/session pairs, arbitrary decoded claims cannot select actors, and only the existing session and selected-submit/read RPC routes are exposed. Each RPC executes the real SQL body with `SET LOCAL ROLE authenticated` in a real transaction. No production wrapper, grants, provider, target environment or real user credentials are added.

The PostgreSQL cluster is independently initialized with explicit PG17.11 and pg-client paths, a unique 0700 Unix socket, and no TCP listener. It never reads another owner's cluster resource. Runtime consumes only migration/helper files in the coherent integrated checkout after every byte is verified against versioned `source-manifest.json`; every loaded SHA256 is emitted. It accepts no source-commit environment override and needs no private Git objects or draft fetch. Main freezes the manifest only after integrating/reviewing the SQL checkpoint; arbitrary working files are never executed. The SQL owner's portable fixture factory receives only this test's own connection function.

After Main integrates and reviews the final SQL checkpoint, freeze the exact source bytes with `node tests/integration/canonical-place-ask-http/freeze.mjs REVIEWED_SQL_SHA INTEGRATED_HEAD_SHA`, then commit the generated manifest. The freeze requires unchanged HEAD and clean, tracked SQL/helper inputs. Run the required native17 entry:

```sh
VP_WIKI_PG_BIN=/path/to/pg17.11/bin \
VP_WIKI_PG_MODULE=/path/to/pg/lib/index.js \
CANONICAL_PLACE_HTTP_NATIVE_PG=1 \
node --experimental-strip-types --test tests/integration/canonical-place-ask-http/postgres.test.mjs
```

Main owns registration in the existing native17 step. The default integration discovery is gated; that explicit step must set the flag and require zero skips. When activated, missing or changed manifest inputs fail. Runtime requires only the coherent checkout, without historical checkpoint objects.

Coverage: real ordinary admission, one original Task/Turn/link/capacity reservation, unchanged question and full raw UTF8 digest, lost ACK and unknown SDK result recovered only with the original five-key GET, source/consent withdrawal, mobile actor replacement, and rejection of an unregistered token with forged claims. The same operation's actual recovered DTO is compared to a direct ordinary-role SQL read. No second submit, replacement Task or original Trip/content/reference mutation is allowed.

Current validation: syntax checks only while awaiting the SQL owner's final reviewed checkpoint. This is not yet a joint runtime PASS and does not assert complete settlement/lifecycle, live Auth, actual PostgREST, Native UI, delivery or provider acceptance.
