# Authless Preview and Unblocked Issue Workflow — Design Specification

**Status:** Approved concept; awaiting specification review

**Date:** 2026-08-28

## Objective

Remove the Supabase Magic Link sign-in path so development and preview use no email-based authentication. Replace dependency-gated Issue scheduling with direct queue eligibility, without weakening runtime authorization, RLS, data-policy, or safety controls.

## Scope

- Delete the Magic Link API route and callback route.
- Remove Magic Link references from tests, tracker material, handoff state, and accepted workflow documentation.
- Keep the public landing and preview routes anonymous.
- Preserve user-bound Trip API behavior: a missing valid Supabase session returns the existing `UNAUTHENTICATED` failure and never reads, writes, or impersonates user data.
- Change local Issue governance so defined Issues can be scheduled directly rather than waiting for textual or native dependency closure.
- Record GitHub status/label synchronization as skipped when the authenticated `gh` CLI is unavailable; do not request credentials or print tokens.

## Anti-goals

- No guest identity, fixed user ID, service-role credential, or RLS bypass.
- No relaxation of in-code safety, data eligibility, consent, authorization, or destructive-operation checks.
- No automatic external account, provider, database, deployment, or GitHub mutation.
- No concurrent implementation of overlapping Issue-owned paths; direct eligibility changes scheduling, not file ownership.

## Design

### Authentication boundary

The application has an anonymous public preview. The dedicated Magic Link request endpoint and OAuth/PKCE callback endpoint are removed. `UserDataAdapter` remains the sole user-data boundary and continues to obtain actor identity only from a valid Supabase session claim. This leaves authenticated Trip operations unavailable to anonymous visitors, with the existing frozen `401 UNAUTHENTICATED` failure.

### Issue workflow boundary

The tracker and execution contract stop treating completion of another Issue as a prerequisite for beginning implementation. Every fully specified Issue becomes schedulable, while the agent still develops one scoped Issue at a time, creates a dedicated branch, verifies it, performs automated review, and merges it to `main` only after evidence is available. References to dependency ordering, ready-frontier-only scheduling, and `status:blocked` as an execution prohibition are replaced with direct-queue wording.

Runtime guards retain their current meaning. A `DATA_POLICY_BLOCKED`, `SAFETY_BLOCKED`, or `UNAUTHENTICATED` result is a product behavior, not an Issue scheduling dependency, and remains fail-closed.

### GitHub synchronization

The repository-local governance is authoritative for this change. The agent attempts GitHub Issue label/status updates only through an authenticated `gh` CLI. If authentication is unavailable, it records the remote update as skipped and continues local development; it neither asks for a login nor substitutes credentials.

## Acceptance criteria

1. No source route or test references `magic-link`, `signInWithOtp`, or `/auth/callback`.
2. A static test proves the deleted endpoints are absent and the public landing imports no authentication entrypoint.
3. Existing Trip API tests still prove unauthenticated access maps to `401 UNAUTHENTICATED`; no service credential or fixed actor is introduced.
4. Local tracker, triage labels, execution contract, handoff, and context describe direct Issue scheduling and explicitly separate it from runtime fail-closed guards.
5. `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, relevant contract/security suites, documentation checks, and `git diff --check` provide fresh evidence before merge.
6. An automated code review finds no unresolved critical or important finding before merge.

## Risks and rollback

Removing Magic Link intentionally removes the only implemented end-user session acquisition route; authenticated Trip operations remain unavailable until a separately accepted authentication method exists. Revert the single implementation commit to restore the endpoints and prior dependency-gated governance. No migration, provider account, or remote Issue mutation is part of this change.
