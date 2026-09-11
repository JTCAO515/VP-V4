# S1 remote native readiness — 2026-09-11

Related to #187, #191 and #192. Baseline: `7bf22fb29884d07714fd4eae3496f2857be98fdc`.
JT explicitly resumed Goal development after the previous stop. This work unit establishes the actual S1 integration frontier; it does not claim a completed user capability.

## Observed in the target environment

- Existing official Vercel credentials allowed read-only metadata inspection. Production targets main at the baseline above; the active WAF is version2 with one rule, no draft or bypass. All three environment public database URLs still identify the named Staging. Private environment values were not retrieved.
- The maintenance-authorized Preview `vp-v4-d6yc4thvq-jtcao515s-projects.vercel.app` and stable alias `vp-v4.vercel.app` returned200 on `/auth/login` and503 JSON on `/api/auth/native/v2/session`. Only anonymous GETs were sent. No credentials, Auth accounts, Trip writes, provider traffic or remote configuration changes were made.
- Project environment inventory contains no native session/Trip activation or native proof key. Environment presence does not establish deployed value correctness; the503 is the observed native result.

See `vercel-metadata.json` and `anonymous-probes.json`. The historical maintenance snapshot was preserved.

## Implementation frontier

`NativeSession.swift` permits only a loopback HTTP API. `nativeIdentityHTTP` independently rejects a remote Supabase URL. Each identity route is gated by `VISEPANDA_NATIVE_LOCAL_SESSION`; Trip activation separately requires `VISEPANDA_NATIVE_LOCAL_TRIP` and loopback. The present contract in `docs/contracts/vpj-04.md` is explicitly disposable-local only. Setting LOCAL flags on Vercel cannot establish the required remote chain.

The next coherent slice is a versioned, explicitly configured remote identity/Trip path, with fixed HTTPS destination, no redirects or cookie fallback, same ordinary JWT/RLS and mobile epoch fencing, and credentials scoped to the selected environment. A reviewed deployment configuration and ordinary-account owner/other/replacement/Web coexistence acceptance must precede any remote capability claim. Existing local evidence can support unchanged semantics, but cannot replace this remote test.

## Release boundary and acceptance

The live Production target is main. The current Goal separately reserves production release approval; earlier release authorization is not used to override that current boundary. Repository implementation, tests and PR preparation can continue; a merge that publishes Production needs that boundary resolved before execution. No deployment settings were changed.

PASS: read-only metadata and anonymous route observations. UNRUN: authenticated remote native login/refresh/replacement, Web coexistence, same-Trip editing/reload, physical device and S2 real Ask. #191/#192 remain open; neither S1 nor S2 is accepted. Elapsed start-to-acceptance is not available because capability acceptance is not reached. No runtime rework or operator wait occurred in this evidence slice.
