# Place v7 regression completed; paused at user request

**This window: 85/85 PASS. Combined frozen plan: 132/132 expected outcomes, 26 place + 106 legacy.** Runtime `2f7664222c316f1fca4582e497d743f17ea6e747`, prompt v7/digest `4b810e4e36f2c3d4ffc3693b39eb50235462686beff48146f20612bacc3b6bf6`, unchanged API/UI `e19bd584ba86604047c9216e50c5329e8881dcf8`.

This window ran 2026-09-13T23:15:14.396Z–23:48:15.061Z, session12742 terminal. No transport error or session recovery occurred. It used only original legacy.slice(21); the already paid sim-documents-en turn was recovered by normal API/foreign-owner reads without a new model call. Previous case46 was recovered the same way in the prior continuation. Original failed controllers and diagnostics remain unchanged; no semantic reroll.

## Result and accounting

- All132 cases match the original frozen expectations, with unique Turn IDs and model attempt IDs. Two recovered reads add zero model calls. Combined-accounting binds all three run hashes and exact case order.
- This window85 calls/1383882 CNY micros; combined132 calls/2158206 CNY micros. These are configured tariff calculations; supplier invoice unknown.
- Database attempts406→491 this window; combined359→491. Unresolved0. Users6/Trips3/migrations48 and original row hashes preserved.
- Reader/Ops/members closed, normal native/cookie logout acknowledged, both owned mobile-session pointers null. WAF98 restores baseline96 configuration. No production release.
- Final read-only SQL verifies every one of132 work records against its expected outcome, with all leases cleared.84 work records are completed;48 expected unsupported/blocked results map to public unavailable and internal failed under existing migrations. The first verifier incorrectly required every work record to be completed; that assertion and observation are retained. The corrected verifier checks each exact expected state, not merely any terminal state.
- Native CI34788077423 on359d6f2 PASS, as are Quality/Budget. Later commits contain evidence/control scripts only; final-head CI will be needed after pushing them.

## Scope and pause

Controlled private Staging fixtures are not real venue information. Prior native/Web observations apply only to unchanged API/UI and their original scope. Native revoked-English and continuous on-screen expiry were not separately observed. This completes this regression slice, not full S2, physical-device acceptance or Production release.

The user requested a pause after this round. No further regression, implementation or merge is started. Final evidence is retained locally; resume from the paused handoff when requested. Earlier transport failures remain unexplained; this successful run does not establish their root cause.
