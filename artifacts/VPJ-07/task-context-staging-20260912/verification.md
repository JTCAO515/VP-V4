# Task context Staging — 2026-09-12

PR330 (`9694a7c` source, merged `3029a6a`) passed Quality34647337319,
Budget34647337363 and Vercel before merge. Existing Staging branch was merged
to tree-identical main at `b542eadff6a5057445c6d3311ebd5d166c0dad55`;
Preview `dpl_5eBh1Exfo4W8rXEh1T3AazJnUjXW` is READY in iad1.

## Migration and permission observations

- AES-GCM backup recovered from Keychain and restored in a network-none, zero-port
  container. All72 table digests and230 schema/permission entries matched; the
  temporary restore container was removed.
- Dry-run admitted only migration38. Apply and postcheck preserved all72 original
  tables,6 accounts,3 Trips and all prior schema entries except the five reviewed
  functions. Old policies remained `current_input_v1`.
- Permission checks passed for private tables/helpers, service-only claim/dispatch,
  authenticated-only policy read, absence of PUBLIC execution and both new triggers.
  `security-before-policy.json` was recorded before adding the new context policy.
- One new immutable task-history policy was installed with distinct bilingual notice,
  version and hash. Recipient, region, terms, expiry and retention matched the prior
  policy; old policy/consent/budget snapshots remained unchanged. No user consent was
  installed through privileged SQL.
- Only `VISEPANDA_NATIVE_STAGING_TASK_POLICY` was added to the existing Preview
  branch. All other environment entries, domain mapping, WAF and production target
  ID remained unchanged. Two existing synthetic owners then used ordinary native
  credentials/login, read the exact notice and accepted it through the v3 consent API.

## Candidate v1: FAIL, retained

The fixed bilingual room-layout case omitted current facing direction. Both real
Qwen outputs returned `answered` and instructed a180-degree turn. English stated
this outright; Chinese gave the instruction before adding a conditional explanation.
This does not justify the missing initial direction. The expected clarification
was absent, so neither second Turn was submitted. No fake clarification parent,
new budget reset or same-version reroll was used.

Two attempts settled, one per task, with zero unresolved costs. Conservative tariff
cost CNY0.010776, not a supplier invoice or user charge. Exact replay and opposite
owner exclusion passed; no multi-turn semantic acceptance follows from these checks.
The original fixed cases, raw synthetic answers and cost aggregates are retained
beside this file. The next candidate changes the missing-condition prompt rule;
its result must be measured separately against the retained cases.

Independent code, migration execution and policy/worker/runner reviews found no
Critical/Important issue. This is scoped Staging API evidence. SwiftUI v3, full
#195/S2, earlier courtesy/live-channel quality regressions, persistent unattended
worker operation and physical-phone follow-up are not accepted here.

Rollback disables v3/context worker while preserving migrations, consent history,
task records and budget pins. It must never replay these Turns as new user goals.

## Candidate v2: FAIL, withdrawn

Worker `65baeb23563b74d3d73ff43f2802538ad6b582e6` used the explicit missing-condition
rule in `vp-task-response-v2`, against the same API, policy and byte-identical cases.
English still asserted a180-degree turn. Chinese described conditional directions
but selected `answered` and appealed to an implied starting premise instead of
asking for it. Neither second Turn was admitted. Exact replay and other-owner
exclusion passed, but neither establishes semantic or multi-turn acceptance.

Both attempts settled without unresolved cost: CNY0.014436 at the conservative
configured tariff, not supplier invoice or user charge. Across both candidates:
four attempts, CNY0.025212. The ineffective prompt change was withdrawn. Runtime
remains v1; this PR retains observed failures and does not claim a quality fix.
Further provider evaluation requires a distinct bounded change and retained cases;
no same-version retry or changed expected outcome is justified by these results.
