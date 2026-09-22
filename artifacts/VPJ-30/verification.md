# VPJ-30 development verification — 2026-09-22

Base: main `5f95d16`; branch `codex/221-travel-reminders`. Related to #221;
no complete capability acceptance, merge or production action.

PASS:
- 18 targeted policy cases: expiry, due boundary, version, account/session,
  purpose consent, OS permission, timezone, unknown/archive/end, terminal states;
  unavailable transport and generic lock-screen content.
- Isolated PostgreSQL 17.6 storage execution with real roles and existing mobile
  guard bodies: owner read isolation, direct-write/anonymous rejection, stale
  version and consent rejection, replay/cancel/complete, archive unknown/true,
  mobile replacement, Trip cascade and transactional rollback. Auth/Trip rows are
  synthetic; this is not a GoTrue/native HTTP end-to-end test.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm docs:check`, `git diff --check`.
- iOS Simulator generic build, Xcode 26.6 (17F113), via explicit DEVELOPER_DIR.
- Independent read-only review found three P2 issues (failed form recovery,
  silent deduplication, hidden open reminders); fixed with explicit rejection,
  retry distinction and bounded open reminders prioritized in list.

Observed failures retained:
- Default xcodebuild selected CommandLineTools. Used installed Xcode explicitly.
- Initial device build failed because this clean checkout lacks ignored AMap SDK
  resources. Simulator build does not require those device frameworks and passed.
- First isolated database startup test raced the image's initialization restart.
  Replaced test startup with a dedicated initdb/socket; no shared DB was touched.
- #485 native CI was still failing against pinned Xcode 27 at kickoff; #240 owns
  the shared environment adjustment. This PR does not lower or edit that gate.

Checks use `/tmp/vpj30-*` logs and an isolated Docker container with network none,
no host port and synthetic rows. Test containers were removed. No remote schema,
real account/token, notifications or shared simulator/DB state changed.
