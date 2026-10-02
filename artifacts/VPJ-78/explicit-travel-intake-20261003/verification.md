# VPJ-78 explicit travel intake checkpoint

2026-10-03, baseline80fa7862. Contract approved by Main; migration20261002200000 and ports64720 owned exclusively. Reviewable implementation snapshot, not merged/target activation or full #559 acceptance.

## Implemented seam

Ordinary native Bearer submit/read/write-basis. Immutable full explicit projection versions are atomic with the existing goal/message writer; old API/signatures remain. Full replacement requires every field, null clears to unknown, multiple explicit changes are allowed, no silent merge. Selected Memory references bind exact eligible owner/revision/consent/receipt; no Memory text is copied or inferred into fields. Current SQL digest binds the exact projection/source/versions/context references. Same immutable retry returns a minimal receipt; historical retries do not return current digest/content. readyForProvider is always false.

GET top-level stale/unrecorded has only four frozen keys. Blocked403, session401, malformed/unknown dependency503. Qualified readiness distinguishes required city/target/budget questions, traffic screening with unknown budget, unsupported city/no fallback and unavailable budget filtering. unknown uses the exact camelCase projection field set.

Independent write-basis returns only qualified text-domain current CAS metadata. Memory withdrawal can leave text metadata readable; complete new explicit input + [] may recover without reviving old Memory. A token is never trusted at submit time. Two reads cannot mix generations; final native session is checked on every authenticated return.

## Actual local checks

PASS real disposable Auth→HTTP→migratedSQL1/1, zero skip: initial waiting; full correction preserves untouched selected values; null/multiple fields; immutable idempotency/conflicts/historical receipt; typed Memory failure rolls back admitted message/current_text/goal version/sequence; concurrent same-basis corrections one201/one409; unknown budget transport ready, budget filter waiting/unavailable, unsupported city unavailable. Exact Memory state/revision change and withdrawal invalidate basis. Real first RPC response followed by ordinary Memory transition makes second read stale with no content. Real first write-basis response followed by ordinary goal amendment returns409 without mixed metadata. write-basis recovery with full input/[] works, stale CAS/cross actor/text withdrawal/replaced session fail closed. Trip-link scope ahead of parent's historical scope is accepted through unchanged legacy rules and a new typed amendment; referenced synthetic Trip stays v0 with no Patch. Zero work rows/model calls. Exact conversation deletion cascades typed rows; new service-only export is bounded and ordinary roles/direct-table reads denied.

PASS strict HTTP/security29/29, zero skip: unavailable closed shape, unknown/malformed/extra fields503, first/second blocked403, actual final-session failure, POST qualification, closed projection and readiness cross checks, write-basis closed fields/generation conflict. PASS full applicable local Supabase RLS/function EXECUTE lane23/23, zero skips; only three new authenticated signatures were added, private helpers have no API execute grants. PASS lint/typecheck/docs/syntax/diff and integration classification.

Earlier FAILs retained: validator CASE syntax failed startup (fixed with bounded PG parser diagnostic); fixture attempted using createMemory on an existing ID and correctly got MEMORY_ID_REUSE (fixture changed to the existing state-transition revision lifecycle). Neither is counted as business acceptance. Every owned disposable stack/temporary port is cleaned by its runner.

## Limits and handoff

UNRUN publisher/planning reader consumption, same-Task continuation/cost reuse, native UI, real provider, shared target/Staging/Production and full #559. The additive service export seam does not complete an account export request or change the existing executor; Main must coordinate its module consumption. No general auth rewrite, applied migration edit, Task/Turn scheduling, budget reset, Memory save or Trip confirmation was introduced.

Files: new contract, migration, HTTP module/two routes, independent runner/AuthSQL test/security test; shared hunks only authenticated ACL additions and one end-of-lane registration. Main reviews this fixed source then coordinates local native integration. New final union CI remains required; local evidence is not release proof.
