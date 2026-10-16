# IOS-001 real service source seam — 2026-10-16

Status: SOURCE INSPECTED; NO NEW INDEPENDENT PRODUCT MODULE. Candidate patches only, not applied.

Worktree `p0-ios-realservice-20261016`, branch `codex/p0-ios-realservice-20261016`, base `5e960e6d4dd4b1050b23622a4dc6ed57653f4b57`; initially clean. Effective model/thinking/service tier UNKNOWN (not exposed). Apple Swift 6.4 arm64 toolchain observed. No simulator, DerivedData, physical device, signing, credentials, provider, grant, migration, remote configuration or production action used.

## Existing source seams

| Producer / consumer | Exact source | Current behavior |
| --- | --- | --- |
| Root and four tabs | App/AppShellView.swift:20–43; Navigation/AppRoute.swift:168–181 | Fixture frontend is disabled by `-V10RealServiceFrontend`. `.vp` already reaches original AskView. Shell restores NativeSession and validates on foreground when frontend is disabled. Profile is reachable through existing shell entries. |
| Native identity | App/NativeSession.swift:173–189,347–381,2384–2461,2552 | Endpoint comes from installed allowlisted HTTPS config or loopback fixture only. Cookie storage disabled. Credentials/login/refresh use original `/api/auth/native/v2/*`; endpoint/subject/mobileEpoch/generation scope is authoritative. |
| Original login UI | Features/Profile/ProfileView.swift:59–117 | Existing email/SecureField invokes NativeSession.login. No credentials collected by this task. |
| Ask dispatch | Features/Ask/AskView.swift:17–22; Features/Ask/NativeAskModels.swift:121–126 | `.assistant` uses original v5 Assistant view. `.serviceTask` uses NativeAskView/NativeAskStore and HTTP v2 turns, v1 policy/consent/cancel compatibility. These are distinct protocols, not Web QA Session adapters. |
| Exact HTTP compatibility | App/NativeSession.swift:2027–2050 | serviceTask accepts GET/POST v2 turns and v1 policy/consent/cancel only. Other paths fail before transport. |
| Task durable pending | Features/Ask/NativeAskStore.swift:350–425,443–528; App/NativeSession.swift:383–423 | Original request and Task key live in existing credential journal, acknowledge/readback clears exact matching pending. Do not clone journal or history. |
| Assistant conversation/history | Features/Ask/NativeAssistantConversationView.swift:887–929,1758–1900 | Original selected conversation, list, task history, result/event projections. Navigation pointer is session-memory only; Assistant pending is View-memory only. Do not claim durable Task recovery from this consumer. |

Paths above are relative to `ios/VisePanda/VisePanda` unless tests are explicitly named. Exact file hashes are in source-pins.json.

## Concrete gaps and ownership

1. **Main Session/config:** `resolveEndpoint` rejects `qatesting.go2china.space`. Candidate adds exactly this host under existing installed `staging`+HTTPS checks; no wildcard, launch override, Cookie, environment default or target activation. Applying it changes endpoint allowlist and requires Main's accepted exact target/config review. Target still needs working Native Auth and v1/v2 policy/turns, not merely `/api/qa-agent`.
2. **Main Root:** `-V10RealServiceFrontend` alone does not force four tabs when NativeShellRollout is false. Candidate makes that exact flag select four tabs. Existing `-VisePandaFourTabShell` can instead supply the behavior without a patch. No new wrapper is needed.
3. **Original Ask/UI owner:** disabled endpoint falls through AskView.previewBody. Real-service mode needs an explicit disconnected screen; do not silently show preview as service. Existing NativeAskView already shows signed-out/unavailable states for an enabled endpoint. No new UI module is justified.
4. **Original AskStore/persistence-test owner:** unknown ACK + history absent currently permits user-triggered explicit POST of the SAME original key/payload; this is the original accepted idempotent retry contract, not a blind retry or new-key admission. `NativeAskPersistenceTests.testAbsentHistoryKeepsOriginalPayloadAndTaskOnExplicitRetry` (114–134) explicitly requires 2 POST / 1 admission. The dispatch's simplified “readback only” wording differs, but does not by itself revoke that accepted contract. Main explicitly directed preservation of original button/data semantics pending strict unknown-recovery review. No bug or required contract change is asserted here; retain the original request/key and reconcile first. Do not weaken identity/admission checks or replace the journal.
5. **Original AskView lifecycle owner:** non-grounded `.task(id: store.pollKey)` (121–129) does not gate `visible`; `.onChange(visible)` only invalidates canonical selections. The source retains ordinary `turns`; NativeAskView:43 gives non-grounded rows `readable=true` regardless of `visible`, while the poll loop does not check visibility. This proves missing source gates, not observed iOS background scheduling or screenshot leakage. Binding ordinary read/projection lifecycle to active visibility while retaining original pending journal is the targeted candidate for original-holder review; runtime reproduction remains UNRUN.
6. **Assistant mode limitation:** ordinary `pending`/planning pending are View state; send reuses the same pending while the view lives, but no call to the Task durable retain path precedes ordinary v5 POST (1936–1985). A kill after server acceptance/before ACK loses this client-only operation identity; whether server conversation lists suffice to reconcile without duplicate submission needs targeted original-holder proof. The in-memory selected pointer alone is NOT a persistence defect: reopening can select the original server conversation from the existing list. Main must preserve the accepted protocol/mode and decide the exact P0 lane using its producer contract; this audit does not switch modes or claim ordinary v5 persistence failure from the pointer.

These gaps are outside the granted new namespace. No existing file was edited; no request to widen scope, new writer, model selection, consent or grant was made. Main can apply its shared candidates and coordinate original Ask owners under exact leases. This task stops independent implementation here instead of creating duplicate state or an empty wrapper.

## Reviewable candidates

`candidates/AppShellView.swift.{before,patch,after}` and `candidates/NativeSession.swift.{before,patch,after}` contain full source snapshots and minimal unified diffs; candidate-manifest.json pins before/after SHA256. Verify current bytes equal before before applying; on divergence regenerate against current owner source. No automatic apply or build-config values were written.

Conditional configuration example only, not a mode selection or activation; Main must first establish exact approved target and producer protocol: `VP_NATIVE_ENVIRONMENT=staging`, `VP_NATIVE_STAGING_API_ORIGIN=https://qatesting.go2china.space`, `VP_NATIVE_TASK_CONTEXT=service_task_v1`. `service_task_v1` denotes the inspected v2 compatibility lane only; it is not a replacement for full v5 conversation semantics or a claim that Web QA sessions share these IDs. These are unactivated examples, not current deployment evidence. No Web Cookie reuse, QA-session ID conversion or provider/model choice.

## Verification

- PASS: worktree/branch/base/initial clean; namespace and NativeRealServiceEntryTests.swift absent.
- PASS: candidate endpoint pure-source probe compiled with xcrun swiftc, 16 assertions; baseline rejects QA, candidate exact QA accepts, hostile host/credentials/path/query/fragment/port/nonstaging/remote launch overrides reject, existing staging/preview/loopback behaviors preserved. Probe makes no HTTP calls and uses no credentials.
- PASS: git diff --check; changes limited to this artifact directory.
- UNRUN: app build, XCTest, simulator, physical iPhone, VoiceOver, real Auth/RLS, provider answer, persistent same-session readback, worker and foreground runtime. App build/resources reserved to Main; no product source changed here.
- Existing persistence tests were SOURCE INSPECTED, not executed or counted as current PASS. Current issue #203 and #681 were read live and remain OPEN.

## Main integration acceptance still needed

First resolve the exact original Ask ownership findings with their holders while preserving accepted same-key retry semantics, then build the integrated four-tab root with the accepted target configuration. Verify disconnected/signed-out/unavailable explicitly, ordinary Native Bearer login, first real provider answer and terminal state, same Task/session readback, process reopen, unknown ACK retained exact identity and authoritative reconciliation (preserve approved explicit same-key retry semantics; no blind/new-key submission), foreground cancellation/projection clearing, and actor/epoch/endpoint separation. Record pure-source/synthetic, target and physical-device evidence separately. Do not close #203 from these candidates.

## Main clarification incorporated

Main explicitly distinguished original explicit same-key retry (one admission) from blind/new-key replay, and server conversation-list recovery from an in-memory selection pointer. This evidence preserves those semantics. Source analysis is not a behavioral reproduction. No historical C0 constraint was used to label current P0 failure.

Kill-before-ACK source boundary: NativeAskStore retains original Task request in NativeSession before POST; NativeSession.save plus exact retained comparison is the existing durable path. Ordinary Assistant v5 pending is view state and requires its own exact producer/receipt reconciliation review. Neither is proven by the pure endpoint probe. No speculative fix is applied to old owner files.
