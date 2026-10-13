# W2 Native submission refusal regression

Owned delta for #229 / PR679; base `4a1824097ec6e7e9f67d94dc056ff2a8f70bcab3`.
Only product path: `ios/VisePanda/VisePanda/Features/Ask/NativeAssistantConversationView.swift`.
Private refusal state and its getter, send/sendSelectedSources catch guards, and reload are changed.
No Session/Models/PBX/SQL/CI/configuration/JourneyEntry or other-owner functions changed.
`pins.json` contains exact before/after/patch hashes and unchanged selected-source dependencies.

The two exact operational server refusals survive successful saved-content GETs and transient read failures. Both submit entries reject an already refused current scope/selection. Late, cancelled, different scope/epoch/selection responses cannot install refusal; selected-source catch also requires the original pending request to remain owned. Unconfirmed pending and draft remain. Matching accepted message/conversation readback resolves the exact pending operation, including selected-source pending, without granting new Ops eligibility. All existing Trip/Proposal and cancellation interfaces are unchanged.

## Actual checks

- PASS: `python3 artifacts/VPJ-37/v10-native-submit-refusal-20261013/run-behavior.py`: 98 runtime assertions on source SHA256 `956f4f74d785c37df89fd360b97b51f3a3d53e938ebd8bd0180928991402da87`.
  Runner compiles the actual send/sendSelectedSources methods, ops getter, scope/selection guards, reload success tail and outer catch, and actual NativeSelectedMessageStore/Models. Synthetic transport, policy, projection and narrow unrelated dependency stubs replace SwiftUI/environment/network orchestration. Assertions exercise both codes in both paths, no automatic/explicit repost while refused, ordinary error classification and same immutable JSON request on explicit retry, normal accepted response, exact/unrelated/cross-conversation readback, nil/offline scope, actor/endpoint/epoch/generation/selection fences, late sources changes and cancellation retaining pending/draft.
- PASS: repository `scripts/ios/ci.py --build-only` twice, Xcode27.0 build27A266a / Swift6.4; registered VisePanda project, generic iOS Simulator destination, CODE_SIGNING_ALLOWED=NO, distinct own DerivedData/result paths. r2 builds the final product source SHA above; r1 preceded the private/source guard amendment. Both exit0/BUILD SUCCEEDED; commands, metadata and compressed raw logs retained. Build command's Git HEAD is base plus the dirty product delta, explicitly pinned here; it is not a final-commit CI claim.
- PASS: `git diff --check`; inspected only the authorized product diff. Unchanged tests/evidence are reused; no Web or SQL matrix rerun.
- FAIL retained: first runner compilation required its pending property to be fileprivate because it uses the extracted production private type; fixed fixture access only. r2's byte-for-byte JSONEncoder equality assertion failed because object-key ordering is not fixed. Corrected the fixture to compare the entire immutable decoded JSON identity/body; no production request or source contract was weakened. Raw r2 failure retained; later 98 assertions PASS.

## Limits and recovery

UNRUN: SwiftUI rendered fallback/button interactions, Simulator XCTest/UI execution, physical device/VoiceOver, Staging/provider close/resume and real current Ops eligibility recovery. No simulator/device was created, borrowed, launched or killed; no provider/user data/permission/configuration operation was performed.

Current policy and conversation GETs intentionally permit authorized reading of saved work while producers/Ops are off (`native-assistant-http.ts` GET/read path); they do not return an Ops qualification receipt. This delta keeps same-scope refusal fail-closed. Accepted old history only reconciles pending; it does not prove current dispatch eligibility or reopen sending. Scope/selection replacement discards applicability of the old refusal while existing policy/source/server admission gates remain. An automatic same-scope recovery requires a real current Ops eligibility contract, which is outside this exact file lease; no new endpoint/grant is fabricated. Main owns deciding/integrating any separately authorized recovery interface.

Permissions actually supplied to this chat: danger-full-access/unrestricted filesystem, approval_policy=never, working shell, GitHub read/network and Xcode builds observed. Thread creation requested GPT6.1SolMedium and VP - V10 project; tools do not expose the effective model/effort, so no verified runtime-model-switch claim is made. No global configuration or permissions changed.

Stable delta is for Main cherry-pick into existing PR679; no new PR, merge, parent closure, or release is claimed. Scope is released in final handoff after commit/push; no product/test/build tools remain in flight. Rollback: revert this delta commit only, preserving original W2/E3 and other-owner source.
