# UserDataAdapter v1

Issues: [#84 AI-51](https://github.com/JTCAO515/VP-V4/issues/84) and
[#120 AI-51a](https://github.com/JTCAO515/VP-V4/issues/120). This is the R1 user-JWT boundary,
not an Ops or worker adapter.

## Boundary

`Browser -> same-browser PKCE verifier cookie -> callback session cookie -> Route Handler -> UserDataAdapter -> public RLS/security-invoker RPC`.

- Durable identity is email magic-link only and never creates a user during sign-in (`shouldCreateUser:false`).
- The same-origin Magic Link POST uses `@supabase/ssr` cookie storage so the initiating browser retains
  the PKCE verifier required by `/auth/callback`. A verifier created only in ephemeral server memory is
  invalid because the callback cannot exchange the auth code.
- Route Handlers verify identity with `auth.getClaims()` for every request. They never trust a decoded client session object or use a service credential.
- Mutations require an exact same-origin `Origin` header and bounded UUID/idempotency/digest input.
- RLS remains final authorization. A proposal must be visible to the user and belong to the route Trip before its existing atomic confirm RPC is invoked.

## Routes

| Route | Method | Success | Failure boundary |
| --- | --- | --- | --- |
| `/api/auth/magic-link` | POST | generic `202` plus same-browser PKCE verifier cookie | invalid/cross-origin/config-unavailable; no account enumeration |
| `/auth/callback` | GET | exchanges a PKCE code into cookie session and redirects to local `/visepanda` | no open redirect; failed/unavailable is disclosed in route query only |
| `/api/trips/:tripId` | GET | owner Trip snapshot plus owner audit list | unauthenticated `401`; inaccessible `403`; no-store |
| `/api/trips/:tripId/confirm` | POST | `applied` or `already_applied` + version | frozen failure taxonomy; no raw database text |

## Environment and rollback

Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are required; both are browser-public configuration, never credentials. Missing configuration returns truthful unavailable, not a fixture success. A controlled 2026-08-26 acceptance check visually verified the production Site URL plus exact production, localhost and Vercel Preview callback allowlist. Custom SMTP and general deliverability remain unverified; a one-time link may still be consumed or expired by an email client/security scanner and must fail without creating a session.

Rollback disables the Magic Link and Trip API routes. It does not use a service credential, create anonymous durable identity, or delete existing accepted Trip/audit records.
