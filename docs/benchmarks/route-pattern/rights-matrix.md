# RoutePattern source-rights matrix

## Decision

This spike has no reviewed, licensed RoutePattern or trajectory corpus. It therefore uses only the
self-authored synthetic fixture in `evals/route-pattern/route-pattern-spike.evals.test.ts`, which
is evaluation-only and `runtimeEligible: false`. No third-party route, trajectory, POI, location,
user, device or provider data is copied, cached, embedded, displayed or sent to a model.

| Candidate source | Rights evidence | Data used | Allowed purpose | Runtime eligible | Decision |
| --- | --- | --- | --- | --- | --- |
| Self-authored synthetic two-stop fixture | Repository authorship; no external data | invented IDs and timestamps only | deterministic contract evaluation | no | retain for test only |
| TP-RAG / RoutePattern background literature | no corpus licence or distribution grant | none | background context only | no | do not ingest |
| External route/trajectory corpus | no approved source, licence, retention or deletion terms | none | none | no | reject |

## Rights gate

Before a new spike can use a non-synthetic source, the repository must contain a reviewed source
receipt identifying the source, permitted fields, licence/DPA basis, city and temporal coverage,
retention/deletion terms, attribution/display restrictions and revocation path. A paper or search
result is not such a receipt. The attempted anonymous source lookup for this spike did not provide
verifiable source-rights material; see `artifacts/V4-05/unrun.md`.

This matrix is a rejection record, not a declaration that any external provider is unavailable or
unsuitable.
