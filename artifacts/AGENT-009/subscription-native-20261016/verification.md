# Verification — native read-only subscription consumer

Base: `61caa52a03cb59ff0075b8cf59c63994c30821e1`; branch `codex/subscription-native-20261016`. Source and all fixtures are confined to the assigned new namespace. Existing Profile/Session/AppShell/Routes/PBX, legacy Pass, entitlement authority, backend/SQL and shared configuration were not modified.

PASS: `python3 tests/contract/subscription-native/run.py` — 17 Swift Testing tests against actual feature sources with explicitly synthetic read ports. Includes zh/en source-backed catalog decoding; unknown/missing/extra fields; malformed/null/overlarge values; actor/source/policy identity; localTest-vs-Sandbox; half-open trusted periods; none/active/expired/revoked/reconciliation/unavailable transitions; actor/endpoint/epoch/generation drift; refresh clears old data; same-account old nonce; background/sign-out late response; expiry hides active without creating an expired receipt; cancellation and Session pre/post-await checks.

PASS: the same runner typechecks all six actual feature files, including SwiftUI view, using `swiftc -typecheck -swift-version 6 -sdk <iphonesimulator SDK> -target arm64-apple-ios17.0-simulator`. No device is booted. Supplemental capability scan confirms no StoreKit operations, network client/write methods or persistence API in this feature. It does not prove Main's future transport implementation.

PASS: `node scripts/docs-check.mjs`; `git diff --check` (including staged new files before commit).

Catalog fixture source: producer `1fd9669d43a2febae96c29949ebbadd211f42a53`, `subscriptionDevelopmentPresentation(en|zh)`, exact generated fixture bytes. Backend closed field contract: `192cc94c` / `lib/server/entitlements/subscription-ledger/contract.ts`, SHA256 `3680262e46bb2610fe8cd961de5d03425048937930ad2df892eff09e9c489eac` (clean source readback). Neither signature validation nor real ledger persistence is claimed by native parser tests.

UNRUN: Main's shared authenticated GET/Session/PBX/entry integration; actual App build/run on Main's 8F Simulator; VoiceOver and large-Dynamic-Type visual/interaction acceptance; App-hosted test bundle fixtures; real Sandbox; local StoreKit probe; production/account/device/release. The UI uses native Form, multiline VStack/Text and combined accessibility elements, with no fixed text heights or purchase buttons. SDK compilation does not establish those runtime outcomes.

Target execution settings: official VP-V10 project binding read back; requested Sol 6.1/medium, effective model/thinking/service tier not exposed and UNKNOWN. Existing local tools, SDK and authenticated GitHub issue reads worked. No secret was read/logged or added, no approval bypass or escalation was used, and no third-party/account operation was invoked.

Integration is given in `MAIN-INTEGRATION.md`. Whole #225/#226 remain outside this native-slice completion claim. Main alone freezes/applies shared integration and records unified target acceptance.

## Main-requested bounded read lease increment

Current lease wire: B commit `ebd4fe0a70d67d3bc7fafb768f49b75c656bc34c`, clean contract SHA256 `4e2b4b65d8f481b9c91e29b1eff848e71ae16b318de61f87a9cb719db721841e`. Supersedes the pre-lease parser pin above; the original 17-test log is retained as history.

PASS: 23 actual Swift Testing cases and actual iOS 17 SDK SwiftUI typecheck, `lease-verification.log`. Added strict checkedAt/lifetimeMs type/range/mandatory-field rejection; only active accepts positive lifetime, nonpositive states require 0; full round trip subtraction with injected ContinuousClock; response arriving at/after lease exhaustion; exact 1ms period-end boundary using integer milliseconds; same original checkedAt cannot extend the first deadline even after a failed refresh; new trusted check may provide a new lease; no device-Date input participates in positive eligibility. Historical none/expired/revoked use server-provided states and show last check time rather than recomputing from the client's calendar.

PASS: `node --experimental-strip-types tests/contract/subscription-native/verify-producer-parity.mjs <catalogWT> <ledgerWT>` — exact actual catalog presentation output and six synthetic samples accepted by B's actual final closed parser, then decoded by Native. `producer-parity.log`. This is source/codec interoperability, not signature, target, persistent-ledger or Apple evidence.

An initial lease test exposed Foundation floating-point addition at a 1ms half-open boundary (119ns overshoot); the codec now compares canonical wire milliseconds as bounded Int64. Existing App/target/8F/VoiceOver/real Sandbox/device/release UNRUN facts remain unchanged. Main retains all shared integration and acceptance responsibility.
