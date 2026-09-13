# Evidence lifecycle v3: behavior passed, cleanup recovered

Observed on dedicated Staging Preview `dpl_3DBuDovUeBcgkqck7woeHg3W1Xi8`, runtime `8e95279417a0a1147f7e81a5a857b0fbdb72d0de`, 46 migrations. Native built at `1218c76904cc6d085bf9cbd460dfe1babae594ea`; runtime-equivalence.json verifies unchanged native source. This PR adds regression tests, frozen scenarios and evidence; no runtime or migration change.

## Observed behavior

Four new English/Chinese tasks each used one real Qwen attempt. Existing saved answers were reread without generating replacements. All four stages passed native API and Web API observations, actual bilingual SwiftUI inspection and Web checks at 1365×900 and 390×844.

| Current evidence | Answers created before conflict | Answers created during conflict |
| --- | --- | --- |
| Current card and mobile support | answered: card + mobile | Not created yet |
| Conflicting mobile publication | partial: card only | partial: card only |
| Mobile conflict naturally expires | answered: original card + mobile return | partial: original mobile conflict gap retained |
| Card naturally expires | partial: original mobile only; card expired | no_answer: no facts; card expired and original mobile gap retained |

Card expiry was observed naturally at `2026-09-13T19:05:00.102Z`, before any revoke. Original saved outcomes remain answered/partial. No answer gains evidence that was absent from its saved completion. The unrelated earlier revoked publications do not contaminate the card's expiry reason.

`acceptance.json` links all four stages and task IDs. `native-ui-projections.json` verifies 14 displayed answer projections using ordered exact-question and fact matching; native UI does not expose the turn ID wrapper. API and Web carry explicit task IDs. Images and Web DOM records retain the current task displays; unrelated native history is omitted from the projection artifact.

## Failures and recovery retained

The original v3 `lifecycle.json.gz` remains **FAIL**: all business/UI stages passed, but automatic `revokeOwned` cleanup raised TypeError. Its cause was not captured precisely. Automatic logout, permission disable and WAF removal succeeded.

First targeted recovery also remains **FAIL**: normal Ops listing returned `fetch failed` before any revoke POST. Its normal logout, permission disable and WAF removal succeeded. The exact underlying transport cause is unknown. A separately reviewed second recovery allowed at most two read-only GET transport attempts and retained non-sensitive diagnostic codes. It succeeded on the first GET; both normal Ops revoke POSTs returned 200 once. No additional model call occurred in either recovery.

The recovery changed only the two owned publication states, versions and revoke timestamps; all other fields were verified unchanged. Independent permission/data review: 0 Critical / 0 Important after fixing an initially reported missing SIGINT/SIGTERM cleanup handler. Five focused retention checks passed, including foreign hash multiplicity and Trip isolation. See cleanup-recovery/review.json and publication-verification.json.

Three UI harness recoveries are recorded in ui-observation-recoveries.json. They reused the same tasks with no model calls. The failed instantaneous Chinese scroll AX payload was not retained, so that assertion's cause is unproven; the subsequent retained AX snapshot and successful capture confirm the expected two displayed outcomes. Earlier v1/v2 failures remain unchanged in their original artifact directories.

## Accounting and final state

Four attempts settled once; configured-price estimate 45,276 CNY micros (about ¥0.045), actual supplier billed cost unknown. Together with six earlier failed-run calls, this lifecycle slice consumed ten calls. The attempt audit was collected before natural expiry and records runOutcome STARTED; it is accounting evidence, not a terminal run pass. No model work occurred after that audit.

Final saved completion/Turn/work/text hashes match the pre-expiry snapshots for all four tasks. Original rows retained; the only baseline publication exceptions are the two explicitly verified owned revocations. Final state: 325 attempts, 0 unresolved, 6 users, 3 unchanged Trips, 46 migrations, reader/Ops disabled, 0 active members. Normal API/native/Web logout completed; owned Simulator shut down and test tab closed. Exact temporary host allowance removed, WAF version 80. No Production release.

## Validation and limits

Isolated PostgreSQL regression: 17/17 PASS, zero skips, including natural expiry, conflicts, immutable saved gaps and unrelated revoked evidence (v2 db-regression.tap). Frozen Ops input contracts: 3/3 PASS before v3 activation. Reuse these same-code checks; final CI is tracked on the PR.

This is an additional synthetic payment lifecycle case, not completion of #206/#264, full S2, original museum/ferry cases, physical/VoiceOver, provider-outage or source-injection acceptance. The executor has now read all four held-out Harness case definitions (H03/H06/H08/H12); subsequent work must not claim blind evaluation by this executor. No prompt tuning used these cases in this slice. Address/opening-hours integration remains next; next-frontier.json is readiness analysis only. Maps draft PR372 remains the sole independent preparation lane with no provider calls.
