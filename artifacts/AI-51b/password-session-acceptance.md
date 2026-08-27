# AI-51b password-session acceptance evidence

## Scope

PR #123 at `f78b031` replaces the R1 Magic Link path with an operator-provisioned closed-beta
email/password sign-in and local sign-out surface. It does not change Supabase migrations, RLS,
Trip RPCs, public signup or password recovery.

## Observed Preview evidence

- The operator reported a successful closed-beta sign-in on 2026-08-26.
- Codex subsequently observed `You are signed in` in the same Vercel Preview session.
- After explicit confirmation, Codex clicked `Sign out` and observed the email/password form again;
  no browser console warning/error was observed.
- A no-cookie remote GET for an inaccessible UUID returned `401 UNAUTHENTICATED`.
- The retired `/api/auth/magic-link` and `/auth/callback` routes returned `404` on the Preview.
- After rebasing onto `ec0faa8`, the Preview rendered the signed-out form at 1280×800 and 390×844 Arabic
  RTL without console warning/error or horizontal overflow.

## Boundary and remaining evidence

Browser automation rejects direct Preview `/api/trips/*` navigation with `net::ERR_BLOCKED_BY_CLIENT`.
No Cookie, JWT, password or user identifier was read, copied or used to bypass that limit. Therefore,
authenticated inaccessible-Trip `403`, owner read/confirm/reload, other-user denial and an API-level
post-sign-out `401` remain #84 acceptance evidence, not proven by this artifact.

## Rollback

Revert PR #123. No database, Auth configuration, RLS, migration or user data rollback is part of this
PR; do not restore Magic Link without a new operator decision.
