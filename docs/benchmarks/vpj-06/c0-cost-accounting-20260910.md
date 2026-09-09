# C0 experiment budget accounting v1 — 2026-09-10

Applies only to the operator-approved, wholly synthetic text campaign20260910 and its
isolated local ledger. It grants no real-user billing, invoice acceptance, new provider,
recharge or higher cap. Each provider remains capped at CNY30, campaign total CNY90.

Before dispatch, reserve a conservative full-model/context bound. After a complete valid
usage receipt, this C0 flow may debit `validated_usage_at_published_upper_tariff`: all input
is priced as uncached at the highest published standard tier, output includes any reasoning
tokens included in completion_tokens, and the sum rounds upward to integer micro-CNY.
No promotional/off-peak/cache discount is assumed. Explicit caching, search, media and
other separately billed features are absent; if an uncovered billing dimension or add-on
appears, retain the full hold rather than inferring zero.

| Provider/model | Input CNY/M | Output CNY/M | Bound source |
| --- | ---: | ---: | --- |
| qwen3.7-plus-2026-05-26 | 6 | 24 | [Qwen model page](https://www.qianwenai.com/models/qwen3.7-plus), highest256K–1M tier, standard before8折; [official alias/snapshot mapping](https://help.aliyun.com/zh/model-studio/model-pricing) |
| glm-5.3-flash | 0.8 | 2.8 | [BigModel pricing](https://bigmodel.cn/pricing), current standard Flash row,1M context |
| deepseek-v4-flash | 3 | 9 | [DeepSeek pricing](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/), high-traffic standard rate,1M context |

Price version:20260910-published-max-v1. Usage must contain nonnegative integer prompt,
completion and total values with prompt+completion=total. Optional missing breakdowns
stay unknown; pricing all prompt tokens uncached is conservative, not a fabricated cache
count. A timeout, missing usage, malformed count or HTTP400 without usage remains pending.

For this versioned C0 flow only, the ledger RPC field `actual_micros` stores the conservative
**budget debit**, not an assertion about the provider invoice or wallet deduction. Before
settling, persist a sidecar receipt containing attemptId, usage, rates/priceVersion,
rounding=ceil_to_micro_cny, costBasis, budgetDebitMicros and actualBilledCost=unknown.
Preserve the initial reservation and source result. Subsequent invoice differences are
separate reconciliation evidence; never overwrite an already settled debit, reuse an
attempt ID, reset the scope or silently release unknown charges. The existing conflicting
settlement protection remains unchanged.

This is a controlled experiment accounting interpretation, not a change to customer
ServiceTask consumption. Public-tariff cost bounds may be reported as bounds only;
actual billed cost and semantic quality/human calibration remain separate evidence.
