# Compact handoff and bounded planning CI

User request: start the 2026-09-17 engineering optimization plan. This is one tooling/maintenance
increment, separate from the active #359 product work and #433's product acceptance additions.

## Result and scope

- Generate a compact CONTEXT with the recorded status, stage, next action and links to full
  decisions, blockers, UNRUN and evidence. HANDOFF remains the complete generated view.
- Add a read-only docs check that rejects stale or manually edited generated output and gives
  the existing regeneration command. It does not fetch GitHub or infer that recorded state is live.
- Extend the existing documentation CI path to the explicitly named master plan, brand/experience
  planning pages and the single #433 planning receipt. Validate the receipt's closed metadata shape;
  no arbitrary artifact pattern, runtime fixture or unknown document becomes allowlisted.
- Retain all full-scope checks for code, migrations, contracts, workflow/tooling, mixed changes,
  renamed runtime files, missing Git comparison objects and manual runs. This tooling PR itself
  uses the full existing CI path.

The handoff source is unchanged: #433 and #434 have parallel updates to it, and its complete
history must not be replaced by a maintenance snapshot. Regenerating HANDOFF also brings in the
already-recorded round-17 entries missing from main's old generated output. No historical
verification, licence, migration, user file, runtime flag or production guard is removed.

## Local verification

- Existing and added governance checks: 66 pass, no failures/skips. New behavioral coverage
  includes source/output drift without mutation, retention of complete evidence/UNRUN,
  valid/invalid planning metadata, and real temporary-Git rename and missing-base cases.
- Source-policy lint, docs check, syntax and whitespace checks are the applicable local checks.
- The #433 file set can be evaluated with the new classifier; this is classification evidence,
  not a measured reduction of an already-completed GitHub run. Product code is unchanged;
  required CI results are recorded on this PR, not inferred from local governance checks.
- On the latest main handoff source, the prior full-context format is 62,169 bytes;
  the compact CONTEXT is 3,717 bytes. This is a file-size
  measurement only; it does not establish model latency, answer quality or paid-token savings.

## Runner observation and remaining work

Read-only GitHub observation on 2026-09-17: the public repository uses a self-hosted macOS/ARM64
native job; the fork contributor approval policy is `first_time_contributors`. Two runners were
registered (one online, one offline). This is not an audit of host secrets or isolation and does
not prove exploitation. Further native-runner trust/ephemeral-isolation work requires its own
concrete implementation and validation; this PR does not change account policies or runners.

Source-history pruning, LFS/history rewriting, object-storage migration, source-handoff archival,
native trigger changes and runtime refactors remain outside this bounded increment. Future
source changes still need factual reconciliation with live task state, not merely regeneration.

## Integration and rollback

No new Issue or VPJ row is needed for this explicit maintenance request. Review this PR as
generator/checker/CI classification changes, and keep #433/#434 product decisions and evidence.
PR #434 was merged while this work was in progress; the branch was rebased and regenerated
from main@8f3f8ce. After another source update merges, regenerate before integrating this maintenance
branch; do not choose one side's entire generated file over newer source data.

Rollback reverts the tooling/classifier change, preserves the latest handoff JSON, and regenerates
the old view from that latest source. Do not restore an old source snapshot or disable asset checks.
Merge and production execution retain their existing separate authority.
