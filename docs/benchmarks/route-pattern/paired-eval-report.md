# RoutePattern paired spike report

## Method

The paired evaluation is deliberately synthetic because no rights-cleared corpus exists. The same
invented two-stop order is evaluated as the POI/Fact/Guide baseline and as a RoutePattern candidate.
Both paths are passed through the existing deterministic ConstraintEngine with opening and transfer
evidence requirements. This is a guardrail evaluation, not a retrieval-quality claim.

| Stratum | Baseline final state | RoutePattern candidate final state | Required current evidence | Result |
| --- | --- | --- | --- | --- |
| spatial/temporal, transfer unknown | `needs_evidence` | `needs_evidence` | route matrix transfer | no gain |
| temporal, POI currently closed | `reject` | `reject` | current opening Fact | no bypass |
| rights/source admission | not applicable | not applicable | reviewed source receipt | candidate excluded |

The executable fixtures assert the first two rows and the paired no-gain conclusion in
`evals/route-pattern/route-pattern-spike.evals.test.ts`. They use no retrieval service, model,
database or network.

## Result

There is no empirical gain over the baseline and no authorised runtime corpus. The spike therefore
does not meet the adoption trigger in the framework matrix. It neither measures nor claims MRR,
nDCG, live route quality, city coverage, provider freshness or user benefit.
