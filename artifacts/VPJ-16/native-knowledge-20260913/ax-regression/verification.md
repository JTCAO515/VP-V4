# Ask preview accessibility regression — FAIL retained

Native CI34706592620 at PR339 head7bfc13d failed two existing full-accessibility tests. Unsigned build and ad-hoc test build passed. The light failure names the third suggestion at y730.3; screenshots show it behind the bottom composer. Dark also reports contrast. Full CI/xcresults remain in the private native-knowledge-merge-20260913 cache; selected evidence is here.

Three isolated experiments did not resolve the full audit:
1. Separate ScrollView/composer VStack with clipping: two full audits FAIL.
2. Explicit viewport-based accessibility visibility: two full audits FAIL, light returned a nil element.
3. LazyVStack with separate prompt rows: two full audits FAIL, third prompt at y772.3; a new bilingual scroll-and-open regression PASS.

All experimental product/test edits were reverted. No issue filtering, hidden user content or weakened audit was retained. These results do not establish a verified product fix or conclusively identify a framework defect. Related prior diagnostics: artifacts/VPJ-01/native-acceptance/ios17-diagnostics/README.md. Those earlier failures remain unchanged.

PR339 remains unmerged. Its actual native Staging knowledge observation and two opted-in reader UI passes remain scoped evidence; they do not clear this full CI gate. The independent reviewed-selection preparation PR340 merged657d882 after Quality34707359480 and Preview PASS; its production build attempt was CANCELED and aliases/staging were preserved. #206 runtime grounding remains incomplete.
