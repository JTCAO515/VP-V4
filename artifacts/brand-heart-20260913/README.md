# Heart Logo replacement verification

Scope: upload four operator-requested 8K source PNGs, document provenance, replace Web/native logo references and platform derivatives. Historical source files remain available. Rollback: revert this change.

PASS: source-policy lint, docs check, asset-policy check, TypeScript, Next.js build, existing tests 22/22, browser tests 7/7 including 390×844 and desktop viewport matrix, generic iOS Simulator build with signing disabled, source/runtime PNG alpha checks, git diff whitespace check.

Initial check reused an old dependency directory missing @supabase/ssr; replaced it with a frozen-lockfile install in this isolated checkout and reran successfully. An existing accessibility-name test expected the previous name without a period; updated it for VisePanda. and all 22 tests passed.

UNRUN: physical-device/VoiceOver/App Store acceptance and production deployment. Browser tests validate layout/interactions; they do not establish every small-size logo detail or color contrast. 8K is enhanced/resampled raster, not native 8K or vector.

Local logs are included. GitHub CI is evaluated after push; these local results do not claim CI has already passed.
