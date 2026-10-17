# NativeQA acceptance driver — default safe

Pinned product source: `cf33285eceb4cb340a9fe70e975c643c023f5035` (QA after PR753). Existing NativeQA/Auth/HTTP consumer APIs are unchanged. This package prepares and implements acceptance orchestration; it does **not** claim that a real account, provider, database, App/Keychain or phone was accepted.

## Run now

From the repository root:

```sh
python3 tests/contract/ios-realservice/acceptance/driver.py
python3 -m unittest discover -s tests/contract/ios-realservice/acceptance -p test_driver.py -v
python3 tests/contract/ios-realservice/acceptance/driver.py --mode synthetic
python3 tests/contract/ios-realservice/acceptance/run_observation_probe.py
```

Default is DRY_RUN, overall UNRUN, zero product effects; no real target is contacted. `--report /new/path.json` creates a new result file and refuses to overwrite existing bytes. No password/token/Cookie/Keychain value is requested, read, logged or accepted as scope metadata.

Synthetic mode builds the actual pinned NativeQAContract/Store and original NativeDataScope definition with Swift6, then runs **two real OS processes** in a private0700 temporary test namespace. The first explicitly models sign-in, exercises actual consumer notice/consent/create/submit/pending/readback and obtains a clearly labeled synthetic answer. It retains the original Data in a test-only file-backed transport/journal double. After process exit, the second new process/Store selects the same saved Session and reads the same request/answer without another generation POST. Session/request/Turn IDs and original body/input/answer SHA256 must match; process IDs must differ; submission count remains1. All temporary test files are removed. No simulator, App data, user draft, production bundle or real Keychain namespace is used.

The Profile/credentials/login stage is **modeled only**, not execution of NativeSession/Auth. The result deliberately retains `overall: UNRUN` even when `synthetic_driver: PASS`. Per-check PASS is explicitly synthetic evidence. Task ID is an optional unobserved metadata item: currentqa-agent/1 does not expose authoritative ServiceTask ID. This does not block the principal session/request/byte/response/reopen proof and must not cause an invented field or customer-facing implementation detail. Main may separately correlate controlled same-request backend metadata if required by the acceptance standard.

## Exact result contract

`result.schema.json` is the machine-readable schema. Runtime `validate_result` additionally enforces phase sequence, no unsupported real PASS, zero real effects and distinct process/reopen identity constraints. Top-level fields:

- schema/mode/overall/product_revision/synthetic_driver;
- checks: fixed ordered native_profile_login, explicit_notice_consent, original_question_submit, bounded_response_read, saved_session_read, original_request_bytes, process_exit, reopen_same_session; each has status/evidence_kind/reason;
- identity: session_id/request_id/turn_id, optional null service_task_id, SHA256 of original body/input/answer only;
- optional_observations: nonblocking unobserved authoritative Task binding;
- scope_diagnostics/blockers and product_effects; real network/Auth/consent/generation/provider counters are0 in dry-run/synthetic and unobserved (`null`) in an explicitly executed real run;
- resources: no simulator IDs, no shared App/Keychain access; synthetic cleanup flag;
- synthetic_processes/trace only in explicit synthetic results.

No raw prompt, response, credential or HTTP body is exported. Trace contains synthetic method/path names and an explicit SYNTHETIC_AUTH_MODEL label. A synthetic response is never presented as a real Agent answer.

## Real mode: default dry-run, explicit operator execution only

```sh
python3 tests/contract/ios-realservice/acceptance/driver.py --mode real --scope tests/contract/ios-realservice/acceptance/canary.pending.json
```

Without `--execute-real-ui`, exit2/UNRUN is intentional even when scope metadata is structurally valid. A JSON file or authorization-reference string is not human approval. The pending template grants nothing. Scope checks reject duplicate/extra/secret fields, wrong source/project/environment, unapproved Native origin, missing actor/policy/notice/budget/question hash/run UUID, >1 question, missing cost cap, expired/unbounded window and reserved8F/22BA/0B61 resources.

The actual runner source is `ios/VisePanda/VisePandaUITests/NativeQAOperatorAcceptanceUITests.swift`. The sole shared owner must register this **one** opt-in test and prepare its existing project test products; exact cf332 PBX before/patch/after is in `artifacts/IOS-001/acceptance-driver-20261017/real-ui-registration/`. It defaults to XCTest skip **before App launch** when the explicit execution marker/scope is absent. No Root, Session, transport, journal or App observer hook is needed for the main UI flow.

Only after a separate exact canary authorization already exists and the authorized operator deliberately invokes it:

```sh
# FUTURE AUTHORIZED OPERATOR ONLY. Not executed during this delivery.
python3 tests/contract/ios-realservice/acceptance/driver.py \
  --mode real --scope /approved/nonsecret-canary.json --execute-real-ui \
  --xctestrun /approved/prebuilt/VisePanda.xctestrun --run-dir /new/private/canary-run
```

The declared dedicated simulator must already be Booted, have name `VP-NativeQA-Acceptance-<run_id>`, and be outside reserved shared resources. Its installed and prebuilt App metadata must match the exact Native staging origin, `qa_session_v1` and bundle. Resource preparation/install remains with the owner; this driver does not create/erase/boot/delete a simulator, uninstall an App, clear drafts/Keychain or sign/upload anything. It patches only a new0600 private copy of the supplied xctestrun, runs only the named UI case once, and strips unrelated targets, app arguments and arbitrary fixture/credential environment variables. A new0700 run directory retains private Xcode artifacts; only the sanitized JSON attachment is exported to the final report.

Follow `OPERATOR_REQUIRED` checkpoints in `<run-dir>/xcodebuild.log` while using the specified simulator window. The test opens the original Profile; the operator enters ordinary credentials/MFA. Machine reads only public actor identity through the original Profile menu and compares the approved actor. Operator reviews notice/explicitly consents, creates a new session and prepares the approved draft **without sending**. Machine checks draft digest; operator presses Send once only after the next checkpoint. The test never types credentials/question text or taps login/consent/create/send. It waits boundedly for the actual saved answer, obtains request/Session IDs and rendered input/answer digests, requires the selected session was created in this run, terminates that App process, relaunches the installed App, verifies the restored actor and selects the same saved history row, then checks the same request and rendered content. It never signs out, retries generation or promises a refund.

`real_ui.py` exports the named JSON attachment from the generated xcresult and checks **exactly1 selected/1passed/0failed/0skipped**, all UI checkpoints, actor, approved question, Session/request/Turn and reopened content. Zero tests, missing registration, timeout/skips, unknown/partial/technical failure or foreign metadata cannot become PASS. Actual XCTest failure is FAIL; unmet prerequisites/skips are UNRUN. Private artifacts remain for operator review. Provider/network/cost counts are unknown (`null`) during a real run; one observed UI question is not a claim that provider attempts/cost were zero.

The allowed origin check preserves existing Native server eligibility: the exact approved Preview deployment URL or original staging custom origin. It does not widen the QA alias/server gate. There is no service-role user surrogate, LLM selector, browser-cookie bridge, production/TF/device operation, or target configuration write by the runner. Real ordinary App Auth/consent/question effects arise only from the future authorized operator's actions; this delivery executed none.

## Minimal later App hookup (sole integration owner)

Current real UI already has original Profile/sign-in, explicit notice, new Session, composer, saved history, question/status/answer selectors. A later authorized real UI run must use that flow with the **installed** trusted QA endpoint and `qa_session_v1`; never override a remote endpoint via launch flags, inject a fake user scope or inspect Keychain secrets. Operator enters ordinary credentials through Profile and reviews the exact notice under the future approved canary scope.

The principal missing observation is **original serialized request Data hash before transport**; recreating JSON from UI text is not equivalent. `NativeQAAcceptanceObservation.swift` is a no-IO, compile-time `NATIVE_QA_ACCEPTANCE` gated observer supplied for this purpose. Without this flag it adds no runtime code. Even with the flag, a valid explicit run UUID is required. It receives only the already scoped typed command at the existing transport seam, exports IDs/actor/epoch/policy/notice and original Data/input digests, and labels its phase PREPARED_NOT_SUBMITTED. It never claims admission or completion. Rendering is restricted to exact current transport scope/generation, and the observer clears on identity change. It contains no token, prompt, response, persistence or network access.

Exact **unapplied** before/patch/after for the sole shared owner are under `artifacts/IOS-001/acceptance-driver-20261017/candidates/`, pinned to cf33285e. They add only an optional observer in NativeQASessionTransport and a clearly labeled opt-in test overlay in NativeQAEntryView. The observer itself needs PBX registration; use the compile flag only for a dedicated test build, not default/release/TF. No Root, old Ask, production config or journal change is needed. Re-check exact before hashes or regenerate against the integration head. Candidate syntax was checked; integrated App/PBX/runtime is UNRUN.

After future canary authorization and a separately registered real UI test/runner, acceptance checkpoints are: show ordinary Profile sign-in → verify permitted public actor identity and current notice → explicit user consent → exactly one approved question → optionally capture original command digest/IDs from the scoped observer → wait boundedly for the actual rendered terminal response → record input/response hashes and Session/request IDs → terminate only the dedicated canary App process → relaunch the installed App → use saved history to select the same Session → verify the same request and response bytes/IDs without another POST. Unknown/blocked/partial/technical-failure remain distinct; unknown preserves original command and reads only. No App uninstall, erase, old-draft purge, token extraction or automatic financial/cancellation claim is permitted.

The default driver does not register/start the runner or infer authorization from source/configuration; explicit real invocation uses the concrete UI adapter above. Main must route the single UI-test PBX registration to the shared owner and the later authorized real invocation to the canary operator. The two observation hooks are optional for raw original-body digest only; they do not block the main UI flow. Real target readiness, actual Auth/provider/consent/budget/worker, installed package/device, VoiceOver and phone acceptance remain UNRUN here. Existing unchanged App/consumer evidence is reused separately, not rerun as a new matrix.

## Evidence labels and current limits

Real UI question/answer hashes come from accessibility-label UTF8, and are labeled as rendered-content evidence. They are not raw HTTP-body hashes. If the optional scoped test observer is not enabled, `original_body_sha256` remains null and the original serialized-body checkpoint stays UNRUN; JSON is never reconstructed from UI text to fake that proof. The main real UI flow still runs and is reported separately. With the optional body observer, source/actor/notice/run/request/session provenance must match before its digest is accepted. Internal Task ID remains optional/unobserved and is not a global runner prerequisite.

This delivery typechecked the actual UI test source against iOS17/XCTest and tested only finite orchestration/oracle/plist paths with synthetic inputs. It did not register/build/run the test in an App, touch real accounts/notice/model/network, allocate simulator resources or exercise GoTrue. The prior two-process synthetic proof and14 observer checks are unchanged-source evidence and were not rerun for this addition.
