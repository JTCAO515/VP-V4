# Validation

- PASS: 10 executed continuation/input cases, Apple Swift 6.4, own module cache. Tests preserve same-goal admission and reject missing parents, terminal versions, absent authority, pending requests and oversized UTF-16 input. First compile failed because default module cache was sandbox denied; original failure retained below, no assertion was changed.
- FAIL r1: generic App build sandbox could not access CoreSimulator / compiler macro plugins; exit 65. `build-r1-sandbox-fail.log.gz` retained.
- PASS r2: generic iOS Simulator App compile in owned temporary validation copy at original three-source candidate; exit 0. `build-r2-pre-fence-pass.log` retained. Not final source evidence.
- PASS r3: final four-source candidate generic App compile including Ask invocation and explicit project registration, own DD `/private/tmp/vpj13-journey-entry-dd-20261012`; exit 0. `build-r3-final-candidate-pass.log`. Source hashes and exact shared before/after in `candidate-manifest.json`. Only compilation copy is registered; real worktree shared files are UNAPPLIED. This is no installed runtime proof.
- PASS: actual simulator inventory after platform approval; all listed devices Shutdown. No device booted, borrowed, killed or deleted.
- PASS: exact shared before hashes remain unchanged in own worktree. Product/source diff check passes; zero-context executable candidate diffs avoid counting preserved tab-indented context as artifact whitespace.
- UNRUN: actual permitted HTTP/DB/provider personalized E1, material confirmation E2, same-goal readback E3, installed app UI, large-text rendered interaction, hardware keyboard, VoiceOver, physical device and target environment.
- INCOMPLETE: authoritative party-size/service-intent/personalization projection and actual consented product telemetry consumer. No first_value pipeline invented, no #203 closure or merge claim.

First Swift compile: `error opening ~/.cache/clang/ModuleCache/...swiftmodule for output: Operation not permitted`; subsequent executable absence was command chaining noise. Successful retry used `swiftc -module-cache-path /private/tmp/vpj13-swift-modulecache-20261012 ...`; executable ran only after observed compile exit 0. No security configuration was changed.
