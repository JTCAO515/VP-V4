# V4-06 actor and session evidence matrix

| Actor/session state | Expected boundary | Evidence | Runtime status |
| --- | --- | --- | --- |
| Anonymous visitor | Public landing remains usable; protected data adapter rejects the request as `UNAUTHENTICATED`. | `pnpm test:security` and `pnpm test:e2e` (recorded in `commands.jsonl`); `lib/server/identity/user-data-adapter.ts` derives identity with `auth.getClaims()`. | Static coverage passed; live protected-route request is unrun because local Supabase is unavailable. |
| Password user with a valid session | Sign-in surface uses password authentication and can proceed to product routes. | `tests/e2e/identity/password-login-surface.test.mjs`, included in the passed E2E suite. | Surface coverage passed; a credentialed login is intentionally unrun because no test account/session is available. |
| Expired or invalid local session | The password form clears local state and presents the localized session-expired recovery state. | `components/auth/PasswordSignInForm.tsx` and the passed password-login surface suite. | Static coverage passed; real expiration recovery is unrun without a live auth runtime. |
| Other user or nonexistent consent/data identifier | Durable reads/writes must not reveal another user's record. | `pnpm test:security`; owner/cross-owner RLS test is present but skipped without local Supabase. | Unrun; no ownership claim is made for this environment. |
| Magic-link caller | Magic-link endpoints and callback flow are absent; password auth is the supported sign-in path. | `tests/security/identity/magic-link-removed.test.mjs`, included in the passed security suite. | Static coverage passed; no remote endpoint probing was performed. |

`unrun.md` records the exact local-runtime and credential prerequisites for the rows that are not executable here.
