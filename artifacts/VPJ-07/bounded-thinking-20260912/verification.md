# Bounded Qwen thinking preparation — 2026-09-12

Runtime source: `ddc807779e69e84d3484ec4daa6a214e7e678872`.

The existing task-context fixed cases failed two non-thinking prompt candidates.
This increment introduces an explicit job/3 candidate configuration while preserving
job/1 and job/2. It adds no provider calls, policy, recipient, migration, native input
or default activation. Exact retained cases remain under
[task-context Staging evidence](../task-context-staging-20260912/verification.md).

## Checks

- Source lint and TypeScript checks passed.
- Full contract suite244pass, zero skips.
- Full security suite136pass, one existing missing-disposable-database skip;
  aggregate is INCOMPLETE, not complete database/RLS acceptance.
- Actual loopback HTTP transport4pass, zero skips: normal completion, credential/body
  redirect exclusion, deadline/cancel and oversize rejection. These cases retain
  legacy protocol behavior, not real thinking-model acceptance.
- Targeted protocol/job/scoped-worker33pass, zero skips, independently reproduced.
  New cases cover complete-output cap, no reasoning disclosure, invalid mode/bounds,
  insufficient reserve, generation receipts and the complete task claim/authorization/
  dispatch/completion path. Denied authorization sends nothing.
- Independent data/cost/shared-contract review: Critical0 / Important0 at exact source.

Official sources checked on2026-09-12:
[combined output parameter](https://help.aliyun.com/en/model-studio/deep-thinking),
[Qwen pricing](https://help.aliyun.com/en/model-studio/model-pricing).
The Beijing pinned Qwen3.7 Plus snapshot has the same listed CNY6 input/CNY24 output
highest tier per million tokens for thinking and non-thinking. Actual configured
pricing and budget are still required; this does not prove supplier invoice amounts.

## Limits and next observation

The total output cap is transmitted using max_completion_tokens; thinking_budget
selects a smaller reasoning allowance. The configured reserve includes the complete
output cap once, and usage normalizes completion tokens without adding reasoning
again. Above-cap, truncated or invalid JSON responses fail closed and keep the
existing unknown-cost treatment. No reasoning text is stored or shown.

Real Qwen support for this parameter combination and strict JSON behavior is UNRUN.
The next experiment must use the retained fixed cases, a frozen job/3 configuration
and existing task-policy consent/budget; record both successes and failures without
repeating a failed version. Rollback uses job/2; no ledger, prior attempt, consent or
service goal is reset. Full #195/S2 remains open.
