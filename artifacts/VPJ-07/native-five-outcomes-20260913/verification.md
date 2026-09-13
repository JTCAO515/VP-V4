# S2 bilingual saved-outcome readback and viewport recheck notice

Related to #195/#196/#206; full S1–S6 remains incomplete.

## Baseline observed in Staging

2026-09-13, API/Web main `a9c8b5734e5389bf7e445ce5d78a232e721cdbbf`, dedicated Preview `dpl_6dzNDK79bd238S9jWAQZ8rj4AaCr`. Native source `2717bf947cf31edd3ce5021e7e361413859ad9b8` is unchanged in that main; the reused executable's unsigned Mach-O matched after API-origin configuration and signing. Staging schema 42. Existing controlled English/Chinese accounts logged in through normal UI. No Send, worker, provider request or Trip mutation was performed.

- Web: both owners' actual saved answered/partial/clarification/blocked/technical_failure results were read, retaining original question language, reliable facts, conditions and source disclosures. Original usage-recovery Turn `6069d41c-40eb-456c-99a1-970aaa69ad7d` displays cancelled rather than success. See compressed DOM snapshots and desktop/390px screenshots.
- Native: actual English partial/blocked/clarification and Chinese partial/blocked/clarification text was visible. `en-scan-8.png`, `en-scan-10.png`, and `zh-blocked-stable.png` were visually inspected. The latter also includes an additional-needs question explicitly left partially unanswered. Existing answered, repair/technical-failure and cancellation evidence remains valid for unchanged native code, under its original scope.
- `outcome-inventory.json` is the candidate task/Turn inventory, not a claim that every exact candidate was visible in a screenshot. Native scrolling also reached older real cases. Fast scan metadata alone is not visual acceptance: `zh-scan-7` was recorded as a failure marker but its screenshot showed a different answered card; do not use it as technical-failure screenshot proof.
- A real native UX defect was observed: at the evidence deadline, the history is correctly hidden while its layout remains, but the recheck notice sits at the top of the long content, outside the scrolled viewport. `zh-partial-stable.png` retains this blank-viewport failure. Its preceding AX snapshot is not proof of simultaneous visible facts.
- Web unsupported wording has no available-next-step text, unlike native's railway/station guidance. This remains a specific follow-up; no full #206 acceptance claim. Generic partial scope warnings also do not establish complete per-need gap explanations.

Cleanup passed at 02:02:46Z: reader/Ops false, active members zero, only this Preview host removed, WAF 40→41→42, browser owners and native owners logged out, browser tab closed and viewport reset. Simulator was retained exclusively for the immediately following local fix validation. After snapshot: 74 controlled Turns, 74 provider attempts, 342228 CNY micros, zero unresolved; six users, three Trips, 42 migrations unchanged. No invoice/customer-charge claim.

## Fix and validation

The native recheck notice moves to the viewport overlay. Existing evidence opacity, accessibility hiding, hit-testing and preserved history layout remain in place. No authority, fact eligibility, request, metering or database behavior changes.

The real local Auth/HTTP/SQL and bilingual SwiftUI suite uses a loopback-only history-read delay gate. It holds the existing history request across its real deadline, checks that facts disappear and the notice lies in the visible viewport, then releases the unchanged request and checks the same reading position. Synthetic local model only; no Staging provider call.

Validation and final-version Staging observations are appended after execution. Original baseline/failure evidence is retained.

Private raw logs, full screenshots and build/xcresult files: `/Users/jtcao/Library/Caches/visepanda/native-five-outcomes-20260913`. Credentials are excluded from committed artifacts.
