# VPJ-79 Web comparison basis — 2026-10-02

Implementation/check base: `9655c3e82c9f5e6241dfc6c19277fe773530cb1f`. Rebased before PR onto `808870766fda33a7f5335a5a13e2fc0af4d0f885`; intervening #600 changes only Translation and do not overlap this slice. Existing browser/build evidence is reused; applicable CI runs on the final head.
Branch: `codex/vpj79-web-result-basis-20261002`. Related to #560; parent acceptance remains open.

## Delivered scope

The readonly comparison exposes a native expandable basis region in Chinese and English. It uses only the exact already-authorized result receipt. Saved Trip version and request sequence are recorded associations; Memory entries show reference count and revision numbers. Zero references means no recorded reference. The record does not supply request text, Memory contents, their influence, external evidence, search verification or real-time freshness. Currentness describes the access/source-version checks at this read only.

Goal version, task-turn ID, artifact identity/revision and revision creation time are inside a second folded region. UUIDs are absent from the main display. The basis derives from the same result object/body gate, with no independent fetch or retained explanation state.

No server/auth/SQL/public parser/native changes; no new provider calls or action controls.

## Local checks — PASS

- Focused contract: `node --experimental-strip-types --test tests/contract/artifacts/comparison-basis.test.ts` — 1/1; both locales, zero/two Memory references, exact recorded versions, explicit unknowns, no inferred labels from IDs.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- `node --experimental-strip-types tests/integration/identity/run-native-io.mjs --same-trip` — 2/2. Disposable local Postgres/Auth/Next and ordinary Web cookies; desktop 1280×900/mobile 390×844. The dedicated browser checks cover keyboard expansion, hidden identity, Chinese/English zero references, synthetic response with two references v1/v4, empty evidence, expiry clearing, empty/401 clearing, unknown schema and late navigation clearing. The two-reference response is a UI mock; it is not database/provider evidence.
- In-app Browser visual QA with a separate disposable local synthetic account: Chinese mobile actual stored one-reference result; English desktop actual stored zero-reference result. Real local source-consent withdrawal followed by refresh cleared body and explanation. No horizontal overflow or console errors observed. Temporary users, server, database and credentials cleaned up.

Screenshots: [Chinese mobile](mobile-zh.png), [English desktop](desktop-en.png). They show synthetic local data, not target-environment acceptance.

## Remaining acceptance — UNRUN

Real Staging, provider, device, production and whole-ticket #560 acceptance are not established by this slice. No target-environment write, deployment or payment was performed. PR review/merge belongs to the main coordinator; CI is reported separately on the PR.
