# VPJ-04 — native local session v2

Related to #191. This contract enables a real **disposable local** iOS → Next.js → Supabase identity path. Remote accounts, production activation, native Trip writes, C2/model calls and push registration remain unavailable.

## Activation and credentials

The server requires `VISEPANDA_NATIVE_LOCAL_SESSION=true`, a loopback HTTP Supabase URL, its public key and the server-only `VISEPANDA_NATIVE_LOCAL_SERVICE_KEY`. Missing activation/configuration returns 503. No request chooses the Auth host/key. The app requires `-VisePandaNativeAPI http://127.0.0.1:<port>` (or localhost); remote URLs are rejected. There is no embedded provider/server secret or default API URL in Swift.

Every native route rejects any Cookie or Origin header. Native paths do not write cookies, emit permissive CORS, or modify Web same-origin/CSRF checks. Ordinary access JWTs are verified with the existing `verifyNativeCredentials` SDK path. The privileged key is used only for the fixed fresh-password proof RPC after successful ordinary password authentication; it never handles user data reads/writes or supplies actor identity.

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

First login for an attempt serializes on the account row, increments its persistent mobile epoch and revokes only the previous mobile Auth session. Repeating the same active session/attempt returns the same epoch. Reusing an attempt with another session conflicts; a superseded attempt/session cannot reclaim the account. Refresh never creates a proof or epoch. A replaced session cannot refresh through either the native API or direct Auth endpoint. A replaced logout cannot clear the new session. Web sessions coexist.

## Database enforcement

Private tables own account epochs, attempt tombstones and pending proofs. Ordinary users have no table access. Tombstones deliberately do not reference `auth.sessions`: deleting a revoked Auth session must not erase its native classification.

Authenticated access to existing public RLS tables has an additional restrictive mobile-session predicate. Writes take the same account lock as login/logout, then recheck active session state. Existing authenticated-callable public `SECURITY DEFINER` RPCs also check at entry, including no-write idempotent replay branches. The migration freezes all 15 exact signatures and original source hashes and rejects unknown inventories/bodies. Removing the inserted guard must reproduce the original body hash. Original business/owner/TripProposal checks remain in place. Future tables/RPCs must explicitly retain these guards before exposing a native consumer.

The read predicate is read-only because PostgREST GET transactions cannot acquire `FOR UPDATE`; protected writes and RPC entries acquire the serialization lock. No client-supplied epoch, owner, device class or metadata grants authority.

## Native storage and boundaries

Keychain service is dedicated to this local v2 integration and partitioned by endpoint and subject, with `WhenUnlockedThisDeviceOnly` accessibility. UserDefaults stores only the active subject pointer. Profile data exists only in the current account's memory and is cleared on account change, denial or logout. Network errors hide stale profile data while retaining the pending credential for retry. Async session operations serialize through the MainActor coordinator; scene activation revalidates the account. Expired logout first refreshes the same active epoch before revoking it.

Unsigned simulator builds can compile but do not establish Keychain acceptance. Local runtime verification uses only ad-hoc simulator signing; no real signing identity or provisioning profile is required. Physical-device/VoiceOver, push-token binding and remote activation remain separate unrun acceptance.

## Verification and rollback

Identity and adjacent DB suites require both `VP_IDENTITY_SUPABASE_WORKDIR` and `VP_IDENTITY_SUPABASE_API_URL`. The helper verifies the explicit loopback target and derives its SQL container from that workdir. Missing configuration is reported as skipped/incomplete; an incorrect configured target fails. No suite or `db:verify` discovers the repository's existing default instance.

Evidence lives under `artifacts/VPJ-04/local-session/`. Tests use ordinary synthetic accounts, real Auth tokens, real Next routes and real PostgREST/RLS. No JWT or service key is retained in artifacts. Test-only Trip/Turn records exercise revocation and do not activate native Trip or C2 features.

Runtime rollback disables the local activation flag and app endpoint. Preserve revocation tombstones and database guards: dropping them can revive still-signed stale JWTs. A remote compatibility rollback needs a separately reviewed forward migration; do not edit applied history or restore revoked/deleted identity data. Disposable schema reset is test-environment preparation only, not a production rollback recipe.
