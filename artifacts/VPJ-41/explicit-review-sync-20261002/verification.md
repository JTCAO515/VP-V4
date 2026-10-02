# WEB1 explicit review synchronization repair

2026-10-02. Isolated branch/worktree from main f916bdc3; base64620 / Next64651 / DB64641. Trip ee5aafea/96087a64 freezes are untouched. No independent micro PR; Main reviews/integrates this current repair, then work pauses.

## Original failure and causal limits

#621 head2a0b5bec, run36976750686/job110742115179 failed the pending-status assertion after POST201. That CI record remains FAIL. It contains no canonical GET delivery timestamp, so the unique cause of that CI occurrence is not proven.

Controlled real-browser reproduction on baseline: server POST201 returned; a genuine ordinary-cookie canonical GET fetched current base3/stale=false but was held before delivery to the page. At the original assertion point, status remained conflict (base3/head3/dirtytrue), reproducing the same received/expected failure. This proves the original receipt-only synchronization premise can produce the symptom. It is not evidence that a delivered canonical proposal was subsequently overwritten.

Baseline and the tentative identity-ref candidate both passed when the real canonical GET was delivered before asserting pending. Therefore the ref candidate was not proven necessary and is not submitted. TripContentEditor is exactly the f916 baseline; temporary state attributes are removed. The candidate backup remains in /tmp for preservation.

A separate baseline run returned HTML parsed as JSON; the generating request was not identified in that run. An explicit method/path/status/content-type precondition was added to prevent opaque parsing failures. The subsequent run passed and did not reproduce HTML. That HTML root cause remains UNKNOWN and is not counted as product RED.

## Committed repair and actual verification

Harness only: await the actual canonical GET/JSON proof, deliberately retain the prior conflict and absence of confirmation target while its delivery is held, then release and await the unique handler fulfillment before unregistering it. The original already-handled fault came from unregistering before fulfillment completed; it is not a product failure. The complete POST/arrival/qualification assertion region is inside try/finally, which always releases and cleans up. Fetch has an upstream deadline; arrival/fulfillment has bounded failure paths. Fetch/JSON/fulfill failures propagate to the owning test, cleanup executes, and an original failure plus cleanup failure is retained as AggregateError. No skip, changed pending expectation, timeout inflation or swallowed failure.

PASS: final suite3/3, zero skipped — two focused barrier tests cover successful fulfill-before-remove, controlled fetch/JSON/fulfill errors and absent-request deadline; one real disposable Auth→Web browser→HTTP/SQL→native-protocol flow. Product/parser/rendering and writer/permissions remain real.

The real flow preserves canonical parent/child ID/revision, explicit diff/confirm, unknown-schema target isolation, old revision409 and stale head409 with no extra write. POST201+held GET does not create a confirmation target or write; after delivery, exact pending/enabled assertions remain. Explicit user confirmation uses the same canonical ID/digest and advances exactly once to head4. Trip switch clears the old target/notice. Screenshots and actual request/SQL counts retained.

PASS lint, typecheck, syntax and diff check. No blind rerun of old CI or blanket test suite. New final-head CI remains UNRUN locally and must be performed by Main after integration; neither this local PASS nor #622 can erase #621's old FAIL. Native physical UI, real user acceptance, Staging/Production, provider and funds remain UNRUN/out of scope.
