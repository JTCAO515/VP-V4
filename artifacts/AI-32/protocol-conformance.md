# AI-32 REALTIME-00 protocol conformance

## Frozen boundary

`lib/server/media-translation/realtime/protocol.ts` is a pure, fixture-only protocol boundary.
It neither receives raw audio/transcripts/SDP nor creates a network connection, reads credentials,
or persists a session. Real session creation returns the truthful `realtime_unavailable` result
until a separately accepted server authorization, short-lived issuance, region, and provider
adapter implementation exists.

## Observed deterministic fixtures

| Fixture | Ordered normalized states | Terminal state | Coverage |
| --- | --- | --- | --- |
| `five-locale-finished` | `opened -> tentative -> confirmed -> finished` | `finished` only | `zh`, `en`, `es`, `ru`, `ar`; fixture entity and number exactness; latency/cost not measured |
| `disconnect-cancelled` | `opened -> tentative -> cancelled` | `cancelled` only | disconnect semantics only |

`tentative` and `confirmed` are explicitly non-terminal. Reconnection has no resume path and
requires a new server authorization. The executed contract suite recorded 120 passing tests and
the security suite recorded 51 passing tests with one pre-existing local-Supabase test skipped
because no local Supabase instance was running.

## Rollback

Delete `lib/server/media-translation/realtime/protocol.ts` and its AI-32 tests. No route,
credential, persistence, or provider state is introduced.
