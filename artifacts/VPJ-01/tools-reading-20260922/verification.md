# Native foundation reading repair — 2026-09-22

Related to #188 and PR #478. Base: current main `ce46abd` merged with the existing
reading repair `c57f3449`. This increment replaces only Tools row titles with the
same `VPReadableText` used by the previously repaired Ask/Trip copy. Native List,
NavigationLink, labels, icons, minimum hit height and navigation routes remain.
There is no audit suppression, clipped-text exception or reduced test category.

## Actual observations

| Run | Environment | Result |
| --- | --- | --- |
| tools-before | iPhone 15 / iOS 17.5 | FAIL: original Tools maximum-size test reports `Text clipped` |
| tools-after | Same simulator, same original test | PASS 1/1 after the row renderer substitution |
| shell17 | Same iOS 17.5 | PASS 10/10, zero skips: all existing AppShell methods plus palette test, including full maximum Ask/Trip audit |
| tools-matrix17 | Same iOS 17.5 | PASS 2/2, zero skips: new Tools `.all` en/zh × light/dark at largest size and actual Translation navigation; rendered-text live locale/size/layout test |
| shell26 | Owned iPhone 17 / iOS 26.5 | PASS 5/5, zero skips: full normal light/dark Ask/Trip, full maximum Ask/Trip, Tools matrix/navigation and palette |

The new Tools test was added after shell17 compiled; its actual17.5 execution is
therefore the separate tools-matrix17 run, not retroactively part of shell17.
All runs use Xcode27 and local ad-hoc Simulator signing. Cold26.5 Simulator boot
took about six minutes; it completed, and the tests subsequently ran successfully.
No real account, provider or retained Trip was used in these foundation tests.

Exact commands, per-run counts/device identities, compressed logs and source hashes
are adjacent. Original `.xcresult` bundles remain under `/tmp/vp-s1-20260922`.
The original fail is retained. Inspected English light and Chinese dark maximum
Tools screenshots: complete row titles wrap and remain selectable; the Chinese
dark image is retained as `tools-zh-dark-largest.png`.

`pnpm docs:check` and `git diff --check` pass after the evidence update.
Remote CI and merge status must be read from the current PR; these local results
do not assert them. The production reading component's prior controlled negative
tests remain in [the first repair evidence](../readable-text-20260918/verification.md).

## S1 boundaries

- Physical VoiceOver remains UNRUN; automated accessibility cannot prove spoken
  order, pronunciation and gestures on the user's phone. Prior phone Trip and
  identity evidence stays limited to the versions and actions actually recorded.
- #246's two real weekly customer-discovery sprints remain unobserved. The separate
  preparation PR #480 supplies an execution package, not invented customer results.
- Current hosted research-intake inspection is inconclusive: in-app browser CDP
  navigation/state reads timed out; independent HTTPS read failed before response
  with `SSL_ERROR_SYSCALL` / HTTP000. No form was submitted or setting changed.
- No Staging migration/activation, production deployment, signed distribution,
  TestFlight, real selected-object Ask or S2 model acceptance is claimed here.

Rollback: revert the Tools renderer/test increment, or the complete reading repair
when reverting PR478. No data migration or account/configuration rollback is needed.

## Integration with newer main

Main `5f95d16` (#481) introduced place map files using the same Xcode object IDs
as the reading repair. Resolved by retaining all main map/configuration objects
and assigning unique 06F/070 references to the reading tests/component. Shared
handoff preserves the newly compacted main state and adds only native evidence;
its generated pages were rebuilt. After merge `b7d80fd`, iOS17.5 compiled both
features and passed 9/9 tests, zero skips: place-search tests, palette,
rendered-label updates and the original Tools audit. `plutil`, docs check and
diff check pass. No map runtime behavior or SDK configuration was changed.

## CI toolchain mismatch

Native run35655888102 failed before compilation because the actual runner has
Xcode26.6/17F113 while the script accepted only27.0/27A266a. The two previously
validated exact version/build pairs are now an explicit allowlist; unknown
versions, missing runtime/device, signature failures and tests still fail. No
test was filtered or retried by the script. Python syntax, local27.0 preflight,
docs and diff checks pass. Remote26.6 compilation/full-scheme outcome must be
read from the replacement CI run; the old failure remains a failure. Adjacent
script/VPJ-56 contract changes remove this observed S1 integration blocker.
