# VPJ-04 native identity request lifetime

Related to #191. Original baseline c59fdb92f4b05d51e0f84e3571ff04414711f641;
independent Native-Identity-IO worktree. Only identity HTTP/credential transport, its tests
and this contract/evidence change. No Swift, Ops, DB schema, remote profile or activation.

## Failure and result

[Original regression](red.log): aborting a request whose body never ends left the original
handler pending instead of responding503. The raw temporary log is retained; the repository
copy only normalizes trailing whitespace. The new request scope covers input/Auth/claims/RPC
with one10-second deadline, bounded buffering and request cancellation. Late callbacks cannot
initiate another transport after closure. An upstream transport failure does not prove an Auth
credential denial or a dispatched mutation rollback.

The existing20k UTF-16 input maximum remains, with a60k-byte buffer ceiling. Native local URL,
Cookie/Origin, ordinary JWT issuer/audience/role/session and mobile attempt checks remain.
Scoped redirects/network failure,429/5xx and malformed upstream JSON are unavailable503.
Missing Auth session/unknown SDK errors are also503; explicit Auth API codes and SDK expiry/
signature rejection preserve401. Caller JWT header/payload JSON syntax is checked before SDK
parsing so malformed caller data cannot masquerade as an upstream parsing fault. It grants
no trust: the actual SDK cryptographic and existing claim checks still run.

The public failure envelope remains unchanged. Existing Swift503 handling retains its
pending Keychain session/attempt; the server does not mint a replacement attempt or claim a
proof/login/logout was rolled back. After an unknown login result, the same session/attempt
can exercise the existing idempotent RPC. No new billing or identity ownership policy exists.
The optional availability/fetch seam is used only by this identity handler; existing callers
of the credential verifier retain their default behavior.

## Local evidence

- Ten directed contracts cover incomplete/oversized bodies, hostile cancel, deadline and
  late token/JWKS/proof callbacks, unknown login with identical retry params, explicit Auth
  rejection versus network/protocol failure, and malformed/expired/forged JWTs.
- Existing real loopback307/308 first-hop tests retain zero second-hop credential forwarding.
  Scoped rejection now correctly expects503, preserving the caller's credentials.
- [Real local identity run](live.log):1 aggregate test passed with zero skips using newly
  owned GoTrue/Next/PostgREST and current migrations. It covers real password login, exact
  login replay/epoch, profile/RLS owner isolation, refresh, phone replacement/revocation,
  logout, no-write RPC replay protection, and Web Cookie/Origin coexistence.
- Reproduce that environment with `node tests/integration/identity/run-native-io.mjs` from
  the repository root. It checks unused local ports, creates a unique unlinked stack, pins
  a verified local Docker context, selects the existing v2 Trip protocol and removes its
  owned stack. It does not read a repository .env, copy seed data or discover a prior DB.
- Natural signed-token expiry, Simulator/physical Keychain behavior and remote acceptance
  were not rerun here. Swift source was not changed; this does not supersede earlier evidence.

Actual commands and broad-suite skip boundaries are in commands.jsonl. No real credential,
paid/model call, shared DB, remote migration or remote allowlisted profile was used.

## Development and review corrections

Initial typecheck caught PostgREST abortSignal being chained after maybeSingle; it now attaches
at the supported builder stage. Two test-fixture mistakes were corrected: a spread accidentally
read the hostile body getter, and synthetic JWT keys shared a kid across loopback-port SDK
caches. Test origins are optional and signing key IDs are now unique; no Auth validation was
weakened. An initial local integration run omitted the explicit DB28+ v2 test flag and correctly
failed with CONFIRMATION_DIGEST_MISMATCH; the temporary runner was corrected, not the SQL.

Independent review of runtime1026b790 found an additional Important classification defect:
Auth HTTP429/500/503, malformed200 JSON and missing-session200 still became401 through SDK
error normalization. The corrected transport marks outages/parsing failure unavailable before
SDK retries; credential normalization distinguishes Auth denial from unknown errors. Regression
matrices cover token/refresh and claims, with caller malformed/expired/forged JWT still401.
The reviewer will verify the final exact HEAD; earlier passes did not cover that defect.

#191 remains open. Rollback disables this local consumer while retaining session/attempt
and epoch/tombstone records. Never restore revoked sessions or infer DB rollback from503.
