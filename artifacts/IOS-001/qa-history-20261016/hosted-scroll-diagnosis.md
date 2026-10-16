# History hosted scroll feedback: bounded diagnosis

Task: user can scroll saved history and choose the original session without a loop. Source examined at fixed product `bd44d4c2ddfa4affdd74acaf3f31a3197f0581fa`; HistoryView bytes equal this owner's `a118a7bd` source. Evidence pins and source/log absolute paths are in hosted-scroll-diagnosis.json. Only those supplied originals were read. No simulator, DD, test source, shared file or product source changed.

## Observed

- r4 method `testHistoryObservableRevocationInBothLanguages` lines 41–72 uses a standalone NavigationStack with the production HistoryView at accessibility5, a synthetic one-session Store, full-scene UIWindow at alert+1 and explicit scenePhase active.
- After its first capture, the method chooses the first UIScrollView anywhere under the window. Unlike its service method, it does not require contentSize.height > bounds.height, identify the History List, or record the view class / adjustedContentInset / actual offset / scrollability. It requests y=max(0, contentSize.height-bounds.height). Thus this source does not establish that a historical row was reached or which scroll surface changed.
- Log lines 990–1011: test starts, followed by twenty repeated UIKit.NavigationBarContentView updateProperties invalidations for the same Bool key path and same view address, then UIObservationTrackingFeedbackLoopDetected. Later TEST EXECUTE INTERRUPTED. This is an actual hosted failure; no call stack or explicit stage markers here prove whether scroll processing, settle or drawHierarchy initiated the internal update.
- Main reports r3 and r4 both fail, while r5 omitting this programmatic scroll block passes two tests. These are Main's executor reports, not this owner's fresh runs. They isolate a trigger block, not a human-gesture failure or History-specific root cause.

## Source-based limits

History reads current scope/snapshot, filters DTO labels, and constructs a List. It has no scroll-position binding/callback, geometry/preference write, repeating task, or navigation state write. query State is written by its TextField; selection/create callbacks run only on Buttons. This excludes a visible app-authored scroll-to-Store mutation loop in the inspected source; it does not exclude a SwiftUI/UIKit interaction.

The relevant navigation seam is automatic title display: History sets navigationTitle without navigationBarTitleDisplayMode. The actual ServiceView wraps it in a sheet NavigationStack; the r4 fixture hosts it as a root NavigationStack instead. The log names the UIKit navigation content view. Same-repo NativeKnowledgeView specifies inline. These are reasons to test the title seam; they do not prove that inline fixes the failure or that automatic titles are invalid.

## Smallest next verification, exclusively by the integration executor

1. Preserve r4 unchanged as RED. In a diagnostic copy under that owner's lease, keep the same window, language, maximum size, settle, capture and offset. Substitute a plain List with matching TextField/section/row geometry and the same navigationTitle. If it also loops, the failure is not dependent on History DTO/scope logic.
2. Hold the original History and fixture constant, change only navigationBarTitleDisplayMode(.inline) as a diagnostic override. If that alone removes the failure, report exact before/after source pins and reached scroll offset. The History owner can then make the one-line production adjustment under its original lease. A green diagnostic override is not a product fix until incorporated and retested.
3. Separately identify the actual List scroll surface and establish scrollable bounds/insets before setting a clamped bottom offset; capture stages before/after scroll and before draw. Do not treat removing the scroll assertion/block as scroll acceptance. A real sheet/navigation route and a gesture remain separate UI coverage.

Current conclusion: a navigation/hosted programmatic-scroll interaction is a supported hypothesis; product defect versus fixture/platform interaction remains UNKNOWN. No blind product patch or changed test assertion is justified by the current evidence. Original 7 synthetic tests and Main's reported App50 evidence are preserved; no unrelated matrix is rerun. Actual scroll/selection/no-loop remains UNRUN by this owner, awaiting the exclusive executor's minimal controls. This owner is stopped after the diagnostic handoff, retaining the lease for a Main-directed necessary fix.
