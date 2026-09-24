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
