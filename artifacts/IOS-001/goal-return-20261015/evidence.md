# IOS-001 E3 Native consumer

Source commit `ac96fa1114dd11cf5ca5d2696602c3e6e5bc2140`; candidate-patch packaging commit `fa11a832017afede5d9809d40ce50135511bd744`. Base `f605b1a4d226ee15bd60fe154d39c916efb36d5a`.

The consumer discovers the last decision using the exact five-field `goal-return/1` scope, reads its exact artifact/revision with the existing Session reader and `NativeFiveResultRecord`, requires current/chosen and matching source, then rediscovers the identical reference/event. No older result is substituted. Its 20-second lease begins before the first request. Reopening repeats the chain and requires the previously displayed reference. Actor/session/epoch, selection generation, goal/input and scene changes invalidate eligibility; existing event, erasure and Memory signals clear the store. Timeout clears loading and ready values. The measurement callback remains nil.

Shared Session/Conversation/PBX bodies were not edited here. `shared-candidate/manifest.json` pins the actual Main `f14a8c9d7c1ba03bad84d93a02c8cfa510b09146` before bytes, complete after bytes and minimal patches. Patches use zero context: Main must verify the exact before hash, then apply with `--unidiff-zero` or copy the verified after bytes. PBX registers three App sources and the one authorized XCTest file. Main owns applying these seams and testing the integrated App.

Validation on 2026-10-15:

- PASS: DEBUG simulator and Release device SDK syntax parsing of the four affected Swift sources; XCTest syntax parsing. Xcode 27.0 (27A266a), Swift 6.4, SDK 27.0, deployment target 17.0. Parsing does not establish compilation or runtime behavior.
- PASS: candidate PBX `plutil -lint`; final full-change `git diff --check`; `pnpm docs:check`.
- FAIL, preserved: original standalone state command failed before running assertions. `state-r1-original.log` retains exact SHA256 `023d53cc39695824744cf9d82344ac0e14426297d13f1dbcc30feb315a8de141`. The first concrete error is `sandbox-exec: sandbox_apply: Operation not permitted`, followed by ObservationMacros plugin malformed-response errors. No disabling sandbox/macros, alternate identity, weakening assertions or equivalent retry was performed.
- UNRUN here: integrated App build and behavior. The canonical test is `VisePandaTests/IOS001GoalReturnContinuationTests`, using `@testable import VisePanda` and actual App store/decoder. Main will run it through the normal Xcode test target. Original `tests/contract/ios001-goal-return/` untracked files are retained locally as received and were not rerun or included in this commit chain.
- UNRUN: current QA Auth/database/provider route, real UI, device, VoiceOver and release acceptance. This slice does not close #203 or enable E2/W2/measurement.

The official app inventory confirmed this chat in VP - V10 project `4f2191db-3e04-4042-94b5-ec94ff67b427`. Effective model/service tier were not exposed and remain UNKNOWN. No shared database, provider, deployment, permissions, credentials, persistent user data or another owner's simulator/DerivedData was operated.
