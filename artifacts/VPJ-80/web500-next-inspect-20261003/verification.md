# VPJ-80 actual Next inspect diagnostic candidate

Input: #628 exact3942 CI run37082030027/native111084436827 FAIL; Main-provided /tmp/vp628-fail.log. Server json_unexpected_end at 2026-10-03T00:38:47.702Z, canonical GET500/test dual JSON decode failures. #627 historical root UNKNOWN retained; #628 not mergeable based on this evidence.

## Actual installed source

Next 16.3.6 patch-error-inspect.js:174–178 ignores all node:/node_modules frames; 354–355 reads __NEXT_SHOW_IGNORE_LISTED; 405–424 suppresses ignored frames by default. Its custom Error inspect hook at 454+ produces the printed representation. setup-dev-bundler.js:903–921 logErrorWithOriginalStack ultimately calls log.error(err), so the method name does not imply raw stack output.

load-manifest.external.js:54 JSON.parse(file text); load-components.js:46–59 retries loading. This remains a candidate actual 500 source, not established causality.

Installed PostgREST 2.112.4 index.cjs:449–465 reads text, skips empty body, catches JSON.parse failure as structured error; default then also catches failures. Auth fetch.js:136–143 catches result.json and calls handleError; handleError:35+ wraps non-response errors as AuthRetryableFetchError. These facts make a naked propagated SyntaxError less directly consistent with these particular paths, but do not exclude other authentication/response parsing paths. No transport hook added.

## Single-variable controlled probe

Run `node tests/integration/web-trip-continuity/next-inspect-probe.mjs` in an isolated process with actual installed Next modules and baseline bootstrap. Create one owned temporary malformed manifest and one real loadManifest SyntaxError. Inspect that same Error first with flag absent, then true. Both formatted outputs pass through existing safe observer in memory; original message, raw stack and manifest content never saved/printed.

PASS: original error contains Next frame; default inspected output hides it. With flag true, same safe observer emits node_modules/next/dist/server/load-manifest.external.js:54:25. Assertions also require safe output never contains synthetic secret or temporary absolute path.

Additional deterministic controlled truncate/read/restore candidate mechanism: write empty owned fixture, actual uncached loadManifest throws SyntaxError (bytes0, empty SHA256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855); restore complete JSON, actual loadManifest succeeds. This demonstrates a possible read-during-incomplete-write interleaving only; it is not concurrent CI reproduction or evidence of the CI manifest contents.

Initial probe lacked Next baseline AsyncLocalStorage bootstrap and failed before inspection; corrected to actual next/dist/server/node-environment-baseline. No runtime/module changes, raw initial error not retained as an artifact.

## Candidate hunk and checks

Only owned runner Next child environment adds __NEXT_SHOW_IGNORE_LISTED:'true'; all other environment values, fetch, request handling, assertions, timeouts and cleanup stay unchanged. Parent still receives raw child pipes solely through bounded output-only observer, with existing 24 ordinary/72 error caps and finite allowed frames. No global manifest/response interception, no retry/wait/product/SQL/registry change.

PASS actual probe; PASS existing observer 3/3; PASS syntax and diff. Full harness and next-head CI UNRUN by instruction; freeze for Main review first. Local Node v26.8.2 is not CI runtime acceptance. Actual 500 root still UNKNOWN.

If next CI identifies manifest frames: propose fixed manifest-name/read-stage bytes+SHA instrumentation at that exact boundary. If response frames: propose fixed content-type enum/declared-length class at the implicated transport, without clone/read body or credentials. Both remain proposals, not implemented broad hooks.
