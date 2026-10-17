# NativeQA acceptance driver — default safe

Pinned product source: `cf33285eceb4cb340a9fe70e975c643c023f5035` (QA after PR753). Existing NativeQA/Auth/HTTP consumer APIs are unchanged. This package prepares and verifies acceptance orchestration; it does **not** claim that a real account, provider, database, App/Keychain or phone was accepted.

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
- scope_diagnostics/blockers and product_effects; real network/Auth/consent/generation/provider counters remain0 in this revision;
- resources: no simulator IDs, no shared App/Keychain access; synthetic cleanup flag;
- synthetic_processes/trace only in explicit synthetic results.

No raw prompt, response, credential or HTTP body is exported. Trace contains synthetic method/path names and an explicit SYNTHETIC_AUTH_MODEL label. A synthetic response is never presented as a real Agent answer.

## Real mode is metadata validation only

```sh
python3 tests/contract/ios-realservice/acceptance/driver.py --mode real --scope tests/contract/ios-realservice/acceptance/canary.pending.json
```

Exit2/UNRUN is intentional. **There is no real execution switch in this revision, even when candidate scope metadata is structurally valid.** A JSON file or authorization-reference string is not human approval. The pending template has null target/actor/notice/budget/window/resource values and grants nothing. Scope checks reject duplicate/extra/secret fields, wrong pinned source/project/environment, unapproved Native origin, missing exact actor/policy/notice/budget, >1 question, missing cost cap, expired/unbounded window and reserved8F/22BA/0B61 resources. It does not provision or activate any target.

The allowed origin check preserves existing Native server eligibility: the exact approved Preview deployment URL or original staging custom origin. It does not widen the QA alias/server gate. There is no service-role user surrogate, LLM selector, browser-cookie bridge, production/TF/device action, config write or provider call.

## Minimal later App hookup (sole integration owner)

Current real UI already has original Profile/sign-in, explicit notice, new Session, composer, saved history, question/status/answer selectors. A later authorized real UI run must use that flow with the **installed** trusted QA endpoint and `qa_session_v1`; never override a remote endpoint via launch flags, inject a fake user scope or inspect Keychain secrets. Operator enters ordinary credentials through Profile and reviews the exact notice under the future approved canary scope.

The principal missing observation is **original serialized request Data hash before transport**; recreating JSON from UI text is not equivalent. `NativeQAAcceptanceObservation.swift` is a no-IO, compile-time `NATIVE_QA_ACCEPTANCE` gated observer supplied for this purpose. Without this flag it adds no runtime code. Even with the flag, a valid explicit run UUID is required. It receives only the already scoped typed command at the existing transport seam, exports IDs/actor/epoch/policy/notice and original Data/input digests, and labels its phase PREPARED_NOT_SUBMITTED. It never claims admission or completion. Rendering is restricted to exact current transport scope/generation, and the observer clears on identity change. It contains no token, prompt, response, persistence or network access.

Exact **unapplied** before/patch/after for the sole shared owner are under `artifacts/IOS-001/acceptance-driver-20261017/candidates/`, pinned to cf33285e. They add only an optional observer in NativeQASessionTransport and a clearly labeled opt-in test overlay in NativeQAEntryView. The observer itself needs PBX registration; use the compile flag only for a dedicated test build, not default/release/TF. No Root, old Ask, production config or journal change is needed. Re-check exact before hashes or regenerate against the integration head. Candidate syntax was checked; integrated App/PBX/runtime is UNRUN.

After future canary authorization and a separately registered real UI test/runner, acceptance checkpoints are: show ordinary Profile sign-in → verify permitted public actor identity and current notice → explicit user consent → exactly one approved question → capture original command digest/IDs from the scoped observer → wait boundedly for the actual rendered terminal response → record input/response hashes and Session/request IDs → terminate only the dedicated canary App process → relaunch the installed App → use saved history to select the same Session → verify the same request and response bytes/IDs without another POST. Unknown/blocked/partial/technical-failure remain distinct; unknown preserves original command and reads only. No App uninstall, erase, old-draft purge, token extraction or automatic financial/cancellation claim is permitted.

The default driver does not register/start that runner or infer authorization from source/configuration. Main must route the two precise shared hooks/PBX and the later authorized UI runner to their owners. Real target readiness, actual Auth/provider/consent/budget/worker, installed package/device, VoiceOver and phone acceptance remain UNRUN here. Existing unchanged App/consumer evidence is reused separately, not rerun as a new matrix.
