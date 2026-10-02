# Trip → current Proposal reference discovery / 1

Related to #560. Native entry prerequisite; no consumer UI or Proposal action is introduced.

- RPC: authenticated `read_trip_change_proposal_reference_v1(p_trip_id uuid)`.
- GET: `/api/results/native/v1/change-proposal-reference/trip?tripId=UUID`; only this single parameter is accepted, canonicalized to lowercase. Existing native credential/session checks and `private, no-store` apply. Malformed session/response is 503; explicit authority loss or valid identity mismatch is 401.
- Success: `{version:1,data:{kind:"result_reference",tripId:UUID,artifactId:UUID,revision:1..1000}}`, exactly four data fields. No title, body, patch, digest, confirm payload, URL or action.
- No current matching owned reference (including unknown/foreign Trip or archived Trip): `{version:1,data:{kind:"empty"}}`. Queued Trip deletion or an unexamined candidate beyond the bound: `unavailable`. RPC/transport/malformed-data failures are 503 `RESULT_UNAVAILABLE` with no pointer.

The reader examines active saved Proposal-reference artifacts for this actor/Trip in `created_at DESC,id DESC` order. It checks at most 64 candidates through the already-merged exact `read_change_proposal_reference_v1` authority. A 65th row is a sentinel, not inspected content: return unavailable rather than falsely claiming empty. A newer stale/superseded reference does not hide an older eligible reference within the bound. Comparison artifacts are never candidates or fallback.

After discovery, the consumer opens the returned exact ID/revision through the existing GET `/api/results/native/v1/change-proposal-reference?artifactId=UUID&revision=N`. That open rechecks Proposal revision/status/expiry, Trip/base, actor, goal/Task/input/Memory/consent and withdrawal/deletion. A captured discovery pointer establishes eligibility only at that read; subsequent revision/rejection may make opening unavailable.

No writer permission is added. The new partial index supports bounded owned-Trip discovery; the exact reader and canonical Proposal/Trip functions are unchanged. SQL is append-only `20261002130000`.

Local evidence: [verification](../../artifacts/VPJ-79/proposal-reference-discovery-20261002/verification.md). Real producer/native consumer/Staging/provider/device/production and whole #560 acceptance remain UNRUN.
