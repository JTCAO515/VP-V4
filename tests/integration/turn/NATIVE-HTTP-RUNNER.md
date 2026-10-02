# Disposable native HTTP runner ports

`run-native-http.mjs` creates a fresh random `vp-native-ask-*` Supabase project and workdir.
The default port base remains **59620** (Supabase API 59641, PostgreSQL 59642,
Next.js native API 59651). Existing no-option and mode-only commands remain compatible.

When another session owns that range, explicitly choose a free base in your isolated worktree:

```sh
node --experimental-strip-types tests/integration/turn/run-native-http.mjs --grounded --port-base 62620
```

Or select it for a caller that invokes the runner without custom arguments:

```sh
VP_NATIVE_HTTP_PORT_BASE=62620 node --experimental-strip-types tests/integration/turn/run-native-http.mjs --planning
```

The single existing mode can appear before or after `--port-base`. Supported modes remain
`--service`, `--grounded`, `--grounded-native`, `--assistant-native`, `--assistant-rollback`,
`--planning` and `--translation-history`; absent mode selects native text HTTP.
If both CLI and environment specify a base they must agree. Bases must be decimal integers
from 1024 through 65000; URLs/DSNs, malformed values, duplicate options and out-of-range bases
are rejected. There is no automatic fallback to another range, test skip or global port service.

The selected base drives the existing offsets 20, 21, 22, 23, 24, 27, 29 and 31. The runner
checks every corresponding loopback port before creating resources. Supabase port replacement
uses one pass, so overlapping the original 543xx range cannot cascade into incorrect values.
Disabled excluded services retain the existing configuration; no new service is activated.
The random project ID remains the resource namespace; an existing/shared project ID cannot
be selected. The [Supabase CLI configuration](https://supabase.com/docs/guides/local-development/cli/config)
uses `project_id` to distinguish local projects.

The child receives matching `VP_NATIVE_HTTP_PORT_BASE`, `VP_NATIVE_API_PORT`, explicit absolute
`VP_IDENTITY_SUPABASE_WORKDIR`, and `VP_IDENTITY_SUPABASE_API_URL`. `createNativeTextEnvironment`
validates this tuple before status discovery or fixture mutations, requires the existing owned
project-name pattern, and starts Next/readiness probes on the selected API port. Existing
`identityLocalEnv` loopback/workdir/status-origin checks are preserved; local port selection
never permits a remote target. Local Docker context checks remain unchanged.

Next logs now use a unique private `native-text-api-*.log` within the disposable workdir.
Successful stack cleanup removes that directory. The runner reports only safe project/port
metadata in `VP_NATIVE_HTTP_TARGET` and reports successful owned cleanup in
`VP_NATIVE_HTTP_CLEANUP`. CLI credentials/status bodies remain suppressed.

Different sessions should use **both separate worktrees and disjoint port ranges**. Two bases
that share any derived port still collide. Next's `.next/dev` lock remains local to a checkout;
choosing another port does not make two Next dev instances safe in the same checkout. A
preflight is an availability check, not a reservation against later competing binds. A later
start conflict remains a failure and cleanup targets only this runner's new project/workdir.
Never stop another session's container/process to make a range free. No machine config,
existing database, product HTTP/SQL or native behavior is changed by this setting.

## Targeted checks

```sh
node --test tests/unit/governance/native-http-ports.test.mjs
node --check tests/integration/turn/run-native-http.mjs
node --check tests/integration/turn/native-text-environment.mjs
```

The governance tests exercise default/custom/environment selection, malformed/remote/conflicting
values, exact derived URL/port agreement, overlapping-source replacements and namespace guards.
Two lightweight owned TCP ranges demonstrate that a runner collision exits before Docker,
leaves both ranges intact, and releasing A does not release B. These do not claim two full
Auth/Next stacks were simultaneously validated. Run one affected real disposable mode locally;
existing DB Integration CI also exercises the unchanged default.

Observed locally on 2026-10-02 at base commit `3f97270071ea631ccde02038cb4cfb74a3d70901`:
port/ownership governance **5/5 PASS**; the existing DB runner governance **5/5 PASS**;
`--grounded --port-base 62620` **1/1 PASS**, no skips, with real disposable Auth/Next/SQL
and synthetic provider only. Run metadata reported `vp-native-ask-8257a9d9`, Supabase API
`http://127.0.0.1:62641`, native API `http://127.0.0.1:62651` and successful cleanup.
A subsequent exact-project container listing was empty and all selected derived ports were
available. Syntax, integration classification, docs and diff checks passed. This is harness
validation; real Staging/provider, physical-device/UI and concurrent full stacks are **UNRUN**.
Required current-head CI results are recorded on the PR; no repeated full local suite was run.
