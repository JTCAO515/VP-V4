# VPJ-01 Web release locale slice

Base: origin/main 589cee6; isolated branch codex/vpj-01-web-release-locales.
Related to VPJ-01 #188 and ADR-0023. No native PR dependency.

Implement zh/en discovery while retaining all five locale types, copy, metadata and payload parsing.
Add one shared selection helper; retain the active legacy option so native select never displays a wrong value.
Adjacent ownership: all 21 Web language picker consumers require the same helper; existing locale source
and browser assertions require migration to verify release discovery plus legacy compatibility separately.
ChatThreadWorkspace already reads query parameters and gains the existing parseLocale parser for its
initial locale, providing a real legacy URL entry for RTL regression after legacy picker discovery ends.
The adjacent app/visepanda/page.tsx metadata now uses the same initial locale, preventing late
Next metadata from overwriting the Arabic document title on a legacy URL. Ask redirect unchanged.
No native files, shared handoff, app/page.tsx, static-output.test.mjs, journey-preview.spec.mjs or assets edited.

Checks: lint, typecheck, build, affected source/contract/locale tests, real desktop and 390x844 browser
selection/legacy RTL checks, docs/diff checks. Required CI and independent review remain parent-owned.
This is repository/Web behavior acceptance only; VPJ-01 native/device/release gates remain open.
Rollback: revert this slice; no data or migration writes.
