# Bounded Qwen thinking preparation — 2026-09-12

Runtime source: `ddc807779e69e84d3484ec4daa6a214e7e678872`.

The existing task-context fixed cases failed two non-thinking prompt candidates.
This increment introduces an explicit job/3 candidate configuration while preserving
job/1 and job/2. The subsequent two-call Staging observation below uses existing
policy, recipient and budgets; no migration, native input or default activation is added. Exact retained cases remain under
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

## Limits and real Staging observation

The total output cap is transmitted using max_completion_tokens; thinking_budget
selects a smaller reasoning allowance. The configured reserve includes the complete
output cap once, and usage normalizes completion tokens without adding reasoning
again. Above-cap, truncated or invalid JSON responses fail closed and keep the
existing unknown-cost treatment. No reasoning text is stored or shown.

A fresh read-only preflight confirmed the same b542ead API under
staging.go2china.space, the existing context policy and two synthetic scopes:
unexpired/enabled, zero unresolved costs and sufficient capacity, without any
configuration change. The frozen worker df6ee24 used task prompt v1, thinking512
and total completion1024, with exactly the prior pricing and budget. Existing
ordinary native consent was read and reused; no administrative consent was added.

Two actual Qwen requests completed and passed the strict JSON/usage parser.
Both selected answered rather than the frozen expected clarification, so neither
second Turn was submitted. English made its180-degree instruction conditional on
facing north; Chinese added a face-north step before turning around. The Chinese
sequence can reach the target: this is a failed clarification-first criterion,
not proof that every sentence is factually wrong. Neither output establishes the
required same-task clarification continuation. The retained cases were not edited
and the failed version was not rerolled. See [results](results.json) and
[byte-identical cases](cases.json).

Both one-attempt tasks settled with zero unresolved costs; combined conservative
CNY0.034992, not a supplier invoice or user charge. Replay and other-owner exclusion
passed. [Budget receipt](budget.json). Success on these two bounded responses does
not establish universal provider adherence to every output limit or overall model
quality. Full #195/S2 remains open. Rollback uses job/2; no ledger, prior attempt,
consent or service goal is reset. The experimental option remains explicit only.
