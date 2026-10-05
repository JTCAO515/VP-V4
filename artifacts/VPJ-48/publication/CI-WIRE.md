# Concrete Quality CI failure / approved precise shared test correction

PR662 exact3614a249, Quality37344839546/job111880697266 FAIL, step `pnpm test`.
tests/static-output.test.mjs:172-177 selects first CSS chunk, then asserts Homepage_hero.
New own Ops publication CSS legitimately changes hashed chunk order; selected chunk is
`.workspace_workspace__bSDgL`, not Homepage CSS. Actual runtime/build/native are not failing
in this log. No blind rerun. Main please grant sole TS precise static-output CSS-selection
hunk after checking no concurrent owner. Proposed correction: choose the built Homepage
CSS by its actual content/linked Homepage output, preserving ALL existing token/hero/
responsive assertions. Do not change workflow/gates or weaken the Homepage test.
Raw failure available /tmp/vpj48-pr662-quality-failed.log, no credentials. New source/head
only after this concrete authorized correction. Other existing CI continues, no new matrix.

Concrete minimal patch ready: proposed-homepage-css-selection.patch changes ONLY the
three CSS selection lines to real relocatedHomepageHtml stylesheet links, verifies every
linked file exists, combines those route-specific styles and retains every existing
Homepage token/responsive/reduced-motion/compiled hero assertion. Read-only proposed
copy at /tmp/vpj48-static-output-proposed.mjs actually passes15/15 on current build;
this is proposed-copy evidence, NOT edited repository test or remote CI PASS.
Main47b8a7/7c9aef explicitly approved the exact proposed patch after verifying no competing
dirty static-output test in all WTs. Applied the approved linked-Homepage-only CSS selection,
preserving ALL original assertions, no production CSS change or gate weakening. Actual
pnpm test22PASS0skip on unchanged integrated build, production modules unchanged. Fresh
main469c02dc (normal merged661) integrated locally1212206; this actual test correction is
batched with that dependency for one new PR head/formal/allCI. Old3614 remote Quality FAIL
remains recorded, not relabeled PASS. No owned core defect or issue reopen required.
