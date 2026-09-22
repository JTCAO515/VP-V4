# Serialized UI acceptance plan (not executed)

Overall must allocate the native window and a fresh owned disposable Ask stack.
Do not start this while the self-hosted runner or another native task uses the host.
Do not use a shared Staging project or a pre-existing developer database.

## Required resources

- Local Docker and Supabase CLI; the unique `vp-native-ask-*` stack uses API 59641,
  with the current repository migrations. The exact isolation/port/preflight/cleanup
  implementation is `tests/integration/turn/run-native-http.mjs`. That wrapper owns
  and destroys its workdir; its path cannot be reused after it exits.
- Explicit `VP_IDENTITY_SUPABASE_WORKDIR` and
  `VP_IDENTITY_SUPABASE_API_URL=http://127.0.0.1:59641` supplied by the stack owner.
  `identityLocalEnv()` reads credentials internally; never print its output.
- Installed repository Node dependencies and API port 59651 free. The environment
  builder starts Next and a loopback model server; it must remain alive until tests
  finish. Do not start a second copy or use an external provider configuration.
- An owned iPhone Simulator and an ad-hoc `build-for-testing` product for the exact
  PR head. Reuse the same-head build if available. Record Xcode, runtime, build head
  and actual UDID. No new build is implicit in the commands below.
- `VP_NATIVE_PLANNING_XCTESTRUN`, `VP_NATIVE_PLANNING_SIMULATOR` and
  `VP_NATIVE_PLANNING_OUTPUT`: absolute source `.xctestrun`, owned UDID, fresh output.

## Test selection and environment

Use `createNativeTextEnvironment()` from
`tests/integration/turn/native-text-environment.mjs` for current-input tests;
use `createNativeTextEnvironment({grounded:true})` for grounded tests, sequentially.
Each call creates four unique synthetic `@example.test` accounts, local policy and
budget test records. Grounded mode also publishes two synthetic reviewed statements
through two synthetic reviewers and disables those reviewer roles afterward.
All provider traffic is mapped to a local controlled HTTP server. It is real local
Auth/PostgreSQL, synthetic knowledge/model output, and **not** a real supplier test.

While each environment is alive, copy its non-secret test profile into a private
copy of the matching build's `.xctestrun` using the existing plist patch pattern in
`run-native-grounded-events.mjs`. Write this copy beside the source `.xctestrun` so
`__TESTROOT__` remains correct; use mode 0600 and a unique filename. Required keys:

| Key | Value source |
| --- | --- |
| `VP_NATIVE_TEXT_TEST` | `1` |
| `VP_NATIVE_TEXT_API_URL` | `environment.api` |
| `VP_NATIVE_TEXT_CONTROL_URL` | `environment.controlURL` |
| `VP_NATIVE_TEXT_UI_EN_EMAIL` | `environment.users[2].email` |
| `VP_NATIVE_TEXT_UI_ZH_EMAIL` | `environment.users[3].email` |
| `VP_NATIVE_GROUNDED_TEST` | `1` only for the grounded pass |

Run `xcodebuild test-without-building -xctestrun <owned patched path>
-destination 'platform=iOS Simulator,id=<owned actual UDID>'
-parallel-testing-enabled NO -resultBundlePath <fresh pass-specific xcresult>`
with exactly the two applicable selectors:

```text
-only-testing:VisePandaUITests/NativeAskUITests/testEnglishMessageOpensOutlineAndReturnsToInput
-only-testing:VisePandaUITests/NativeAskUITests/testChineseMessageOpensOutlineAndReturnsToInput
```

For the second, grounded environment replace those selectors with:

```text
-only-testing:VisePandaUITests/NativeAskUITests/testEnglishGroundedMessageOpensOutlineAndReturnsToInput
-only-testing:VisePandaUITests/NativeAskUITests/testChineseGroundedMessageOpensOutlineAndReturnsToInput
```

The existing `run-native-text.mjs` launches the whole suite and the existing
`run-native-grounded-events.mjs` selects earlier answer tests. Neither currently
offers these narrow selectors. A coordinator should add a scoped selection mode or
execute the environment/plist lifecycle above; merely running those old commands
does not establish this planning outcome.

## Required observations and cleanup

Require 2 passed / 0 failed / 0 skipped per pass, capture the attached outline and
return screenshots, and assert `environment.counts.http === 0` before cleanup.
These cases write synthetic Auth/login/consent data but do not tap create/propose/
confirm. Opening planning reads Trip APIs and changes only local outline state;
no Trip write or provider invocation is expected. Check the local Trip table count
before/after with the owned environment's SQL helper, without printing account data.

Always call `environment.cleanup()`, delete only the generated plist and owned
Simulator, then let the stack owner stop/destroy the unique disposable stack.
Cleanup deletes only synthetic accounts in that explicit stack. Preserve failed
results, zero/skipped counts and cleanup failures instead of retrying blindly.

These four tests still do not prove a long-history scroll position, on-screen
revocation/TTL timing, VoiceOver or the entire proposal/confirm/both-client reload.
Those observations require separate targeted UI scenarios within the same assigned
window; source/state evidence must not be labelled as UI acceptance.
