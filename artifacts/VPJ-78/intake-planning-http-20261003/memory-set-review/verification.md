# Main review fix: Memory reference set qualification

2026-10-03. Parent checkpoint47fa60b0bdaa549ee5a9b643017b118cc2954cd6 had an HTTP-only current qualification defect: JSON array comparison preserved Memory order and UUID case, whereas frozen SQL624 canonicalizes the UUID/revision set. Earlier parent evidence remains evidence for that exact source, not proof of this fixed behavior.

## Bounded correction

Only memoryBasis compares lowercase canonical UUID/revision pairs sorted by UUID. Closed ref shape, numeric revision bounds, ≤3 refs and uniqueness remain; canonical UUID duplicates are rejected. Other intake arrays retain order. No SQL/result/source/policy/session/receipt/route gate or registry change. Original client JSON is forwarded to the single ordinary RPC; SQL owns admission/idempotency normalization.

## Observations

- RED reproduced against the parent47fa module with newly added focused adversarial cases: reversed and uppercase refs wrongly current=false; case-equivalent duplicate input incorrectly admitted by the parser. red.log.gz is the old-module/new-test diagnostic, not old acceptance evidence.
- PASS security40/40,0skip: new set order/case/current and duplicate/missing/wrong revision cases; ordered interests remain significant. `node --experimental-strip-types --test tests/security/turn/native-planning-intake-http.test.mjs`.
- PASS actual Auth→HTTP→SQL1/1,0skip: two real ordinary-owner Memory refs, reversed fresh201/currenttrue, case-variant fresh201/currenttrue; same immutable key reordered/case-variant200/reused/currenttrue with unchanged IDs/digests/row counts. Wrong revision and missing set409 without writes; normalized duplicate400. `node tests/integration/turn/run-planning-intake-http.mjs`.
- Actual project vp-native-ask-cc550fea, API64751/DB64741; current checkout migrations; owned cleanupPASS; no provider/cost/Trip writes.
- PASS typecheck, source lint, docs and staged diff. Parent build/result PG/other matrix evidence is retained at parent47fa and not rerun for this HTTP comparison-only fix; no SQL/result changes.
- UNRUN formal integrated CI, native/device/target/provider/user acceptance. Execution flags remain false. Main must review the new frozen commit before choosing native integration head.

Logs in this subdirectory apply to this correction only; original parent evidence files remain unchanged.
