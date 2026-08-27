# ADR-0017: Password-authenticated closed beta

Status: accepted on 2026-08-26 by explicit operator decision in #122. This supersedes only the
Magic Link mechanism in ADR-0007 and the UserDataAdapter v1 login contract; authenticated-only
durable state, verified user JWT and RLS remain unchanged.

## Context

The R1 Magic Link path could send a generic `202` while Supabase later rejected delivery with an
email rate limit. Clicked one-time links returned `otp_expired`, and the application remained
`UNAUTHENTICATED`. The default Free-plan template is read-only, and one-time email links add provider,
prefetch and callback-verifier failure modes that are not required for a small pre-provisioned beta.

## Decision

- R1 uses email + password sign-in for operator-provisioned closed-beta users.
- Public signup, anonymous durable identities, password-recovery email, social login and MFA are
  unavailable until separately accepted.
- Application passwords are distinct from Supabase Dashboard credentials. VisePanda never receives,
  logs, persists or administers plaintext passwords.
- The browser uses the pinned `@supabase/ssr` browser client and public project configuration. Server
  data routes continue to verify `auth.getClaims()` and rely on user-JWT RLS/security-invoker RPC.
- Sign-in failures are generic and localized; they cannot reveal whether an account exists.
- The R1 Magic Link initiation and callback routes are retired, not left as a second login mechanism.

## Consequences

The operator must provision each beta user and set a separate application password through a secure
Supabase-controlled action. Account recovery and MFA remain explicit release gaps. A login page proves
neither public availability nor completed owner/other-user acceptance.

## Rollback

Revert the isolated password-login PR and disable `/auth/sign-in`, returning to preview-only,
unauthenticated behavior. Do not restore Magic Link without a new operator decision. No Trip, audit,
RLS, migration or Supabase project configuration is rolled back.
