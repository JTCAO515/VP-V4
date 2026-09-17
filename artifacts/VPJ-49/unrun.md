# VPJ-49 verification boundaries

- The local sharing UI consumes the existing native-v2 confirmed Trip contract.
  Its UI fixture supplies synthetic HTTP responses; it does not prove a real
  Staging login, database persistence, hotel order or preference system.
- App Store/release, physical device, iOS 17 runtime, and delivery to an external
  recipient were not exercised. No recipient was contacted. System Share Sheet
  presentation on iOS 26.5 Simulator is the intended local handoff boundary.
- The repository integration command reports 76 skipped environment-dependent
  tests and security reports 1; both return exit code 0 but outcome `incomplete`.
  These pre-existing DB/provider/environment prerequisites remain UNRUN. They are
  not needed by this read-only native image projection and are not marked passed.
- Prior failures are retained in verification: UI-test build used a synchronous
  XCTest wait in async context; the first UI run tapped a switch container instead
  of its nested control; the next run did not dismiss the localized system sheet.
  Test corrections retain the original privacy and handoff assertions.
- Initial Playwright installation failed on local Node 26 (removed recursive
  `rmdir` option); retry uses the already-installed bundled Node 24 runtime.
- No production deployment, database migration, remote hosting or issue-parent
  acceptance is implied by this PR. VPJ-02/75/76 are owned by other tasks.
