# Canonical Place Ask: real HTTP / SDK / native PostgreSQL

Own scope: only this test directory. The actual production v7 handler and original Supabase SDK run behind real loopback HTTP listeners. Auth/REST is a strict **C0 synthetic identity adapter**, not GoTrue or PostgREST: complete pre-registered tokens select fixed actor/session pairs, arbitrary decoded claims cannot select actors, and only the existing session and selected-submit/read RPC routes are exposed. Each RPC executes the real SQL body with `SET LOCAL ROLE authenticated` in a real transaction. No production wrapper, grants, provider, target environment or real user credentials are added.

The PostgreSQL cluster is independently initialized with explicit PostgreSQL major-17 and pg-client paths, a unique 0700 Unix socket, and no TCP listener. It never reads another owner's cluster resource. Runtime consumes only migration/helper files in the coherent integrated checkout after every byte is verified against versioned `source-manifest.json`; every loaded SHA256 is emitted. It accepts no source-commit environment override and needs no private Git objects or draft fetch. Main freezes the manifest only after integrating/reviewing the SQL checkpoint; arbitrary working files are never executed. The SQL owner's portable fixture factory receives only this test's own connection function.

After Main integrates and reviews the final SQL checkpoint, freeze the exact source bytes with `node tests/integration/canonical-place-ask-http/freeze.mjs REVIEWED_SQL_SHA INTEGRATED_HEAD_SHA`, then commit the generated manifest. The freeze requires unchanged HEAD and clean, tracked SQL/helper inputs. Run the required native17 entry:

```sh
VP_WIKI_PG_BIN=/path/to/pg17/bin \
VP_WIKI_PG_MODULE=/path/to/pg/lib/index.js \
CANONICAL_PLACE_HTTP_NATIVE_PG=1 \
node --experimental-strip-types --test tests/integration/canonical-place-ask-http/postgres.test.mjs
```

Main owns registration in the existing native17 step. The default integration discovery is gated; that explicit step must set the flag and require zero skips. When activated, missing or changed manifest inputs fail. Runtime requires only the coherent checkout, without historical checkpoint objects.

Coverage: real ordinary admission, one original Task/Turn/link/capacity reservation, unchanged question and full raw UTF8 digest, lost ACK and unknown SDK result recovered only with the original five-key GET, source/consent withdrawal, mobile actor replacement, and rejection of an unregistered token with forged claims. The same operation's actual recovered DTO is compared to a direct ordinary-role SQL read. No second submit, replacement Task or original Trip/content/reference mutation is allowed.

Actual joint HTTP validation: 7/7 tests PASS, 0 skipped (one suite plus six scenarios), using the frozen coherent source integrated from SQL db26. Seed SHA256 `f7a230acc07ebfa63ce6b8639495d27c28fe298fad1d322264f436bf764da3f3`; portable factory SHA256 `6cab76147e5fc271c6271384804de4a67b3f0e687ab241fafbba4f21bd6936ca`. The manifest pins 163 SQL/helper sources. The initial run failed the unregistered-token status check because this synthetic Auth adapter omitted the SDK API-version response header; adding the standard header preserved strict token registration and made the check pass. No production identity fallback was introduced. This controlled joint PASS does not assert full SQL formal review, complete settlement/lifecycle, hosted resident routing, live Auth/PostgREST, Native UI, delivery or a real provider.

## Actual resident discovery validation

The integrated fixed SQL increment `198c66bf644483da97b7663cc06e321d4747f1fb` was consumed byte-for-byte and the 163-source manifest refrozen. Current seed SHA256: `208472a066b9d8aa4ae1b06953448ed6eed362f85449dd71dadd9b78c1bb1ac7`; portable factory: `dd78e9a2d952b6597a7e3cede8fe496bda496662f6321a39889267aaa6d08283`. Runtime has no private Git-object or mutable peer-worktree dependency.

The same isolated PG17.11 entry now runs the original six HTTP scenarios and five resident scenarios, **12/12 tests PASS, 0 skipped** including the parent test. The production `createHostedTextWorker` reads actual SQL heartbeat/discovery, preserves the original current-input policy, and runs the existing ordinary job1 or selected job4 through actual service-role claim/authorization/budget/completion. A closed fetch seam returns only synthetic model responses; no external recipient is contacted. Selected completion retains the same ordinary Task/Turn, resolves its server-qualified subject, settles its original capacity reservation once, and does not add facts, Trip data or provider IDs to the classifier question. A profile without knowledge execution does not claim grounded work. Withdrawal after actual discovery causes no provider invocation. An unknown budget dispatch ACK retains the actual dispatched attempt and causes no provider send or subsequent claimer in that poll.

The first resident run exposed an incomplete synthetic model envelope (missing required choice index). The second run reached both successful positive assertions but its cleanup incorrectly called Cancel on terminal Turns. Those original failures are preserved as compressed raw logs alongside the final pass. Only test helpers were corrected; the production protocol and permissions were not relaxed. Cleanup now cancels queued/leased work and stops only this test's resources.

This is C0 synthetic Auth/REST identity plus real ordinary/service-role PostgreSQL and production consumer code. It is not GoTrue/PostgREST, a real provider, full SQL formal review, a target release, Native UI or user acceptance. Main owns the final native17 required/zero-skip CI registration. Shared hosted-file future write ownership has returned to Main.

## PostgreSQL version contract

The helper accepts PostgreSQL major 17, matching the existing native17 CI provision and SQL integration inspector; it does not pin an unprovisioned patch release. The actual server version remains in the emitted database evidence. The local runtime evidence above was executed on 17.11 only; acceptance by the major-version check does not claim full runtime verification on another patch. All catalog/ACL checks, fixed-source SHA validation, required zero-skip entry, no-TCP socket and 0700 assertions remain unchanged.
