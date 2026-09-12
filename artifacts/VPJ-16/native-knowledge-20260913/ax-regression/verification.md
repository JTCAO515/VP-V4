# Ask preview accessibility regression — FAIL retained

Native CI34706592620 at PR339 head7bfc13d failed two existing full-accessibility tests. Unsigned build and ad-hoc test build passed. The light failure names the third suggestion at y730.3; screenshots show it behind the bottom composer. Dark also reports contrast. Full CI/xcresults remain in the private native-knowledge-merge-20260913 cache; selected evidence is here.

Three isolated experiments did not resolve the full audit:
1. Separate ScrollView/composer VStack with clipping: two full audits FAIL.
2. Explicit viewport-based accessibility visibility: two full audits FAIL, light returned a nil element.
3. LazyVStack with separate prompt rows: two full audits FAIL, third prompt at y772.3; a new bilingual scroll-and-open regression PASS.

All experimental product/test edits were reverted. No issue filtering, hidden user content or weakened audit was retained. These results do not establish a verified product fix or conclusively identify a framework defect. Related prior diagnostics: artifacts/VPJ-01/native-acceptance/ios17-diagnostics/README.md. Those earlier failures remain unchanged.

A separate direction-picker experiment let the Ask audit pass but exposed the same offscreen contrast failure in Trip and a new Dynamic Type audit failure in the picker. This experiment and its test changes were also reverted; see directions-1.log.

The final minimal fix bounds BrandHeader's complete wordmark to36pt high while preserving its aspect ratio and156pt layout width. The new3:1 asset had expanded its height from about35.4pt to52pt, adding about16.6pt to both screen headers. Profile's separate wordmark keeps its existing sizing. No brand asset, navigation flow, font, color, accessibility visibility or test assertion was changed.

PASS: the original two full-accessibility tests on iOS26.5, covering Ask and Trip in en/zh and light/dark, after the header fit. See header-fit-1.log and after screenshots. This establishes the scoped layout regression fix; it does not waive prior iOS17.5, maximum-text contrast or physical VoiceOver gaps.

PR339 awaits fresh full CI. Its actual native Staging knowledge observation and two opted-in reader UI passes remain scoped evidence; they do not clear this full CI gate. The independent reviewed-selection preparation PR340 merged657d882 after Quality34707359480 and Preview PASS; its production build attempt was CANCELED and aliases/staging were preserved. #206 runtime grounding remains incomplete.
