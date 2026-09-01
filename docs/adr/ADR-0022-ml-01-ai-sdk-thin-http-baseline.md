# ADR-0022: Retain thin HTTP adapters pending ML-01 evidence

Status: accepted as a fail-closed baseline. Renumbered from the duplicate `ADR-0019` identifier on
2026-09-01; the decision itself is unchanged.

## Decision

Do not adopt Vercel AI SDK in the Chat plane until all five ML-01 conformance conditions are
independently proven. Keep SDK types outside domain contracts and retain thin HTTP adapters.

## Consequences

There is no SDK package, telemetry, provider call, bundle claim or latency claim in this decision.
A future operator-approved spike must prove text, vision, strict tools, abort/usage and
content-free telemetry together; failure of any condition retains this baseline.
