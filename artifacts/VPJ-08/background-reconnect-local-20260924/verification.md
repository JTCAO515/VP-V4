# VPJ-08 pending Ask background and network reconnect

Scope: local disposable Supabase/Auth/HTTP and iPhone 17 Pro Simulator on iOS 26.5, with a synthetic held model and synthetic reviewed answer. Tested source `c5735877` plus this change on 2026-09-24. This is local integration evidence, not shared Staging, real Qwen, physical device or full #196 acceptance.

## Result

PASS: after one native Send admitted a grounded Turn and its model attempt was held, the loopback proxy closed the active SSE TCP response. The app entered OS background, returned to foreground, and requested events for the same Turn with `Last-Event-ID: 1` after its initial cursor `0`. The test then released the held synthetic model. The installed native app displayed the reviewed answer for the same question and removed its Cancel action. The disposable database recorded that Turn completed with two events and one model attempt; no second Send was made. See [counts.json](counts.json) and the inspected [answer screenshot](answer.png). The screenshot labels its facts synthetic and shows the answer card in the viewport.

Command: `VP_NATIVE_EVENTS_OUTPUT=/tmp/vpj08-reconnect-20260924-run5 VP_NATIVE_EVENTS_SIMULATOR=<owned iOS 26.5 simulator> node tests/integration/turn/run-native-http.mjs --grounded-native` — PASS, exit 0. Selected native real-local byte transport 1/1 and grounded UI 3/3 (English/Chinese answer and relaunch, English pending background plus TCP disconnect/reconnect). `node --check` for both edited `.mjs` files and `git diff --check` passed. The runner's isolated Supabase stack and owned Simulator were removed after the run. No shared Staging or Production state was changed.

The first two full runs kept the new reconnect case PASS but the existing English relaunch case FAIL: the accessibility answer existed while the test's swipe started over the fixed composer and never scrolled the answer into view before its 30-second evidence lease elapsed. A focused third and fourth run repeated that failure. The final run changed the test gesture to start inside the visible Ask scroll area; all selected cases passed, and the answer screenshot was inspected. Those failures remain test history, not runtime PASS claims.

UNRUN: deliberate network/OS background interruption against a real Staging task and provider, remote wire cursor capture, provider tail-usage loss, Trip proposal/commit recovery, physical device and production release. Previous Staging tab return/relaunch and cancellation evidence remains scoped to its recorded versions. #196 stays open.
