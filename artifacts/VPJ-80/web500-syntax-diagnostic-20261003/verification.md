# Web 570 SyntaxError diagnostic freeze

Input: PR #627 head 570bbf, CI run 37078530216, Main-provided /tmp/vp627-570-fail.log. Preserve FAIL; no merge or product fix claimed.

## Current evidence

- 23:52:13.872 UTC proposal POST 201; 14.252 server stderr SyntaxError/category other; 17.517 canonical proposal GET 500; 17.620 another proposal GET 200. Review/cleanup both fail in canonical_arrival/json with SyntaxError. Server error predates test JSON decoding; this is not solely a test-side parse error.
- GET app/api/trips/[tripId]/proposal/route.ts:7–19 has no request.json/JSON.parse. Adapter lib/server/identity/user-data-adapter.ts:860–896 uses auth.getClaims, Supabase reads/RPC, stored object projection. Client/pendingCookies at 181–198 are per-request. No proven shared-response/cookie cause.
- Installed Next load-manifest.external.js:54 parses file text; load-components.js:46–59 retries manifest load. This is a concrete candidate path, not proof that CI read a malformed manifest. No CI manifest payload artifact was available in the provided log; no content is printed.

## Minimal observer change

Fixed SyntaxError categories: json_unexpected_token, json_unexpected_end, json_parse, module_syntax, syntax_unknown. Categories are message-pattern hints, not authenticated cause or proof of JSON versus JavaScript syntax failure. Explicit module syntax phrases take precedence over generic unexpected-token patterns.

Only genuine `at` lines emit frames. Retain existing bounded relative Next/React/Supabase/server/API paths; extend .next/server, fixed JSON.parse (<anonymous>) and finite Node internal undici/module loader/stream/task/vm positions. Webpack prefixes/absolute host path/function names are not emitted. No raw message/body/URL. Ordinary 24/error 72 budgets and bounded buffers remain unchanged.

Expected next CI discrimination:

- A: JSON.parse + load-manifest.external/load-components/webpack positions => investigate dev compiler manifest read/write overlap.
- B: JSON.parse + undici/Supabase positions => investigate authentication/PostgREST response decoding.
- C: module_syntax + module-loader/webpack positions => investigate generated module syntax/loading.

## Verification

PASS 3/3 observer tests: existing privacy and 24/72 budget cases, plus synthetic A/B/C category/frame samples with secret non-disclosure, anonymous JSON frame, Next loadManifest/loadComponents, undici, Supabase, module-loader and .next/server positions; arbitrary internal path and non-stack line rejected. Syntax/diff PASS.

UNRUN: local full harness, next-head CI, controlled root-cause reproduction, product fix. Main explicitly requested freeze for review before CI. Request/environment/response handling and product files unchanged. Root cause UNKNOWN; 570 FAIL remains authoritative.
