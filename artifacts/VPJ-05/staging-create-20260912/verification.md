# S1 native Staging creation follow-up — 2026-09-12

Related to #191 / #192; integration PR #325. Full S1 acceptance remains open.

## Environment and scope

The app was built from `4b0cf6c` with one test expectation correction: Profile already
renders `Session active` / `会话有效`; the old test expected local-only wording.
No application behavior changed. The installed bundle fixes the Staging origin to
`https://vp-v4-6gmyp6494-jtcao515s-projects.vercel.app`; the test's historical loopback
launch argument cannot override that compiled origin. Backend remains
`f5db769fbcca7b24fd6aeebf8dc004b63df1c2b8`; no redeployment or firewall change.

One owned iPhone 17 Pro / iOS 26.5 Simulator and two synthetic accounts are used within
the previously authorized scope. Preflight confirms three existing users, two existing
Trips and 36 applied migrations. Credentials stay in private temporary files/processes;
no email is sent and no model provider is called.

## Observations

- PASS: the existing `NativeTripIntegrationTests.testRealLocalCreateConfirmReloadConflictAndReplacedSession`
  ran against that remote backend: one passed, zero failed, zero skipped. It exercises
  actual Swift login, create, proposal-before-confirm isolation, explicit atomic confirm,
  reload, stale-draft preservation, item/day deletion and replaced-session denial.
  This is a real native consumer result, not a button UI result.
- FAIL: first English UI run reached login but observed `Connection incomplete. Retry the session.`
  instead of active within 30 seconds. The exact cause remains unresolved; do not describe it
  as a confirmed network or backend defect. Subsequent scoped credential/login/profile
  probes each returned 200, and the native consumer test passed.
- FAIL: second English UI run hit `kAXErrorIPCTimeout` while XCTest attempted the password
  field interaction, before login submission. It exited by itself; no interrupt was sent.
- First Simulator boot took 7m12s, including system migration. Owned-device restart took
  52s. Other tasks' Simulators were not shut down, deleted or reset.
- UNRUN: Chinese button workflow. After the owned restart, the test runner did not start a case within five minutes; only this xcodebuild was canceled. Xcode reports a runner failure (`Testing was canceled`), not a completed Chinese test. See [results](results.json).

No new screenshot constitutes successful Trip UI acceptance yet. Physical device,
iOS 17, VoiceOver, maximum text and network-loss/unknown-ack cases remain unrun here.

## Cleanup and CI

[Database cleanup](cleanup.json) confirms zero owned accounts, Trips and sessions;
pre-existing totals remain three users, two Trips and 36 migrations. Auth normalized
one synthetic email to lowercase; the first cleanup guard refused before any deletion.
Exact owner IDs, canonical emails and both test markers were then verified before the
transaction. This is count reconciliation, not a byte-level audit of other users' data.
[Simulator cleanup](simulator-cleanup.json) confirms only the owned device was deleted.
The account/password file and all transient credential-bearing xctestrun files are removed.

Native CI run `34629086248` failed before tests because the fixed `vpj-56/tests.xcresult`
path already existed. Application builds and ad-hoc signature verification passed in
that run; tests did not. Workflow commit `3ea2793` gives every run/attempt its own output
and matching artifact-upload path. YAML parsing, matching-path inspection and diff check
passed; the replacement CI result must be checked after push. No old result directory
was deleted to manufacture a pass.

The UI assertion fix compiles, but its full bilingual target workflow remains incomplete.
This follow-up does not close #191/#192 or accept the full S1 stage. No production setting,
RLS rule, model policy or provider permission was changed.
