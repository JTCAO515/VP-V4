# UserDataAdapter v1

Issues: [#84 AI-51](https://github.com/JTCAO515/VP-V4/issues/84) and
[#122 AI-51b](https://github.com/JTCAO515/VP-V4/issues/122). This is the R1 user-JWT boundary,
not an Ops or worker adapter.

## Boundary

`Anonymous preview or password-authenticated Supabase cookie session -> Route Handler -> UserDataAdapter -> public RLS/security-invoker RPC`.

- Durable identity is email + password for operator-provisioned closed-beta users. Public signup,
  password-recovery email and anonymous durable identity are unavailable.
- The browser uses `createBrowserClient` with public URL/publishable-key configuration. Passwords are
  submitted directly to Supabase Auth and are never logged, persisted or returned by VisePanda.
- The public preview has no Magic Link or callback session-acquisition route. It remains anonymous and
  cannot read or write user Trip data.
- Route Handlers verify identity with `auth.getClaims()` for every request. They never trust a decoded client session object or use a service credential.
- Mutations require an exact same-origin `Origin` header and bounded UUID/idempotency/digest input.
- RLS remains final authorization. A proposal must be visible to the user and belong to the route Trip before its existing atomic confirm RPC is invoked.

## Routes

| Surface | Method | Success | Failure boundary |
| --- | --- | --- | --- |
| `/auth/sign-in` | browser Auth client | password session cookie; continue/sign-out states | generic invalid/rate-limited/unavailable; no account enumeration or signup |
| `/api/trips/:tripId` | GET | owner Trip snapshot plus owner audit list | unauthenticated `401`; inaccessible `403`; no-store |
| `/api/trips/:tripId/confirm` | POST | `applied` or `already_applied` + version | frozen failure taxonomy; no raw database text |

## Environment and rollback

Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are required; both are
browser-public configuration, never credentials. Missing configuration returns truthful unavailable,
not a fixture success. Operator account provisioning and a distinct application password remain
external acceptance actions; no password is committed or entered into an Issue, PR or artifact.

Rollback disables `/auth/sign-in` and returns the product to preview-only unauthenticated behavior. It
does not restore Magic Link, use a service credential, create anonymous durable identity, or delete
accepted Trip/audit records.
