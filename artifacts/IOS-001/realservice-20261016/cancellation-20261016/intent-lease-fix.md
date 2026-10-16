# Cancellation queued-intent Spec P2 — actual RED/GREEN

Reviewed source d1e69058 had no displayed action identity parameter. A stop/check button scheduled a Task calling the no-argument Store method; if the Store reactivated for B before that Task started, the old A button could operate on current B. The independent review was source-derived. This owner subsequently reproduced it through the actual public Store action path with explicitly synthetic ports; no actual App UI or live target was exercised.

RED: freeze old public stop/check button task for A, activate B, then execute the old task. Original product ran16 methods with3 assertion failures across2 new methods: stop made1POST and retained B; check made1GET for B. Expected0 for each. Original14 cases passed. These tests concern task-start-before-rebind ordering, distinct from the prior onPost late-response case.

Fixed product **84c67dbb90ed5d9f19ed7ae813de4021a9d0990a**, only CancellationStore/View and dedicated tests. Persistence/transport/DTO/wire signatures and exact4e9 contract bytes remain unchanged; no journal-owner adaptation is needed.

- Store adds ephemeral nested Intent(target + existing local generation token), captureIntent() and isCurrent(intent). It is not Codable or persisted and is not a new server cancellation ID.
- No-argument requestStop/checkResult are removed. Public requestStop(intent:)/checkResult(intent:) require the captured displayed intent and revalidate it before action ownership. They never recapture a successor from an old task.
- View captures displayed identity/intent while constructing the displayed controls. Tap-time and Task-start checks reject stale intent; the Store checks again. Original-result callback also uses that displayed intent. View lifecycle task captures its displayed identity before activation rather than looking up a successor inside the queued task.
- Owned child task now checks its captured scope/target/local-generation fence before even reading persistence. Existing pre/post-await, byte, receipt, stop-eligibility, capacity, tombstone, unknown-only-GET and no-generation-mutation checks remain intact.

GREEN: final19 cancellation methods PASS/0FAIL/0SKIP with actual new product Store/Contract and original NativeDataScope definition in the dedicated SwiftPM proof. The old A stop/check paths produce0POST/0GET/0load/0retain after B activates. Current B's newly captured intent still stops B, duplicate taps yield1POST/1retain, old intents after background round-trip or endpoint/actor/epoch/presentation-generation changes are rejected, and another Store cannot reuse the intent even for the same tuple. All prior14 cancellation cases remain included.

The existing tests use a clearly named test-only helper to capture a fresh current intent for ordinary cases; queued regression cases freeze the real public captureIntent result before rebinding and invoke the parameterized public methods directly. No production no-argument convenience wrapper remains to reintroduce the bug.

PASS: final actual CancellationStore/View and fixed Contract + original Scope/Theme iOS17 Swift6 typecheck using a private disposable cache; diff whitespace and allowed paths. Original19 core/target-getter evidence was not rerun because its product sources are byte-unchanged. UNRUN: actual App/hostedUI/physical-device, transport/vault integration and real Auth/provider/target races. Synthetic public-intent execution is not live service acceptance.

Integration needs the new Store/View source together. Any integration tests directly invoking old no-argument Store methods must capture an Intent at the UI action creation point and pass it into the delayed call; capturing inside a delayed Task is incorrect. Parent View initializer, stable journal protocol and all shared files stay unchanged. After product commit, only evidence/pins follow. STOP after final receipt, no in-flight/planned/successor writes; source review and integration remain Main-dispatched.
