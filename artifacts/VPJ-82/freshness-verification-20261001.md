# VPJ-82 result freshness and recovery fix — 2026-10-01

Base: `27c45b054879c0c57adc75cf6e920327b6bd00da`. Related to #563; this is a bounded bug fix, not full issue acceptance.

## Defects and behavior

The Library detail displayed “Refresh” after its 30-second authority expired, but exposed no refresh action. It now has a bilingual accessible refresh button. Refresh first clears the previous read, then requests the same artifact ID and revision; it cannot fall back to another or latest result. Scope/background/disappearance invalidation is retained.

The shared native result store previously started its 30-second lifetime when the response arrived, granting a slow or delayed response a fresh full lifetime. The deadline now starts before the reference/content read. A response at or after 30 seconds is rejected; a response arriving at 29 seconds has only one second left. An injected monotonic clock makes those boundaries testable without sleeping. Existing exact revision/currentness and account/generation checks remain.

## Validation

- PASS: XcodeBuildMCP `test_sim`, isolated iPhone 17 Pro iOS 26.5 (`99CF3071-CFCD-46D4-80EF-D20076E33D2C`), NativeKnowledgeTests and AppShellUITests/testFourTabShellRoutesAndFallback: **21 passed, 0 failed, 0 skipped**. Includes the new delayed-response/expiry/same-reference-retry regression, existing changed/revoked/late-account-result cases, and zh/en shell routes/fallback. Build emitted one existing AccessibilityContrastTests UITraitCollection deprecation warning.
- Result bundle: `/Users/jtsm5p/Library/Developer/XcodeBuildMCP/workspaces/Codex-64a03d9ff053/result-bundles/test_sim_2026-10-01T15-25-56-813Z_pid36637_4efbcc42.xcresult`.
- PASS: `pnpm docs:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:contract` (**698/698**), `git diff --check`.
- UNRUN: authenticated Staging/physical-device result-detail refresh, physical VoiceOver, full materials/global-search acceptance. The shell test is signed-out local UI evidence, and result fixtures are synthetic unit evidence.

Rollback: revert this native-only change. No backend API, migration, provider, or existing user data was changed. #563 remains open until its full acceptance is met.
