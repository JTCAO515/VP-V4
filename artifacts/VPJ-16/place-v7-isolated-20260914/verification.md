# Isolated place v7 Staging regression — incomplete

Runtime `2f7664222c316f1fca4582e497d743f17ea6e747`, prompt v7; unchanged API/UI `e19bd584ba86604047c9216e50c5329e8881dcf8` on dedicated Ops Preview. Frozen scenario: 26 place + 106 legacy cases. Willow Dawn Gallery is synthetic private Staging data.

- **FAIL / incomplete:** 46 calls, 45 fully matched cases (26 place + 19 legacy), 86 unrun. Case 46 `needs-meta-output-zh` completed with valid diagnostic but normal history fetch threw TypeError. Private transport details were suppressed. No semantic reroll.
- Read-only DB diagnosis confirms turn `58b60c3d-da75-4960-a2c6-e83ed0cf8075` persisted expected unsupported / unknown / blocked with empty unanswered needs. This is not a normal API read or a passed case.
- Unique settled usage receipts for all 46 calls; attempts 359→405, unresolved 0. Tariff 758052 CNY micros; supplier invoice unknown. Original rows, users 6 and Trips 3 preserved.
- Original controller closed reader/Ops/members and restored WAF 90, but three revoke readbacks failed. Inspection found two revoked and two still published.
- Cleanup-only recovery kept reader false and reused original revoke operation IDs through normal Ops API. Zero model calls. Final verification: all four revoked, only expected revoke fields changed, other original rows preserved, permissions closed, attempts 405/unresolved 0, WAF 92 equals baseline 90 configuration.
- Independent review of completed 26-place evidence and cleanup-window increment: each 0 Critical / 0 Important. Scope and hashes retained. Legacy completion pending.
- Native CI `34785363426` attempt 2 on `b82c8da` PASS; attempt 1 runner communication failure retained. Prior actual native/Web observations apply only to unchanged API/UI and their original scope. No new v7 native UI submission.

Next: preserve this failed run; verify the interrupted case through normal API and execute only the remaining 86 frozen legacy cases in a separately journaled bounded continuation. Do not repeat completed model calls or change the frozen runtime. Full S2 and Production acceptance remain incomplete.
