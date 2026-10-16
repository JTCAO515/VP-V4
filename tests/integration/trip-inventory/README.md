# Inventory / ordinary-role PG17 verification

Run only on a disposable, owned PostgreSQL 17 cluster:

```sh
TRIP_INVENTORY_NATIVE_PG=1 VP_WIKI_PG_BIN=/path/to/pg17/bin VP_WIKI_PG_MODULE=/absolute/path/to/pg/lib/index.js node --experimental-strip-types --test tests/integration/trip-inventory/postgres.test.mjs
```

The default discovery path skips unless explicitly activated. CI must set the flag and require zero skips. Reuses the fixed-source manifest, migration verification, disposable no-TCP 0700 socket helper and production HTTP listener from `canonical-place-ask-http`, read-only. The complete 161 accepted migrations run, with no new SQL source, grant, security-definer helper or private-source privilege. Before/after table/function ACL fingerprints are identical.

`wire.mjs` is an explicit synthetic registered-token Auth/REST adapter, not managed Auth, JWT signature verification or PostgREST. SDK HTTP queries execute actual transactions with ordinary `authenticated` role and real RLS; no table rows are mocked. The only supported RPC is the existing `native_session_v2` read. No login, token refresh, consent, Ask admission or provider call exists in the wire adapter.

Tests cover two owners and foreign canonical denial, exact zero and three-trip reads, null/missing counts and missing rows, set race/session revocation, Cookie/Origin/query/method/role/modified JWT rejection, and unchanged original three-draft capacity. The cap-eight and malformed canonical/size/deadline cases are covered in contract/security tests; the PG fixture does not bypass three-draft capacity to synthesize nine current drafts.

The consumer composition case uses actual inventory/session HTTP endpoints and original SDK/SQL/RLS before and after a controlled Ask driver. Its explicit HTTPS-name→loopback bridge reconstructs a synthetic Response with no source URL. It proves composition only, and the task table count stays unchanged. No runtime/staging attestation or H1–H5 acceptance follows.
