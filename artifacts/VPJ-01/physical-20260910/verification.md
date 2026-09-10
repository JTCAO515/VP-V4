# VPJ-01 physical iPhone check — 2026-09-10

**The user accepted the physical operation they observed:** “真机实操我看了，没问题，可以标记完成了”. Record that manual acceptance as **PASS**. The narrower automated facts below remain distinct; the user confirmation is not fabricated evidence for unrun tests.

## Build and device

- Application source: merged commit `cbd9f87163405f53cddaece1f18b10e09f608c8d`.
- Device: connected, paired iPhone 17, iOS **26.6.2 (23G90)**, Developer Mode enabled.
- Installed variant: **VisePanda QA**, `space.go2china.VisePanda`, version **0.1.0**, build **18801**; built with Xcode 26.6 / iPhoneOS26.5 SDK.
- Application source was unchanged. Display name/build were command-scoped overrides; the read-only diagnostic was test-only and is preserved in `diagnostic.patch` for reproduction.
- Reused the one existing Apple Development identity and an existing Xcode-managed wildcard development profile that contains this device. The extracted signed certificate matched the existing identity; strict/deep signature verification passed. No new certificate, account or profile was requested; `-allowProvisioningUpdates` was not used.

The initial manual-signing attempt was rejected because the profile is Xcode-managed; the next attempt rejected a pinned certificate hash with automatic signing. Automatic signing using the existing “Apple Development” selector succeeded. These are retained in `commands.jsonl`; neither failure is marked successful.

## Actual operations and results

| Check | Result | Evidence boundary |
| --- | --- | --- |
| Signed device build, installation and launch | PASS | New QA bundle/container; no native API/account/model arguments |
| Real-device tests | PASS, 9 tests | 8 existing navigation contracts plus 1 read-only accessibility-state probe; these are not UI-navigation tests |
| User-observed physical operation | PASS | Explicit user acceptance quoted above |
| Xcode Computer Use | Observed | Opened the isolated project, inspected Test Navigator and connected-device destination; Devices window showed QA build18801 alongside both old build1 apps |
| Old applications preserved | PASS | `com.jt.visepanda` and `space.go2china.visepanda.ios` remained version0.1.0/build1; neither was overwritten or deleted |
| Automated English/Chinese device navigation | UNRUN | User accepted the demonstrated operation before this larger suite was started |
| Device text-size switching / Reduce Motion switching | UNRUN | No system settings were changed |
| Full physical accessibility audit | UNRUN | The state probe is not an audit |
| Actual VoiceOver speech/gestures | UNRUN | VoiceOver was off; no listening/reading claim is made |
| Publishable App screenshot | UNRUN | Final Xcode screenshot showed automatic lock screen, not the QA App; it was excluded and the temporary capture removed |

The actual state probe read: normal category `UICTContentSizeCategoryL`, body17pt, light appearance, Reduce Motion off, VoiceOver off, Bold Text off, Reduce Transparency off; native network activation false. No global display/accessibility setting was changed, so no settings reset was needed. The phone subsequently auto-locked; it was not unlocked or reset by the agent.

No user login, real Trip import, model call, local-only service activation, production action or old-App data access occurred. The prior iOS17.5 audit failures and maximum-size contrast diagnostic FAIL are not reclassified by this iPhone26.6.2 check. Issue-level acceptance updates belong to the coordinating task.

## Remaining VoiceOver check, if later required

Use the newly installed **VisePanda QA**, keeping the two older apps intact. Record the original VoiceOver setting first. Enable VoiceOver in Settings → Accessibility → VoiceOver, then return to QA. Swipe right through Ask/Trip/Tools/Profile and listen to actual labels; double-tap to activate. In Profile, switch between Chinese and English and listen again; verify the disabled Send action is announced appropriately and focus remains usable. Restore the original VoiceOver setting afterward. This tutorial is **not** an executed test or a request to repeat the user's acceptance.

## Evidence and privacy

`verification.json` contains the explicit results, `binary-sha256.json` fingerprints the installed build, and `commands.jsonl` retains the command forms/exits. Device and signing identifiers are deliberately redacted from public evidence; exact commands/results remain in the private local QA cache. No lock-screen/private identifier screenshot is included. The diagnostic patch can be applied to the source commit, built using the same already-authorized signing material, and run on the designated physical device. The test source was restored after the probe; only evidence is committed.

`pnpm docs:check`, `git diff --check`, diagnostic patch applicability and the private-device-identifier scan passed. The temporary Xcode workspace state was preserved in the private QA cache after closing the QA window.
