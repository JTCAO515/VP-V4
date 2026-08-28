# RoutePattern candidate schema and applicability

## Frozen candidate shape

```ts
type RoutePattern = Readonly<{
  id: string;
  cityId: string;
  poiIds: readonly string[];
  typicalOrder: readonly string[];
  durationRangeMinutes: readonly [number, number];
  transferProfile: "unknown" | "walkable";
  applicability: Readonly<{ season: string; pace: string; partySize: number }>;
  sourceReceipts: readonly string[];
  reviewedAt: string;
  expiresAt?: string;
}>;
```

It is a retrieval candidate for visit order only. It cannot assert current transfer duration,
opening, reservation, price, availability, safety, booking or final feasibility. It carries no raw
trajectory, actor ID, device/location identifier, prompt, provider payload or Trip state.

## Admission and use

Admission requires non-empty canonical POI IDs, one current reviewed source receipt, city match,
an explicit applicability match, RFC3339 review time, and a non-expired source. Retrieval remains
POI/Fact/Guide hybrid retrieval; GraphRAG is not a baseline or fallback.

If a candidate is ever admitted after a separate decision, its only permitted flow is:

```text
retrieve applicable RoutePattern -> project candidate order -> current route matrix / Fact checks
-> ConstraintEngine -> explain tradeoffs -> pending Proposal
```

An absent, expired or inapplicable candidate is ignored. Missing current evidence produces
`unknown`/`needs_evidence`; a current hard violation produces `infeasible`/`reject`. No pattern can
write a Trip or override the frozen Travel Constraints v1 contract.
