# AGENT-013 current canonical Trip inventory

Owned implementation for #264; not whole H1–H5 acceptance. QA base `5e960e6d4dd4b1050b23622a4dc6ed57653f4b57`; owner branch `codex/trip-inventory-20261016`, WT `/Users/jtsm5p/Documents/Codex/VP-V10-worktrees/trip-inventory-20261016`. Official chat `01a14273-6b85-7f51-a710-fc33b5b065b2`, actual VP-V10 project `4f2191db-3e04-4042-94b5-ec94ff67b427`. Main remains sole scheduler/shared/CI/merge writer. Effective model/effort/tier were not exposed: UNKNOWN; no configuration change.

First implementation commit `761c9037`: closed DTO/digest, bound exact-count reader, contract and meaningful negatives. `5b9682ce`: derived-owner SQL filter and per-row owner validation. `01edd7a8`: actual canonical detachment before subsequent await. `7a77cd6f`: HTTP handler and complete H04 consumer. `983a2047`: actual PG/SDK/wire pipeline, strict final-origin fence and consumer refinements. Final test-only refinements add unordered headers and correctly hashed foreign-owner before, plus aborted-before NOT_RUN assertion.

Main's factory commit `eccad32a447e90565b7d8776d1fb3de0c5f8cb2c` was cherry-picked as `569e27ae`; Main route `6d59adc7` as `805ad111`. These are the only shared changes and were authored by Main; owner did not edit them. Route-inclusive targeted TSC passed on combined source after `805ad111`. The actual HTTP handler was executed through a real local HTTP listener; direct Next route runtime boot/build was not run.

## Observed PASS

- 45/45 contract/security tests, zero skips: 25 new inventory cases plus 20 original runtime-ask regression cases. Log `contract-security.log`. Includes exact zero/null/truncated count, cap, unordered/duplicate/invalid headers, canonical tuple mismatch, title/version/updatedAt/set race, closed fields/hash/size, source detachment, correctly hashed foreign-owner inventory, owner/session/epoch changes, before failure zero submit, original IDs/key, unknown ACK no second submit, shared limits, hung/late response/body, deadline/abort and cross-origin/redirect refusal. Controlled transports are not runtime evidence.
- Actual private PG17 pipeline: 8/8 test entries, zero skips (seven children plus parent), log `postgres.log`. Existing fixed-source manifest verified 161 migrations, checkpoint `441e51dc210b2a678fcd5f6d5f9aa638f0c5020b`. PostgreSQL 17.11, nonce directory, no TCP, socket permissions 0700. Only the test's own process was stopped and its temporary cluster removed.
- Actual new HTTP / original Native credentials, `authenticated()` and `getTrip` / Supabase SDK / ordinary `authenticated` SQL and RLS. Two owners each see their canonical initial Trip; foreign getTrip is FORBIDDEN. Real exact-zero and three-Trip complete reads; null count/truncated rows, set race and mobile session revocation fail closed. Cookie/Origin/query/POST, modified token and wrong role reject without Trip disclosure.
- Consumer composition obtains before/after inventory and original Native session via actual HTTP/SDK/ordinary SQL, around controlled `runRuntimeAsk`. One controlled submit, unchanged task-table count, no actual admission or model. Raw canonical text is absent from reports; source authentication and final acceptance remain unknown/NOT_RUN.
- All table/function ACL fingerprints unchanged. No new SQL function, GRANT, migration or private-source permission. Original three-draft capacity really refuses a fourth draft; no fixture bypass to force nine current drafts. Eight-cap overflow is a contract test, not claimed as a PG state.
- Route-inclusive targeted strict TypeScript: `node_modules/.bin/tsc -p artifacts/AGENT-013/trip-inventory-20261016/tsconfig.json`. Source policy lint, docs check and diff whitespace passed. Existing root aliases are handled by the scoped config; no lock/dependency/global config changes.

PG command: `TRIP_INVENTORY_NATIVE_PG=1 VP_WIKI_PG_BIN=/opt/homebrew/opt/postgresql@17/bin VP_WIKI_PG_MODULE=/Users/jtsm5p/Documents/Codex/2026-10-13/v10-main/agent008-pg-client-20261015/node_modules/pg/lib/index.js node --experimental-strip-types --test tests/integration/trip-inventory/postgres.test.mjs`.

## Retained failures and corrections

- Initial narrow TSC omitted repository aliases and failed imports; scoped config extends original tsconfig. Before Main hook arrived, HTTP correctly failed missing getTripInventory; hooked source now passes. Test typings were corrected without changing runtime assertions.
- Identity-negative test first showed Ask's session failure followed by fresh after could still compare unchanged. Consumer now keeps any unknown/failed Ask comparison unknown; test passes.
- Main found the intermediate detached clone was discarded. Reader now actually detaches at acceptance; later source mutation cannot alter reported old-head content. Regression test passes.
- First PG fixture tried nine drafts and got original TRIP_CAPACITY. It now verifies original three-draft limit and three-element complete inventory without modifying that invariant.
- Initial synthetic wire omitted Supabase API-version header and classified modified-token failure as 503. Match to original fixed C0 adapter corrected it; now original SDK rejection is 401.
- Consumer pipeline initially returned an HTTP loopback Response for its explicit HTTPS logical origin, correctly rejected by transport. Fixture now explicitly reconstructs a no-source-URL synthetic response in the named bridge. Production origin checks were strengthened, never loosened; this bridge cannot attest source.
- Artifact growth with default origin/main merge-base failed 9.08MiB due to pre-existing QA history. The task comparison uses exact QA base via existing VP_CI_BASE/HEAD; threshold and historical artifacts remain unchanged.

## Scope and remaining evidence

An optimistic stable-head observation of currently owned, RLS-visible canonical Trips, at most eight, 262144 UTF8 response bytes, ten-second server lifetime. It is not physical/global/history inventory, no-instantaneous-write proof, or protection against privileged rollback restoring the same tuple. Original inaccessible/archived behavior stays authoritative. No new Trip writer, data authority, queue, grader, holdout or required-mode threshold.

Registered-token Auth/REST gateway and HTTPS-name/loopback bridge are synthetic, not managed Auth/JWT signature verification/PostgREST or source attestation. Real staging/provider/H04 execution, usage/attempt completeness, model consumption, target release, devices and TestFlight are UNRUN. Main owns CI registration, exact-head independent review, normal protected merge and issue disposition; #264 is not closed here.

Implementation is delivered. No in-flight tools, future source edits or new scope are planned after the final evidence commit; only an explicit same-scope defect return can resume this owner. Existing worktrees/resources remain intact. Sole temporary node_modules symlink points read-only at the existing approved dependency directory.
