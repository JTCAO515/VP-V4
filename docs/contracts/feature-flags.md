# Feature flags v1

Status: implemented registry and CI contract; runtime consumers remain owned by their feature Issues.

AI-45 registers only the R1 release-slice flags. It does not enable Chat, prove a deployed kill-switch,
or replace verified user JWT, server authorization, or RLS. Defaults deny capability, and the flag API
returns only capability availability; authorization is deliberately absent from the interface.

| Flag | Owner | Default | Dependencies | Kill-switch result | Observation | Delete by |
| --- | --- | --- | --- | --- | --- | --- |
| `TRIP_PERSISTENCE_ENABLED` | TripWorkspace / AI-10 | `false` | none | Trip persistence is unavailable before any Trip write. | Decision returns `flag_disabled`. | 2026-12-31 |
| `CHAT_RUNTIME_ENABLED` | TurnCoordinator / AI-12 | `false` | `TRIP_PERSISTENCE_ENABLED` | Chat runtime is unavailable before a Turn starts. | Decision returns `flag_disabled`. | 2026-12-31 |

Current R1 rollback references map to the registry as follows:

| Issue | Registered rollback flag |
| --- | --- |
| #12 AI-10 TripWorkspace | `TRIP_PERSISTENCE_ENABLED` |
| #14 AI-12 TurnCoordinator | `CHAT_RUNTIME_ENABLED` |
| #15 AI-13 Canvas end-to-end | `CHAT_RUNTIME_ENABLED`, `TRIP_PERSISTENCE_ENABLED` |
| #17 AI-15 R1 release gate | `CHAT_RUNTIME_ENABLED`, `TRIP_PERSISTENCE_ENABLED` |

`CHAT_RUNTIME_ENABLED=true` with `TRIP_PERSISTENCE_ENABLED=false` is illegal. `pnpm check:flags`
validates complete metadata, default state, environment boolean syntax, dependencies, and the active
combination. `pnpm test:unit` proves the illegal combination and default-off decisions.

Owning consumer Issues must call the flag decision before the capability starts, retain their existing
JWT/RLS checks, add runtime negative evidence, and remove the temporary flag by its deletion date. Until
that consumer evidence exists, the entries are release contracts rather than proof of deployed gating.
Future R2-R5 Issues must add only their release-slice flag and metadata when they become executable; their
generic rollback language is planned and is not evidence of a working kill-switch today.
