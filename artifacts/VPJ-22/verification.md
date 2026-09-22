# VPJ-22 verification — 2026-09-22

Related to #212; ordinary official native hotel exits, not full issue acceptance.
Base: origin/main at task start; branch `codex/vpj22-hotel-official-exit`.

## Real website observation (Codex in-app browser, desktop)

Synthetic input only; no account login, booking or payment.

1. Opened `https://www.booking.com/searchresults.html?ss=Shanghai&checkin=2026-10-20&checkout=2026-10-22&group_adults=2&no_rooms=1&group_children=0`.
   Visible search region showed 上海, “10月20日周二 — 10月22日周四” and
   “2位成人 · 0名儿童 · 1间客房”. **PASS** for this website sample.
2. Entered `Fairmont Peace Hotel Shanghai`: no suggestion on the immediate observation;
   submitting returned to 上海. Then entered `Fairmont Peace Hotel`, selected the visible
   `Fairmont Peace Hotel on the Bund Shanghai, Shanghai Area, China` suggestion, changed
   adults to 3 and rooms to 2 using the visible controls and submitted.
   Final search region showed 上海, the same dates and “3位成人 · 0名儿童 · 2间客房”.
   **FAIL to retain exact hotel selection** in this observed interaction; **PASS** for the
   changed adult/room counts in the supplier's UI. This is not proof that all arbitrary links
   preserve non-default counts. The app explicitly requires hotel reselection and field checks.
3. Opened `https://www.trip.com/hotels/`: **PASS**, real official “Hotels & Homes” page and
   “Search properties” region loaded. No date/occupancy parameter retention claimed.

Browser snapshots were inspected in-session; raw snapshots/redirect URLs are intentionally not
committed because supplier-generated links include session identifiers. No prices, room SKUs,
reviews, images or inventory were imported. The search-region observations above are manually
transcribed test evidence, not a stored supplier dataset. Web fetch of Booking returned unavailable,
while the interactive browser succeeded; web fetch is not substituted for browser verification.

## Native and repository checks

- First `xcodebuild build-for-testing`: **FAIL**, three test-initializer isolation errors in
  `NativeHotelHandoffTests`; app source compiled. Test classes changed to `nonisolated` and
  test methods explicitly main-actor isolated, matching existing repository tests.
- **PASS** corrected unit/UI test source typecheck with Swift 6, MainActor default and iOS
  Simulator SDK, using the app module emitted by the first build. A first standalone command
  lacked the XCTest Swift overlay search path; adding the exact Xcode `-Isystem .../Developer/usr/lib`
  resolved that command setup error. This is typechecking, not running XCTest or linking the app.
- **PASS** lightweight macOS executable compiled from the actual NativeHotelHandoff.swift plus
  a temporary assertion harness: fixed host/scheme, encoded query injection, child omission,
  plain Trip.com fallback, 14 rejected invalid inputs, open/failure/expiry states and local-day
  formatting. The temporary harness initially used throwing expressions in precondition
  autoclosures; corrected before the successful run. This is model execution, not iOS UI evidence.
- **PASS** `pnpm docs:check`, `git diff --check`, `plutil -lint` project registration.
- Further local heavy validation temporarily held by Overall because of extreme shared-host
  load. See unrun.md; no passing build or simulator claim follows from source inspection.
- Initial default `xcrun simctl/devicectl`: unavailable under CLT; recovered using per-command
  `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`, without changing global settings.

## Scope and coordination

New Hotels model/view and unit/UI tests. Necessary adjacent changes: single Tools row in
TodayView.swift and unique-UUID Xcode registration, approved/coordinated with Overall.
PR #478 owns its existing Tools accessibility fix; this patch does not replace those rows.
No NativeSession/DTO/Localizable, navigation enum, database, shared handoff or issue-plan change.

## Work-unit timing

Branch work started 2026-09-22 08:49:29 +0800 (Git reflog). User acceptance has not occurred,
so start-to-acceptance duration is UNRUN. Rework: test class isolation declarations and temporary
validation-command setup as above. External wait: shared-host resource window and physical-device
installation authorization; no supplier approval wait. No efficiency improvement is claimed.
