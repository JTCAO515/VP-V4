# Complete current Trip observation for H04

`acquireH04TripInventory(input, transport, signal?)` validates an existing H04 `AskRun`, acquires an owner/session/mobileEpoch-fenced complete snapshot, invokes the existing `runRuntimeAsk` with its original IDs/submission, and reacquires the same coverage. A missing before means NOT_RUN and zero Ask dispatches. Errors or unknown Ask/session/after state produce unknown comparison. No new grader, key, task, retry, credential discovery or runtime activation is provided.

Compose the explicit authorized Native transport:

```ts
const transport = createNativeInventoryTransport({ allowedOrigin, authorizedFetch });
const report = await acquireH04TripInventory(existingH04Run, transport, abortSignal);
```

The allowed origin must be an exact HTTPS origin. The supplied fetch must already hold the ordinary Native identity authorization; this library never locates or refreshes credentials. Both transports request redirect:error and no-store, and reject redirected/cross-origin final responses. A caller returning a synthetic Response still supplies no source authentication or runtime attestation.

One monotonic deadline and global network accounting cover before/Ask/after. Existing Ask limits remain at most 20 seconds, 64 requests and 1MiB; before consumes the same budget and the inner driver is tightened to reserve after's three requests. Each reply remains at most the existing 262144 bytes. Chunk/read/empty-read caps, abort races and late-response fences apply to the actual wire replies, including Ask events. Global bytes include failed replies; no mutation is retried.

Only IDs, head versions, counts, canonical byte counts/digests and unknown/changed metadata appear in the report. Raw Trip content is in-memory only. `tripCollectionUnchanged` applies to optimistic owner-visible canonical snapshot endpoints, not instantaneous database invariance; see [contract](../../../docs/contracts/trip-inventory-v1.md). Original Ask's selected-Trip and grading fields remain unchanged. Origin authentication, context attestation, usage and attempt completeness remain unknown; required mode and final acceptance remain NOT_RUN.

Local verification uses controlled Ask transport. The PG test additionally takes before/after inventory and Native session through actual HTTP / original Supabase SDK / actual ordinary-role SQL and RLS, using a registered-token synthetic Auth/REST gateway. It does not run a model or actual H04 admission, and is not managed Auth/PostgREST, staging or production evidence.
