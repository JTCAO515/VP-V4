# VPJ-07 native text consumer — local verification

Isolated branch `codex/native-text-ask`, base762c0b05c3b15d17b820b366828c0c26b5546c01.
Related to #195; no real provider/customer/remote acceptance or Issue closure.

## Executed checks

- Real local GoTrue → native HTTP → consent → atomic input → worker/budget/controlled HTTP →
  persisted answer/history: integration PASS. Covers unauthenticated/Cookie/Origin rejection,
  no orphan thread before consent, bad notice hash, duplicate submit with one model invocation,
  changed-body/unknown-field rejection, other-owner isolation, in-flight cancellation, terminal
  withdrawal and replaced-phone rejection. Four synthetic users are removed by exact IDs; the
  test's retained bodies remain hidden until the owned disposable instance is destroyed.
- All31 migrations applied in the new isolated local instance. No existing local or remote
  database was changed. The separate raw-SQL/lease/body suite passed22/22, with0skip.
- Node regressions: unit92, contract199, source E2E40 passed. Full security101 passed /0failed /
  1 explicit generic disposable-Supabase target skip; aggregate remains incomplete for that
  separate configured probe. The new real native-Auth integration is independently recorded.
- `pnpm check` passed: lint, typecheck, build and22 static tests. Local security advisor exit0; no new finding. Its
  sole WARN is the pre-existing invoker `private.ai10_confirm_fault_trigger` search_path,
  unchanged from migration20260825161535; it is not a new text consumer permission.

## Native runs and failures retained

- Xcode26.6 /17F113, iOS26.5, complete ad-hoc signing verified; no distribution signing.
  MCP could not resolve simctl under its inherited toolchain path. The repository runner uses
  a per-process DEVELOPER_DIR instead; global Xcode configuration was not changed.
- First full run was deliberately interrupted after independent review identified the
  busy-to-idle cold-start race. It reported20pass/3skip/1canceled test, exit73; this is not PASS.
  Its owned Simulator was deleted. The missing reload was fixed before rerunning.
- Second full run:24pass/8skip/2UI failures, exit65. The actual AX hierarchy showed the saved
  answer present, but a parent identifier replaced the child answer identifier. The unused
  parent identifier was removed; original answer and relaunch assertions remain intact.
- Independent review also found the active-nil to permanent-logout cleanup gap. The View now
  observes retained identity too; a real UIHostingController test exercises that production
  observer without manually resetting/reloading the store. The delayed-owner and temporary
  authentication state tests remain enabled in the complete default scheme.
- Final full signed native run: **27 passed /0 failed /8 existing environment skips**, exit0.
  Both English and Chinese UI tests accepted the notice, submitted text, inspected the actual
  answer and relaunched to reload it automatically. The real hosted-View permanent-clear test
  and delayed-owner/temporary-auth state tests passed. All13 runner commands succeeded; its
  owned Simulator was deleted. Four controlled HTTP model calls produced three completed
  results plus one cancelled in-flight request; relaunch did not create another model call.
- Screenshot inspection passed for the complete English notice and both reloaded result screens:
  [English notice](native-text/notice-en.png), [Chinese result](native-text/reloaded-zh.png),
  [English result](native-text/reloaded-en.png). These are visibly labelled local synthetic tests.
  No real-provider, maximum-type-size or physical-device acceptance is inferred.

## Limits and rollback

This uses synthetic text and a controlled model HTTP endpoint, not a real supplier or real-user
notice approval. New content stays out of any on-device file; accepted requests reload from SQL.
The existing eight environment-dependent native tests remain separately gated; no failures were
converted to skips. Full remote/physical/native accessibility/real-model acceptance remains open.

Disable the local consumer and revoke the applicable policy to stop processing; preserve applied
migration history, budget integrity and hidden retained records. No global config, original
worktree, real data recipient, paid invocation or production migration was changed.
