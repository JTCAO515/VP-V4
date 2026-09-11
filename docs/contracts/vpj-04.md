# VPJ-04 — native session v2

Related to #191. The disposable-local identity path has existing runtime evidence. The explicitly configured Staging Preview path below has scoped real login/profile/refresh, two-Simulator replacement, Keychain and Web-coexistence evidence in the [2026-09-11 execution record](../../artifacts/VPJ-04/staging-native/remote-20260911/verification.md). Full #191 acceptance remains open. Production activation, C2/model calls and push registration remain unavailable. Native Trip uses the same identity under VPJ-05.

## Local activation and credentials

The server requires `VISEPANDA_NATIVE_LOCAL_SESSION=true`, a loopback HTTP Supabase URL, its public key and the server-only `VISEPANDA_NATIVE_LOCAL_SERVICE_KEY`. Missing activation/configuration returns 503. No request chooses the Auth host/key. The app requires `-VisePandaNativeAPI http://127.0.0.1:<port>` (or localhost); remote URLs are rejected. There is no embedded provider/server secret or default API URL in Swift.

Every native route rejects any Cookie or Origin header. Native paths do not write cookies, emit permissive CORS, or modify Web same-origin/CSRF checks. Ordinary access JWTs are verified with the existing `verifyNativeCredentials` SDK path. The privileged key is used only for the fixed fresh-password proof RPC after successful ordinary password authentication; it never handles user data reads/writes or supplies actor identity.

## Staging Preview configuration

The remote path is closed by default. `VISEPANDA_NATIVE_STAGING=true` and
`VISEPANDA_TRIP_PROTOCOL_V2=true` must be configured on an explicitly selected Preview branch.
`VERCEL_ENV` must be `preview`, `VERCEL_URL` must be an exact deployment hostname matching
`vp-v4-<alphanumeric>-jtcao515s-projects.vercel.app`, and the incoming request origin must be
`https://<that VERCEL_URL>`. Stable aliases, branch aliases, custom domains, HTTP, another
project and Production are rejected. `NEXT_PUBLIC_SUPABASE_URL` must equal the named Staging
`https://dzqdzetcctkhbrhlxxgn.supabase.co` exactly, with its ordinary public key. Request input
never supplies an environment, database or credential. LOCAL flags cannot activate on Vercel.

Only password-proof creation uses server-only `VISEPANDA_NATIVE_STAGING_PROOF_KEY`, with the
same already-applied `native_prepare_v2` RPC contract. It is never returned to the app or passed
to the Trip adapter. A missing proof key leaves password credentials unavailable; it does not
permit a weaker login. Existing JWT/profile/RLS operations still use the ordinary user's token.
Provisioning this Preview key is a separately reviewed configuration action, not an implied
consequence of adding an environment variable name to source.

An installed Staging app reads `VisePandaNativeEnvironment=staging` and
`VisePandaStagingAPIOrigin=https://<exact deployed host>` from its generated Info.plist, supplied
by build settings `VP_NATIVE_ENVIRONMENT` and `VP_NATIVE_STAGING_API_ORIGIN`. Both default empty. `NativeEnvironment.plist` supplies these custom keys and Xcode expands the build variables while merging generated standard keys; arbitrary `INFOPLIST_KEY_*` build settings are not used.
Only a root HTTPS deployment origin in the same project hostname family is valid; explicit
ports, path, query, fragment and userinfo are refused. Remote launch arguments never enable or
override this endpoint. Partial/invalid build configuration stays disabled without local fallback.
The existing Keychain and data scope include the canonical endpoint and account; switching
Preview deployment cannot reuse another endpoint's stored credentials or drafts. Redirects remain
blocked before a second request. The local app path and its stored endpoint spelling are preserved.

Rollback disables the Preview activation flag and rebuilds/redeploys that Preview, and removes
the Staging app build settings. Remove its host from the maintenance allowlist if access must stop
immediately. No production setting, applied migration, mobile tombstone or user data is reverted.
Actual activation and owner/other/replacement/Web-coexistence evidence are required before calling
this a working remote identity capability. See [Staging native acceptance](../runbooks/native-staging-s1.md).

## HTTP contract

All routes are under `/api/auth/native/v2`. JSON responses are `Cache-Control: no-store`; failures contain only `{error:{code}}`, without upstream bodies, tokens or personal diagnostics.

| Endpoint | Input | Success |
| --- | --- | --- |
| POST credentials | `{email,password,attemptId:UUID}`, no Authorization | `{version:2,subject,accessToken,refreshToken,expiresAt}` |
| POST login | Bearer access JWT; `{attemptId:UUID}` | `{version:2,subject,sessionId,mobileEpoch}` |
| GET session | Bearer access JWT | same session envelope |
| POST refresh | `{refreshToken}`, no Authorization | session envelope plus `accessToken,refreshToken,expiresAt` |
| POST logout | Bearer access JWT; `{}` | final session envelope; session has been revoked |
| GET profile | Bearer access JWT | `{version:2,subject,displayName:string|null}`, read with the same ordinary JWT and owner RLS |

`credentials` performs a real password login and creates a private proof bound to that Auth session, account and attempt. Only the trusted server proof RPC has this authority; even a freshly signed-in Web JWT cannot manufacture a proof. Proofs expire after two minutes. A pending/expired proof already marks its session as native, so it cannot use the unregistered Web path. Swift saves the pending attempt and credentials in Keychain **before** committing login, allowing a lost login response to retry the same session/attempt.

Each identity HTTP request has one10-second lifetime covering streamed input, Auth, claims/JWKS,
proof/session RPCs and profile reads. The existing20,000 UTF-16 input limit remains, with a60,000
UTF-8 byte ceiling checked before accumulating additional chunks. Configuration, local URL,
method and Origin/Cookie guards remain ahead of input processing. A stalled reader or SDK callback
cannot keep the handler waiting beyond cancellation/deadline; reader cancellation is not awaited.
The same signal and redirect rejection bind every identity-request SDK fetch. A rejected transport
closes the scope and prevents subsequent network work, even if the SDK continues internal callbacks.
Other callers of the existing credential verifier keep their default transport behavior.

Cancellation, deadline, network/redirect failure, upstream429/5xx, malformed Auth JSON or missing
session returns the existing503 `UNAVAILABLE`, not a claim that the credentials are invalid.
Only explicit Auth API rejection codes or SDK JWT rejection retain401; malformed caller JWT
JSON is rejected before SDK parsing. Unknown/proxy errors never become credential denial.503 is unavailable
or an unknown acknowledgement: a dispatched Auth mutation/proof/login/logout may already have
committed. It proves neither rollback nor revocation. The server adds no automatic replacement
attempt or RPC replay; the existing stored session/attempt retry and mobile-epoch checks remain
authoritative. Existing Swift503 handling retains the pending Keychain credential for retry.

First login for an attempt serializes on the account row, increments its persistent mobile epoch and revokes only the previous mobile Auth session. Repeating the same active session/attempt returns the same epoch. Reusing an attempt with another session conflicts; a superseded attempt/session cannot reclaim the account. Refresh never creates a proof or epoch. A replaced session cannot refresh through either the native API or direct Auth endpoint. A replaced logout cannot clear the new session. Web sessions coexist.

## Database enforcement

Private tables own account epochs, attempt tombstones and pending proofs. Ordinary users have no table access. Tombstones deliberately do not reference `auth.sessions`: deleting a revoked Auth session must not erase its native classification.

Authenticated access to existing public RLS tables has an additional restrictive mobile-session predicate. Writes take the same account lock as login/logout, then recheck active session state. Existing authenticated-callable public `SECURITY DEFINER` RPCs also check at entry, including no-write idempotent replay branches. The migration freezes all 15 exact signatures and original source hashes and rejects unknown inventories/bodies. Removing the inserted guard must reproduce the original body hash. Original business/owner/TripProposal checks remain in place. Future tables/RPCs must explicitly retain these guards before exposing a native consumer.

The read predicate is read-only because PostgREST GET transactions cannot acquire `FOR UPDATE`; protected writes and RPC entries acquire the serialization lock. No client-supplied epoch, owner, device class or metadata grants authority.

## Native storage and boundaries

Keychain service is dedicated to this v2 integration and partitioned by endpoint and subject, with `WhenUnlockedThisDeviceOnly` accessibility. UserDefaults stores only the active subject pointer. Profile data exists only in the current account's memory and is cleared on account change, denial or logout. Network errors hide stale profile data while retaining the pending credential for retry. Async session operations serialize through the MainActor coordinator; scene activation revalidates the account. Expired logout first refreshes the same active epoch before revoking it.

Unsigned simulator builds can compile but do not establish Keychain acceptance. Local runtime verification uses only ad-hoc simulator signing; no real signing identity or provisioning profile is required. Physical-device/VoiceOver and push-token binding remain separate unrun acceptance; the scoped remote Simulator result is linked above.

## Verification and rollback

Identity and adjacent DB suites require both `VP_IDENTITY_SUPABASE_WORKDIR` and `VP_IDENTITY_SUPABASE_API_URL`. The helper verifies the explicit loopback target and derives its SQL container from that workdir. Missing configuration is reported as skipped/incomplete; an incorrect configured target fails. No suite or `db:verify` discovers the repository's existing default instance.

Evidence lives under `artifacts/VPJ-04/local-session/`. Tests use ordinary synthetic accounts, real Auth tokens, real Next routes and real PostgREST/RLS. No JWT or service key is retained in artifacts. Test-only Trip/Turn records exercise revocation and do not activate native Trip or C2 features.

Runtime rollback disables the local activation flag and app endpoint. Preserve revocation tombstones and database guards: dropping them can revive still-signed stale JWTs. A remote compatibility rollback needs a separately reviewed forward migration; do not edit applied history or restore revoked/deleted identity data. Disposable schema reset is test-environment preparation only, not a production rollback recipe.
