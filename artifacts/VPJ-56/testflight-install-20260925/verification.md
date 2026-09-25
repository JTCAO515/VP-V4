# VPJ-56 TestFlight internal assignment and JTs17 install

Related to #237. Exact Apple-processed build: `0.1.0 (20260924.163820)`, bundle `space.go2china.VisePanda`, source commit `64a54155334825507301ddb9a33c80aaf7469375`. [Signed Archive/upload and processing](../signed-testflight-20260925/verification.md) were recorded separately.

## Internal assignment

On 2026-09-25, the existing **VisePanda Internal** group in the VisePanda App Store Connect record had one accepted tester and only old build `0.1.0 (1)`. Its distribution setting was manual. The device's TestFlight account was confirmed by live readback of that old group build after JT switched the App Store account; no personal email was copied to this evidence.

The exact new build `20260924.163820`, marked **Internal / Ready to Test**, was added to that existing group. App Store Connect readback then showed **1 tester / 2 builds** and the new build **Testing**. No new tester, external group, public link or App Store submission was created. [Group readback crop](group-assigned.png) contains only the group and build table.

## Device preflight

JTs17 is a paired, booted physical iPhone on iOS 27.0. TestFlight 4.3.1 is installed. CoreDevice reported existing VisePanda `0.1.0 (1)` as developer-built and container-accessible. Its app data container was copied to a mode-700 local temporary backup before any installation: 8 files, 13,876,061 bytes; file contents and the backup were not committed. [Preinstall summary](preinstall.json).

TestFlight on JTs17 displayed the exact new build `0.1.0 (20260924.163820)` as compatible and offered **Install**. Original-pixel crops show the [install action](device-install-action.png) and [exact build version](device-build-version.png) without the developer's name or account identifiers. This proves availability to the intended account on this device; it does not prove installation.

## Installation

Pending the required action-time confirmation for installing software through the device UI. No TestFlight install has been performed yet. Preserve the old app backup and do not claim #237 acceptance until the exact installed build and launch are observed.

## Later device readback and bounded retry (2026-09-25)

The Install button and exact-build screenshot above are **historical observations** from earlier on September 25. Main subsequently granted action-time authority for this exact build and JTs17, so the earlier confirmation wait is no longer the current blocker. After JT reported changing the phone's Media & Purchases Apple Account, TestFlight no longer listed either build and displayed an initial “无法完成你的请求。请重试。” error. This did not change the App Store Connect readback: the sole internal tester remained Accepted and `0.1.0 (20260924.163820)` remained Internal / Testing.

During one bounded retry, the iPhone status bar showed **5G**; that indicator alone does not prove Apple service reachability. Apple's [System Status](https://www.apple.com/support/systemstatus/) page did not yield a service list that could be assessed in the available read, so no outage or healthy-service conclusion was drawn. The initial error was dismissed once, TestFlight was reopened once, and the same welcome disclosure was continued once under main's specific authorization. The resulting client error was **“TestFlight 不可用：TestFlight 无法接入 App Store Connect。请重试。”** ([original UI crop](testflight-client-unavailable.png)). Its underlying network, account or Apple-service cause is **unknown**. There was no further retry, account change, invitation redemption, sideload or device installation.

CoreDevice still read the previously installed developer build as `0.1.0 (1)` before the retry. The mode-700 backup still contained 8 files and 13,876,061 bytes. TestFlight client reachability and target-build readback **FAIL** at the end of this run; the earlier Install-button screenshot must not be used as proof of current availability. Installation, installed-version readback, launch and post-install data checks are **UNRUN**. #237 remains open.

## JT's later Wi-Fi install attempt (2026-09-25 08:36 Asia/Shanghai)

JT reported switching the phone's Media & Purchases account, reopening TestFlight, and then tapping **Install** on the exact internal build. His phone screenshot shows a Wi-Fi status icon, `VisePanda 0.1.0 (20260924.163820)` with the Install action, and the error **“无法安装‘VisePanda’。所请求的 App 不可用或者不存在。”** The [build/error crop](device-install-failed.png) and [status-bar crop](device-wifi-indicator.png) are original pixels from that screenshot; both omit the avatar and desktop contents. This is a **FAIL** for the TestFlight installation attempt. The earlier 5G “cannot connect to App Store Connect” result remains historical; Wi-Fi allowed the build to be listed but did not complete its download/install.

CoreDevice read the installed `space.go2china.VisePanda` after JT's failed attempt as **`0.1.0 (1)`**, still marked developer-built. The original mode-700 local backup remained present with 8 files and 13,876,061 bytes. No target build install, target launch, or post-install data behavior was observed. Those latter checks are **UNRUN**, and #237 remains open.

The last authenticated App Store Connect observations before this attempt were upload **Complete**, binary **Validated**, one Accepted tester in the existing manually distributed **VisePanda Internal** group, and target build **Internal / Testing**, with about 90 days before expiry. The archived app's minimum iOS version was 17.0; JTs17 is on iOS 27.0. An App Store Connect browser read after JT's screenshot redirected to Apple sign-in, so current group/build/agreements status could not be independently refreshed. The screenshot itself proves device-side listing at 08:36, not backend package availability or agreement status. The error's root cause is **unknown**. Possibilities to investigate include Apple package availability or a device/account entitlement issue; there are no install logs or authenticated agreement readback to choose between them. Do not remove the old developer build or repeat installation merely to clear this error.
