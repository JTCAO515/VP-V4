# S1 Staging native implementation and local verification

Related to #187/#191/#192; PR #324. Core implementation `e104222`, packaging fix
`a0848e3`. This is implemented and locally observed; remote Staging and user acceptance
remain incomplete. No remote account, key provisioning, configuration change or model call occurred.

## Result and scope

Native identity and Trip can be explicitly bound to the named Staging and exact Preview host,
with the installed app reading a build-bound HTTPS origin. Production, aliases, other databases,
remote launch arguments and deployed LOCAL flags stay closed. Trip retains ordinary JWT/mobile
epoch/RLS, same immutable snapshots, explicit Proposal/digest/CAS confirmation and unknown-ack
semantics. Shared10-second request transport prevents an Auth outage from becoming destructive401.
The Web editor uses the corresponding Preview gate; five-language test wording is synchronized.

Adjacent changes are necessary for this same user result: Web route availability, Trip request
scope, the existing disposable runner's `--same-trip` mode, and a browser consumer over its exact
ordinary-cookie account. The runner creates a unique DB/workdir, checks local Docker and free
ports, verifies the explicit origin and destroys only its owned instance. No old local DB is selected.

## Evidence

- PASS: lint/typecheck, docs and diff checks. Core CI Quality34565345679 and Native34565345724
  passed for e104222; its Preview build also passed. New packaging commit requires its own CI.
- PASS:26 directed identity checks, plus6 Trip HTTPS/configuration/ordinary-JWT/503/cancellation/
  byte-limit checks. These use controlled transports and are not remote-provider evidence.
- PASS: `node tests/integration/identity/run-native-io.mjs` actual disposable Auth→Next→RLS,
  phone replacement, Web coexistence and revocation:1/1, zero skip, cleanup succeeded.
- PASS: `node tests/integration/identity/run-native-io.mjs --same-trip`: actual local native/Web
  APIs share a UUID and five confirmed versions, with cross-owner/replay/CAS attacks rejected.
  Four real cookie browser runs (zh/en ×1280×800/390×844) display drafts/diff, explicitly confirm,
  and verify native persisted same-ID reload.1 aggregate passed, zero skip; exact accounts and
  owned database were removed. See `same-trip-result.txt`.
- Initial browser run FAIL: the confirmation button was absent at the5-second observation.
  The test now first awaits the exact POST201 response, then waits for the confirmation control.
  The second full run passed; product code and version/confirmation assertions did not change.
  Retain `first-browser-failure.txt`; no claim that the original failure never occurred.
- PASS with incomplete API environment: actual default signed Simulator suite25pass/0fail/11skip,
  including the new endpoint-validation case. See `native-tests.json`; the unconfigured native
  API/physical environment checks remain UNRUN. Screenshots confirm readable local layout without
  horizontal overflow; existing reload behavior resets the Web language tozh, so screenshots do
  not prove locale persistence. English interactions were exercised before reload.
- Packaging correction: Apple documentation confirmed arbitrary user-defined `INFOPLIST_KEY_*`
  settings do not generate keys. Use the explicit plist instead. The first optional build was
  stopped after this configuration defect was established; its resource daemon was also observed
  stalled in file-open. A git-archived cache copy of a0848e3 built successfully and its final plist
  contained the exact synthetic staging origin and standard generated bundle keys. A second default
  build passed with both custom fields empty (`default-build.json`). This proves
  packaging, not a real endpoint connection. See `staging-build.json` and the runbook reference.
- Independent reviews: e104222 Critical0/Important0, runtime diff SHA256
  `aafe9549e5f0366b12e430c18330aa73003198c0f555681410faef87e2c1f6ea`;
  a0848e3 correction Critical0/Important0, reviewed diff SHA256
  `1d17d9c3e054e5320b842da29c33d1b2bb99db4670233c49c670d1cc6ac59ac1`.

## Remaining operation

`preview-before-activation.json` identifies e104222's exact new Preview with no native configured
keys. It is not an activated S1 environment. After final checks, resolve the specific Preview-only
proof-key/configuration, exact new host WAF allowance and two synthetic-account/own-Trip cleanup
scope in [the runbook](../../../docs/runbooks/native-staging-s1.md). Production merge/publish is
separately excluded by the current Goal. Neither #191/#192 nor S1/S2 is accepted by this PR.

Start-to-acceptance remains open; actual user acceptance has not occurred. Rework: one browser
waiting condition and one plist packaging correction. External waiting: native build/CI, followed
by the named Preview activation boundary. No price, model-efficiency or completion percentage is inferred.
