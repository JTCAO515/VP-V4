# Trip Proposal-reference discovery — 2026-10-02

Related to #560; parent stays OPEN. Branch `codex/vpj79-proposal-reference-discovery-20261002`; implementation base `87f2522b3ca92cc285a75ab851b880c3d5dffb9b` (merged #615). Rebased without conflict onto `99fce5058668a7ee0f5411d1a03bce9a05bdec90`; latest main Journeys registry/ACL entries are preserved alongside this slice's unique additions. Effective local evidence is reused; final-head CI verifies the combined state.

## PASS — local disposable checks

- Dedicated real Auth/Next/Postgres + ACL: 11/11, no skips, prebound base63420 (API63451). Actual native-created Trip/pending Proposal and existing local synthetic source worker produce stored reference prerequisites. Discovery input contains only Trip ID; exact open uses the discovered ID/revision, not a fixture entry ID.
- Cross-owner/unknown Trip/no-reference/unauthenticated/closed input; no comparison fallback; newest saved reference, deterministic ID tie-break, current artifact revision; real canonical revision/rejection invalidates discovery and a previously captured exact-open pointer.
- 63 newer stale candidates + eligible64th returns the current pointer; 64 stale + eligible65th returns unavailable. All64 stale returns empty; 65 stale returns unavailable. Closed pointer/sentinel responses carry no body/action/cursor. Trip/title/head/events/confirmation receipt snapshots stay unchanged.
- In-memory signed-credential/transport safety: 2/2, malformed/extra/action/wrong-Trip responses fail closed; session shape/UUID/error classification blocks private discovery RPC when invalid. This is mock classification evidence, not real Auth acceptance.
- After the explicit artifactId string narrowing repair: standalone `pnpm typecheck` exit0, focused safety2/2 exit0, diff checks PASS. Earlier TS2345 was a real failure and is not replaced by an unrelated command's exit code. No unchanged SQL/Auth rerun after this HTTP narrowing fix.
- Lint/docs/build PASS; applicable CI is final-head evidence. All own synthetic users/services/Supabase stack cleaned up. No Simulator/native64220 use or cleanup of other owners.

## Scope and limits

Only discovery module/route, append-only migration/partial index, scoped tests/docs/evidence. Existing exact API/Proposal authority/comparison consumers/native/UI remain unchanged. Own registry/ACL additions preserve the main entries from other owners.

No new writer/model/confirm authority. No Proposal-confirm API call. The endpoint does not imply the Task generated the canonical Proposal, verify external facts, or establish future read eligibility. Native consumer, real target/provider/device/production/full #560 acceptance are UNRUN.
