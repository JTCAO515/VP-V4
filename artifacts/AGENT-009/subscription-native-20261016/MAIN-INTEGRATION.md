# Native monthly subscription read consumer — Main integration candidate

Owner: chat 01a14161-5d7b-7392-87af-70cf7285518f, VP-V10 project 4f2191db-3e04-4042-94b5-ec94ff67b427. Exact base 61caa52a03cb59ff0075b8cf59c63994c30821e1. No old source or shared file was modified.

## Stable callable interface

- `NativeSubscriptionView(scope:chinese:port:legacyEntitlements:dataControls:)` is a generic SwiftUI destination; both destination builders are required, preserving existing controls rather than copying their implementation.
- `NativeSubscriptionSessionReadPort(scope:get:)` receives a live MainActor scope getter and an authenticated GET closure. It rechecks live scope before and after the await. `NativeSubscriptionRequest` includes captured `scope`, `.catalog(.zh/.en)` or `.entitlement`, and a client-only UUID `nonce`. Nonce/generation are local concurrency fences, not server authority or proof of purchase. No echo field is assumed in either producer wire.
- Scope has `endpoint`, lowercased authenticated `ownerID`, `mobileEpoch`, `generation`, matching existing `NativeDataScope`. Scope/Session must be read live, not captured at initial view construction. A session-generation change immediately hides private values before view lifecycle tasks run.
- Every resource returns a closed `{ "data": producerProjection }` envelope. Catalog resource is `subscriptionDevelopmentPresentation(locale)` from AGENT018 commit `1fd9669d43a2febae96c29949ebbadd211f42a53`, not the entire capacity catalog. Entitlement resource is the unchanged AGENT009 `Snapshot` (`subscription-entitlement/1`, observed clean contract in `192cc94c`, SHA256 `3680262e46bb2610fe8cd961de5d03425048937930ad2df892eff09e9c489eac`). No response field enables purchases/capacity.
- Strict parser rejects unknown/missing fields, altered versions, malformed/null/wrong types, positive or zero remainingCapacity, unknown environments/states, localTest claims, cross-owner values and invalid periods. Sandbox active/expired/revoked are explicitly labelled as Sandbox test periods; unavailable/reconciliation never mean none/zero. Current backend refuses local Xcode source; this reader does too. Clock/expiry can remove active display; it never manufactures an expired receipt or grants authority.
- Reload clears old data. Background/inactive, disappear, actor/endpoint/epoch/generation changes and expiry invalidate it. Errors do not restore stale data. No cache, credential/receipt store, StoreKit import, network client or write capability exists. Unconfigured port is genuinely unavailable, never fake success.

## Main-only before / patch / after

Before: Profile has a separate legacy Pass read/purchase section and existing ProfileData/Memory/core-export destinations; NativeSession has no subscription read method. Keep old Pass code and its sole ledger semantics unchanged.

Patch candidate (apply only in Main-owned source, with its exact lease):

1. Add the six new `Features/Subscriptions/*.swift` files to the existing App target and the single `NativeSubscriptionTests.swift` to the test target. No new package, dependency, asset or keychain service is needed. The test fixture catalog JSONs need a test bundle resource subdirectory `SubscriptionNative` for an App-hosted run, or Main may set the explicit test-only `SUBSCRIPTION_FIXTURES` directory. Production does not read files/environment.
2. Add one Profile/accepted entitlement-entry `NavigationLink` labelled `订阅与权益` / `Subscription and entitlements`, accessibility identifier `profile.subscription.open`. Its destination is this module. Supply current scope and the live Session-backed port. Use `.id(nativeSession.dataScope)` on this destination to recreate ownership if the injected Session instance itself is replaced.
3. Main's new Session GET adapter maps the two resource cases to its frozen authenticated read endpoint(s) and sole producer projection. Preserve the existing native Bearer/Origin/endpoint rules and throw on non-2xx or session drift. Do not route this through legacy storeKitRequest(method:), don't fabricate none on failure, don't run ledger apply or verifier/network Apple calls. With no trusted configured reader, return the backend closed unavailable snapshot.
4. The catalog branch wraps `subscriptionDevelopmentPresentation(locale)`. The entitlement branch wraps the real default-closed snapshot. If Main's endpoint is a combined payload, the adapter must first validate its frozen combined envelope and then wrap the exact relevant projection; do not teach this module a second guessed wire.
5. Inject existing legacy entitlement destination and existing memory/data-control destinations. Do not pass ProfileView itself recursively; Main can reuse/extract the accepted legacy destination or provide a return-to-Profile control in the builder. Do not replace the legacy purchase entry or create a new grant path.

After: this module is reachable and reloads via the authenticated GET source; sales and runtime-capacity flags remain false. Actual target/8F/App-hosted/local StoreKit/VoiceOver results remain Main-owned and UNRUN here. SDK typecheck is not that acceptance.

## Verification and execution facts

`python3 tests/contract/subscription-native/run.py` executes actual Foundation/Observation sources and the single Swift Testing file against synthetic read ports, then Swift 6 strict typechecks every actual module file against iOS 17 Simulator SDK without booting any Simulator. Runner writes only its own temporary build. Supplemental source checks assert the absence of write/account/persistence APIs.

Network/Git/dependency facts: gh issue reads #225/#226 succeeded; node v26.8.2, Apple Swift 6.4, Python and Simulator SDK are present; branch/worktree did not exist before creation; base tree was clean. Approval policy is never with danger-full-access; no elevated request or credential inspection was used. Official project binding was read back. Requested Sol 6.1/medium is not an observed effective model/tier; effective remains UNKNOWN.

No shared source, Simulator/device, Keychain, external Apple service, SKU, real user data, real Sandbox purchase, signing, TF, shared DB or runtime grant was operated. #225/#226 whole issues are not closed by this consumer slice.
