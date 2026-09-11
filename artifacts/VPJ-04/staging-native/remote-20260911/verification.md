# Authorized Staging native / same-Trip execution — 2026-09-11

Scope: #191/#192, PR #324. This is real named-Staging API and Simulator/browser
evidence with two disposable synthetic accounts. It does not close the parent Issues,
establish physical-device acceptance, or activate S2 Ask/provider/knowledge/worker.

## Version and authorization

- JT explicitly confirmed Preview-only native flags, server proof key, exact-host WAF
  allowance, two synthetic accounts and their exact cleanup; subsequently delegated
  development permission management. No Production merge/release was authorized here.
- Backend: `f5db769fbcca7b24fd6aeebf8dc004b63df1c2b8`, deployment
  `dpl_3ytna793zwLuHammHbSbq6zLNBYi`,
  `https://vp-v4-6gmyp6494-jtcao515s-projects.vercel.app`.
- Native app: `c333d9b5619a92fd90fe0a4f76743022f3746a50`, ad-hoc signed,
  iOS26.5 / iPhone17Pro Simulators. The difference after backend SHA is native
  test-environment wording only; the installed plist points to the exact host above.
  `native-build.json` records the actual build, not a hypothetical setting.
- Source CI: Quality34568907964 and Native34568908000 passed on c333d9b;
  the earlier f5 backend Quality34566242432 and Native34566242414 passed.
  Later automatic Preview URLs were not added to the maintenance allowlist and
  are not this execution's target.
- Named Supabase Staging: `dzqdzetcctkhbrhlxxgn`, Singapore, existing33 migrations.
  No migration, public-key binding, provider, paid call or real-user record changed.

## Configuration execution

Three new variables are restricted to Preview branch `codex/s1-s2-resume-20260911`:
`VISEPANDA_NATIVE_STAGING`, `VISEPANDA_TRIP_PROTOCOL_V2`, and server-only
`VISEPANDA_NATIVE_STAGING_PROOF_KEY`. Official CLI credentials were read in memory;
the proof key went through stdin and was never printed, stored locally or embedded
in the app. Only the fresh-password proof RPC uses this key. All Trip/profile actions
below used ordinary owner or other-account JWTs and existing RLS.

The existing WAF rule retained its seven approved hosts and all other settings;
only the exact deployment host above was added. Active version2 became3, with no
remaining draft. Canonical content comparison was repeated before publication.
This is drift detection, not server-side atomic CAS. `after.json` verifies the three
branch variables, active WAF and unchanged Production target after account cleanup.
The approved Preview configuration remains available for continued development.

The earlier runbook's numeric-version activation recipe was incorrect: a request
without JSON returned415 and the numeric path with JSON returned404. Inspection of
official CLI59.15.1 showed activation uses literal `draft` and a JSON empty object.
After re-reading and comparing the owned complete draft, official `firewall publish`
succeeded. The runbook is corrected; failed attempts are not counted as activation.

## Actual results

`api-results.json` records successful real remote assertions:

- Password proof/login, ordinary owner profile, refresh preserving mobile epoch.
- Second login denies old JWT and old refresh; direct profile reads cannot recover
  access. Independent Web cookie remains valid. A different owner cannot read profile.
- Native HTTP creates one Trip and Day/Item proposal; no confirmed mutation before
  explicit confirmation. Web revises it; old digest is rejected. Concurrent same-key
  confirmation yields applied + already_applied; later replay does not apply twice.
- Reciprocal Web/native v2 content matches. Rejection and stale base preserve content.
  Other-account Trip/proposal/snapshot reads and proposed writes are denied.

`ui-verification.json` records actual installed-app and in-app-browser operations:

- Phone A login/profile, refresh, process termination and relaunch: Keychain restores
  the same account without entering credentials again.
- Chinese Web edits the existing item and displays a proposal while confirmed v2
  stays unchanged. English iOS reviews the same before/after and explicitly confirms
  through its confirmation dialog. Both reload v3. Web preserves its old draft and
  displays the server-version conflict instead of silently rebasing it.
- iOS edits the item and creates a proposal; English Web displays its exact diff and
  explicitly confirms. Both read v4. Relaunched Chinese A and English B display the
  same persisted Trip/content. Initial Trip creation was tested through native HTTP,
  not separately through the Swift Create button in this remote run.
- Phone B signs into the same account. A's next Trip reload is denied and hides all
  Trip content; Profile shows replaced/expired and no private profile. Retry does not
  recover the old session. The browser's pre-existing login still reads v4.
- zh/en Web interactions and DOM width checks at390×844 and1280×800 show no horizontal
  overflow; captured browser warnings/errors are empty. Native zh/en normal-size
  screenshots were inspected. Private screenshot/AX hashes are in the manifest.

## Failures and remaining limits

- The first harness profile table upsert correctly failed RLS42501. The harness was
  corrected to the accepted ordinary `save_user_profile` RPC; no permission/RLS change
  or privileged data-write fallback was used.
- Simulator startup was slow under host load. An owned A launch interrupted by an
  intentional shutdown failed; subsequent boot/launch succeeded. B's first boot took
  about6 minutes. Existing user/other-run Simulators were not stopped or deleted.
- Simulator input/clipboard failures caused rejected login attempts. Exact secure
  field input then succeeded. Chinese IME inserted thin spaces into the synthetic
  item title; both clients preserved that exact content. This is not an ASCII keyboard
  acceptance claim. No user's clipboard contents were saved as a Trip change.
- In-app-browser full-page capture duplicated strips; the1280 screenshot was clipped
  to its host panel. Neither artifact establishes complete desktop visual acceptance.
  Actual viewport screenshots and DOM overflow measurements are separate from the
  earlier successful local desktop/390 browser suite.
- Web locale switching leaves an earlier status message in the prior language until
  another operation updates it. This observed UI gap remains under #192; the remote
  run is not a complete bilingual UI sign-off. Reload also retains existing zh default.
- Physical device, iOS17, VoiceOver, maximum text, remote natural token expiry, deliberate
  network-loss/unknown-ack UI injection and Swift Create-button remote acceptance were
  not run here. Existing local security/consumer evidence is not relabeled as remote.

## Cleanup

Both synthetic accounts and their owned Trip/events/audits were deleted by exact
record IDs after verifying their test-run metadata. `cleanup.json`: owned accounts0,
owned Trips0; original account count3, Trip count2, migration count33/latest
`20260910190658` match the preflight. No original account or Trip was selected for
mutation; counts are not represented as a new byte-level audit of original contents.
Both owned Simulators were shut down and deleted. The private test-password/token file
was removed and UI-session credential references cleared. No test credentials or
synthetic account/Trip IDs are included in repository evidence.

Production target remains `dpl_5BfUUQZxrCXTUcTp8QMb9MQfLu64`. PR #324 remains unmerged.
S2 PR #325 independently has green CI and local real native-HTTP proof; it is not
deployed-provider or end-to-end Ask acceptance.
