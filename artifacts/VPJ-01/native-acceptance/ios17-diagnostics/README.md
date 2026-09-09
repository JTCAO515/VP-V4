# iOS 17.5 retained audit diagnostics

These are FAIL evidence, not a waiver. Device: iPhone 15 Simulator, iOS17.5.

- `chinese-clipped-*`: exported from `20260910-010046/full-ax.xcresult`; the message frame is `(30,409.8,296.3,15.7)`. The complete Chinese sentence is visually present in the element image, but the automated result is Text clipped. This does not prove VoiceOver or clipping acceptance.
- `offscreen-contrast-*`: exported from `20260910-010448/full-ax.xcresult`; the third prompt frame is `(30,699.7,259.3,18)`, under the composer. Its automated result is Contrast failed. This run tested a separate ScrollView/composer VStack; that unsuccessful layout experiment was reverted.

Subsequent comparisons retained the issue handler's `return false` for every issue. Changes to banner font, padding, accessibility grouping, ScrollView clipping and LazyVStack did not establish a full minimum-runtime pass and were reverted. The final run is reported in the parent verification record; intermediate failures remain in commands.jsonl. Full xcresults and logs are in the named local Library/Caches directory. No issue filtering or hidden user-facing text was introduced.
