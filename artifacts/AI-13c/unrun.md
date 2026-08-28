# AI-13c unrun checks

`pnpm test:integration` was invoked on 2026-08-28, but all four local RLS cases skipped because
the local Supabase stack is not running. `pnpm test:security` passed its four static cases, while its
local RLS/fault case skipped for the same reason. Owner/other-user/replay database acceptance is
therefore unverified in this checkout; no local or Preview result is presented as a substitute.

Preview owner-session verification remains pending this PR's Vercel deployment; downstream Canvas
browser evidence remains #15 ownership.

Synthetic local Canvas QA found Next normalizing `request.nextUrl.origin` to `localhost` while the
Browser used `127.0.0.1`, causing a legitimate same-origin mutation to fail `403`. The follow-up guard
accepts only a strictly validated Host/X-Forwarded-Host plus `http`/`https` protocol match; attacker,
multi-host and non-HTTP origins remain rejected.
