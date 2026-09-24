# VPJ-09 saved Ask request to Trip outline — 2026-09-24

## Result and boundary

A completed grounded Ask turn whose current read contains the bounded four-city, 2–7 day food/walk request now offers a native **Plan from this request** action. It passes only the user's original input into the existing local relative-day sheet. An Ask answer, reviewed fact, AI assist result, or inferred place/time is not copied. Pending, expired/unavailable reads and unsupported inputs expose no action. The Trip draft still requires a user-supplied non-overlapping start date, Proposal, visible diff and exact confirmation; no Trip writer or SSE recovery code changed.

Main already contained the original composer-to-outline flow from PR #475 and the bounded Chat-to-Plan sheet. #192 is closed; #195 and #196 remain open. This PR reuses that path and does not claim the full #197 acceptance.

## Observed checks

| Check | Result | Evidence |
| --- | --- | --- |
| iOS Simulator build | **PASS** | `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO -quiet` exited 0. |
| Saved-turn handoff eligibility | **PASS** | Dedicated iOS 26.5 iPhone 17 Pro Simulator `FD98F758-E671-4982-B0B2-7601499698FC`; `xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=FD98F758-E671-4982-B0B2-7601499698FC' -derivedDataPath /tmp/vpj09-ask-trip-20260924-derived -parallel-testing-enabled NO -only-testing:VisePandaTests/NativeTripStateTests/testCompletedGroundedRequestCanEnterOutlineWithoutCopyingAnswer CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- -quiet` exited 0, 1 passed / 0 failed / 0 skipped. [xcresult summary](native-unit-summary.json). Cases cover original input, expired/read-unavailable, pending and unsupported request. |
| Documentation and whitespace | **PASS** | `pnpm docs:check` and `git diff --check` exited 0. |
| Saved-turn visual tap, target Staging, physical iPhone, native/Web same-Trip readback on this increment | **UNRUN** | No owned grounded Ask fixture or target-environment window was used. PR #475's prior local readback is historical evidence for the existing writer path, not evidence of this new entry point. |

The owned Simulator is deleted after extracting the test summary. No shared Simulator, database, account, migration or production setting was changed. Full Issue gaps remain saved preferences, broad fuzzy input, grounded real-place feasibility and target-environment acceptance.
