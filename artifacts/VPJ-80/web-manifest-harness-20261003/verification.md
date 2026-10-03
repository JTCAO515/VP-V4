# Owned Web harness immutable build candidate

Input: #628 e802 run37083860336, Main log /tmp/vp628-e802-fail.log. Preserve historical FAILs; no independent PR or merge.

## Exact observed failure

Installed Next 16.3.6 source-map load-manifest.external.ts:120 throws Error('Manifest file is empty') after existing JS file read with content.length===0. Line166 dispatches useEval→evalManifest. route-module.js:184–190 loads server/app${srcPage}_client-reference-manifest.js with useEval, handleMissing true, shouldCache !isDev. Canonical proposal route corresponds to server/app/api/trips/[tripId]/proposal/route_client-reference-manifest.js. This particular e802 error is an empty JS manifest read, not an auth/PostgREST body decode.

Webpack flight-manifest-plugin.js:428 emits this JS asset during compilation. Original owned runner used next dev --webpack and shared repository .next. CI matrix jobs use independent checkouts and lane steps are sequential (registry320+); no evidence proves cross-lane or another process wrote this exact file. The concrete failure is a dev build artifact read while empty; writer/interleaving identity remains unproven. Earlier SyntaxError failures retain historical root UNKNOWN.

## Controlled source probe

Reuse actual Next inspect probe; add exact loadManifestFromRelativePath(useEval:true,handleMissing:true,shouldCache:false) on owned zero-byte fixture. It throws Error with load-manifest frames; restore complete JS fixture and eval succeeds. See exact-eval-probe.log. This confirms the source branch and mechanism, not a forced CI concurrency reproduction. No contents or raw Error message/stack printed/saved.

## Fix scope

Only owned run.mjs and diagnostic probe changed. Snapshot current Git tracked project inputs into target/web-project (same uniquely created disposable target); exclude .env/.git/.next/node_modules. Copy original next.config.ts unchanged and link existing dependencies. No wrapper, shared config, SQL, registry or app/runtime changes. No type/security gate disabled.

Complete next build --webpack successfully before next start of that exact snapshot. Requests no longer trigger dev compilation or client-reference manifest rewrites; neither preceding harness .next nor other owner's build directory is read/written. Use a child environment allowlist of OS basics plus explicit existing local fixture URL/keys/flags. Provider and target credentials not inherited, telemetry disabled, no deployment. Credentials are memory-only environment values, not evidence files.

Explicit local VISEPANDA_PUBLIC_ORIGIN http://127.0.0.1:64651 preserves the existing forwarded origin guard in start mode; no guard relaxation. Assertions, timeouts, failure propagation and existing server/Supabase teardown retained. Private snapshot removed by existing successful owned target cleanup.

## Checks

- First build succeeded; original case stopped at revision POST403 (3/4), because start mode no longer uses the development-only localhost/127 alias bypass. Retained first-fixed-origin-fail.log.gz. Added exact local trusted origin accepted by existing guard, then reran only this affected harness.
- Final complete build→start→original4cases PASS4/4, 3.247s test time; browser flow3.055s. canonicalGetStatus200, base3/stalefalse, immutable revision/stale-head/no-extra-events assertions preserved. Successful build retains default TypeScript checks.
- Syntax/diff PASS. No optional full lane or repeated model/SQL suites.
- Main new-head batch CI UNRUN; historical #628 FAIL not overwritten. Parent development status/merge decision belongs to Main. Local candidate is not target/provider or production deployment acceptance.
