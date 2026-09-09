# VPJ-04 native credential preparation

Related to #191, scope comment 5605678206. Initial baseline: `db347bc`; final fast-forward base: `272ca7d` (merged main only).
This slice preserves the existing Web adapter while preparing the native credential seam.
No HTTP route or iOS consumer is activated; #191 remains OPEN.

## Credential verification and data-client binding

`verifyNativeCredentials` parses one bounded compact Bearer JWT, rejects any Cookie header
(including empty, custom or chunked cookies), and calls the pinned Supabase Auth SDK's
`getClaims(token)`. The SDK performs signature/expiry verification, including its Auth-server
fallback where applicable. Production code implements no JWT cryptography or unverified decoder.
Ordinary-user subject/session UUIDs, authenticated role/audience, explicit non-anonymous status,
configured issuer, expiry and not-before are checked before returning the client.

The same JWT is set as the client's Authorization header and supplied explicitly to getClaims.
Only a verified ordinary-user credential result exposes that client. Native auth persistence,
automatic refresh and URL session detection are disabled; there is no Cookie reader/writer.

This internal credential result is NOT NativeActorContext, a current mobile epoch, RLS acceptance
or atomic write permission. Signature verification cannot prove logout, account deletion or a
second-phone replacement has invalidated the session. It must not be used as a route's authority.
`createNativeUserDataAdapter` reuses the existing data-operation implementation but its actor
gate always returns UNAUTHENTICATED until the authoritative mobile-session protocol exists.
No allow=true callback or unverified epoch parameter can activate it.

## Web compatibility

`createUserDataAdapter` still defaults to the existing server-owned public configuration and
Cookie-backed SSR client. Its getClaims authentication, data queries/RPCs and queued response
Cookie writes stay on that same client. Any Authorization header is rejected and Cookie reads
are suppressed for that request, preventing invalid-Bearer-to-Cookie fallback. This changes
ambiguous mixed requests to rejection; normal Cookie-only Web requests retain their behavior.

The two factories accept an optional explicit server-owned public configuration for isolated
synthetic tests. Existing production callers still use their unchanged default configuration;
no HTTP input selects project URLs or keys. Tests do not read or write environment variables,
real environment files, keys, account material or configuration.

`isSameOriginMutation` and all existing routes are unchanged. A Bearer header cannot exempt a
missing or hostile Origin; legitimate Web Origin behavior and Cookie refresh/writeback are
covered by behavioral regression tests. Native clients still have no usable data endpoint.

## Evidence and remaining gates

Tests use ephemeral ES256 keys/JWTs and the real pinned SDK. A process-local fetch interception
answers only a fresh `.invalid` project origin and rejects unexpected paths/targets. Node test
files are process-isolated, tests within each file are sequential, and test-context cleanup
restores fetch even on failure. The concurrent two-identity test shares only its own synthetic
transport and proves separate JWT headers; it is not cross-user database/RLS evidence.

The positive query/RPC probes use the verified client's actual request builder but return
synthetic empty responses. Separate tests prove the public native data adapter remains closed,
while a valid Web Cookie can authenticate/query and an expired synthetic Web session can refresh
and queue Set-Cookie via the existing adapter. No actual Auth, database or provider was called.

The first-party [Supabase getClaims documentation](https://supabase.com/docs/reference/javascript/auth-getclaims)
and pinned `@supabase/auth-js` source were checked on 2026-09-10; implementations remain
`@supabase/supabase-js` 2.112.4 / `@supabase/ssr` 0.12.5 without dependency changes.

Real iOS→API→RLS owner/other-user checks, mobile epoch producer/consumer and atomic enforcement,
login/refresh/logout/second-phone behavior, Web coexistence, Keychain/cache/push binding, upstream
#188/#189 runtime acceptance, required CI and independent review remain gates. See
`artifacts/VPJ-04/unrun.md`. Revert only this slice; no migration, database or configuration rollback.
