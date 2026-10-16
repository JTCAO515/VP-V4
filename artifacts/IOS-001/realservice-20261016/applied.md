# IOS-001 exact shared lease applied — 2026-10-16

Main explicitly released only AppShellView.swift:21 and NativeSession.swift:353 for these exact accepted candidates. Applied on original worktree at 9cdf933f6136dd5caef5ab95e720c6504c1ef033. All other shared/Ask hunks remain outside this lease.

Product diff: two replacements, two files. The real-service launch flag now ensures existing four tabs. Installed staging HTTPS may resolve the exact QA host. No installed config/default mode/activation, credentials, same-key retry, budgets, policy or provider behavior changed.

## Exact full-file pins

- `ios/VisePanda/VisePanda/App/AppShellView.swift`
  - before SHA256: `b65bd9e04ab3c4da0baad7b97cc0a105701b13c1c11e59fd6949918c116ebc42`
  - after SHA256: `e8dd3231dc2f35c556d627fd1a417a941da8d431013539aedff02055862b7c82`
- `ios/VisePanda/VisePanda/App/NativeSession.swift`
  - before SHA256: `6b7371e6f3ebd42220a532bad9f1981f4f0f5bb898e9e971d04b9662d5f88162`
  - after SHA256: `f8ed02995af76ee3436b620ebf07a3b18fae92017eb8e509bf60f0b3d25e5e00`

## Actual verification

- PASS: both current files matched full before SHA256 before mutation; both applied files match full accepted after SHA256.
- PASS: `python3 artifacts/IOS-001/realservice-20261016/verify_applied.py`: 16 endpoint assertions using the method extracted from actual product NativeSession.swift, plus 4 scenarios using actual AppShell initializer expression and rollout implementations. No network, credentials, provider or simulator.
- PASS: `xcrun swiftc -frontend -parse ios/VisePanda/VisePanda/App/AppShellView.swift ios/VisePanda/VisePanda/App/NativeSession.swift`. This is syntax parsing, not App typechecking or linking.
- PASS: `git diff --check`; only the two leased product lines and own task evidence/probe changed.
- UNRUN: full App integration build, XCTest, simulator UI, real target Auth/provider/session persistence, physical iPhone, VoiceOver and release. Main retains App build/simulator resources.

## Lease return

Stable commit/push receipt will be sent directly to Main. After that receipt this owner stops writing both exact hunks and returns them to Main; no successor writer or in-flight build/transport is retained. Original Ask holder findings remain read-only and are not repaired under this lease.

The earlier evidence.md describes the initial source audit and candidate-only phase. This applied record supersedes its candidate-not-applied status for exactly the two changes above. Original explicit same-key retry and server list recovery clarifications remain valid.

## Direct App-module tests delivered

Main requested the allowlist security checks as App tests. New `ios/VisePanda/VisePandaTests/NativeRealServiceEntryTests.swift` has eight XCTest methods calling actual `NativeSession.resolveEndpoint` through `@testable import VisePanda`; no copied resolver, network, credentials, global state or simulator is used. It covers exact installed staging HTTPS QA origin, suffix/userinfo/path/query/fragment/port and environment rejection, no remote launch override, no incomplete-config loopback fallback, and original staging/preview/loopback compatibility. Product files remain at the accepted after hashes.

PASS: new Swift file syntax parsing and diff whitespace check. App-module compilation and actual XCTest execution remain UNRUN locally; Main owns PBX registration and App XCTest on its own resources. `test-delivery-pins.json` records full source SHA256. The prior executed pure-source probe evidence remains separate and is not reported as this App test suite passing.
