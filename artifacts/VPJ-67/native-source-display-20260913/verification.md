# Native saved-payment source display — actual bilingual Staging evidence

At 2026-09-13 05:21 UTC, the signed native Staging app visibly expanded the Chinese
saved payment answer source. Screenshot `zh-source-open.png` shows the People’s Bank of
China publisher and locator “Printed pages 04–09 / PDF pages 5–10, 支付宝 and 微信支付”.
The source is displayed as an enabled native button. Opening the external PDF was NOT_RUN.

The displayed historical question is the frozen `mobile-fee` case, Turn
`8390985a-7820-46d6-82cb-ee4b5289c277`, ServiceTask
`1c18afbf-203f-40ad-8991-f3c607abffa8`. Association is from exact synthetic question text
in the native accessibility hierarchy and the prior evaluation recording; it is not a new
Task submission. The screenshot includes the following ATM question, not an answer asserting
current ATM availability. The original conditions and exclusions remain visible.

API Preview: `dpl_3vnNKwFgfzZhcUzPjZxN6KQpjREo`, runtime
`d15baf7a94a4740e6c2a801bb5bd2d58e3fd3059`. The previously verified full ad-hoc signed
Staging build was reused. Product source under ios/app/lib/components/supabase and dependency
manifests matches current main `ac67deba25e36a022d90627997c82d10c25ae0a4`; no product change.
Normal native login showed an active session and consent/readback succeeded. No new consent,
question submission, provider call, knowledge mutation or Trip write was performed.

Pre/post actual SQL: 43 migrations, 118 budget attempts, zero unresolved, 650346 recorded
CNY micros, 3 Trips. These unchanged counts do not independently prove full-row invariance.
Reader/Ops were off and active review members were zero before and after. WAF 48→49→50
changed only the owned Preview host; production target unchanged. The 20-minute read window
reached its deadline (exit 1), then successfully disabled reading and removed the host.
Do not report the window as a clean exit 0. Native Profile logout subsequently showed
“尚未登录”. The owned Simulator was shut down and retained for English follow-up.

Environment diagnosis: fresh Simulator first boot waited on CoreLocationMigrator’s synchronous
location-service reply. Sampling was retained privately; restarting only that Simulator’s
location service allowed the original boot process to finish at 8m31s. App launch then
completed normally. No global Xcode selection, migration flags or CI devices were changed.
An early availability placeholder cleared after the normal policy/history load. Earlier taps
and snapshots during refresh did not prove source expansion; only the final image does.

Chinese source expansion: PASS for this saved historical payment answer. English source
expansion subsequently passed as recorded below; full #206/#264/S2 remain open.
Checks for this evidence-only increment: docs check and diff check; no product tests repeated.

## English follow-up and interrupted-window cleanup

At 2026-09-13 07:05 UTC the same signed Staging build showed the English saved partial
payment answer and expanded its source. `en-source-open.png` visibly shows the People’s
Bank of China publisher and printed/PDF page locator. `en-source-open.json` records the
first partial answer, withdrawn-publication gap and PAY-02 fact. The historical native
Turn is `f96139fd-98f7-4f2a-8ff7-e2a917bc7e6e`, ServiceTask
`d57d7a0e-b80e-41c0-bc2c-42af166e6e41`; association uses the exact synthetic question and
prior `artifacts/VPJ-16/payment-ask-20260913/staging/scoped-audit.json` recording. No new
question/model call or consent change was performed. Normal Profile sign-out subsequently
showed `Signed out`; the owned Simulator was shut down and retained.

An earlier English window ended at 06:26 UTC with both cleanup commands failing. WAF
removal retry succeeded (version 52); reader shutdown retry failed because the local Docker
daemon was stopped. Starting Docker and retrying the same reader-disable operation succeeded:
reader/Ops false, zero active members, 12 statements / 11 published / 1 revoked. The initial
failed window remains FAIL; cleanup recovery does not rewrite it to a clean pass.

The fresh English retry window completed at 07:08 UTC with exit 0. WAF 52→53→54 changed only
the owned Preview host and preserved the production target. Pre/post SQL recorded 43
migrations, 118 attempts / zero unresolved, 650346 CNY micros and 3 Trips; reader/Ops off and
zero active members after cleanup. Counts are unchanged, not full-row invariance proof.

Both source disclosures are now observed in the actual native Staging app. External PDF
opening, physical-device payment acceptance and full #206/#264/S2 remain NOT_RUN/incomplete.
The English screenshot also exposes a formatting issue: the Reviewed date follows the device
Chinese locale despite English app selection. This does not invalidate visible source
provenance; localized date formatting remains a separate observed UI defect.
