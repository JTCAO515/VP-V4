# VPJ-76 冻结评测集（真实模型：GLM-5.3-flash）

32 个场景真实跑通（跳过 2 个纯机制性场景：provider_failure/budget_exhausted，无法用真实模型脚本化触发）。

准确率 65.6%（21/32 匹配预期真值）。覆盖率 75%。p50 11847.3ms / p95 25371.2ms（真实网络+模型延迟）。累计真实 usage token：59474。

判定：PARTIAL。

## 与预期不符的场景

- rail_boarding_documents-en: 预期 answered，实际 unavailable/retrieval_miss
- payment_mobile_setup-en: 预期 answered，实际 unavailable/provider_failure (MODEL_OUTPUT_INVALID)
- payment_cash_access-en: 预期 answered，实际 unavailable/provider_failure (MODEL_OUTPUT_INVALID)
- payment_mobile_and_cash-en: 预期 answered，实际 answered
- payment_getting_started-zh: 预期 answered，实际 answered
- payment_getting_started-en: 预期 answered，实际 answered
- place_address-zh: 预期 answered，实际 unavailable/retrieval_miss
- place_address-en: 预期 answered，实际 unavailable/retrieval_miss
- place_opening_hours-zh: 预期 answered，实际 unavailable/retrieval_miss
- place_opening_hours-en: 预期 answered，实际 unavailable/retrieval_miss
- diversity-retrieval-miss-en: 预期 unavailable，实际 answered

- rail_boarding_documents-zh [development]: full_coverage → answered (2 rounds, 11852.5ms, covered 2/2)
- rail_boarding_documents-en [holdout]: full_coverage → unavailable/retrieval_miss (? rounds, 14918ms, covered 0/2)
- payment_card_acceptance-zh [holdout]: full_coverage → answered (2 rounds, 12980.8ms, covered 1/1)
- payment_card_acceptance-en [development]: full_coverage → answered (2 rounds, 9122.7ms, covered 1/1)
- payment_mobile_setup-zh [development]: full_coverage → answered (2 rounds, 14782.6ms, covered 1/1)
- payment_mobile_setup-en [holdout]: full_coverage → unavailable/provider_failure (? rounds, 25905ms, covered 0/1)
- payment_cash_access-zh [holdout]: full_coverage → answered (2 rounds, 10678.6ms, covered 2/2)
- payment_cash_access-en [development]: full_coverage → unavailable/provider_failure (? rounds, 1896.9ms, covered 0/2)
- payment_card_and_mobile-zh [development]: full_coverage → answered (2 rounds, 16970ms, covered 2/2)
- payment_card_and_mobile-en [holdout]: full_coverage → answered (2 rounds, 9384.2ms, covered 2/2)
- payment_card_and_cash-zh [holdout]: full_coverage → answered (2 rounds, 10379.1ms, covered 3/3)
- payment_card_and_cash-en [development]: full_coverage → answered (2 rounds, 24443.9ms, covered 3/3)
- payment_mobile_and_cash-zh [development]: full_coverage → answered (2 rounds, 14896.4ms, covered 3/3)
- payment_mobile_and_cash-en [holdout]: full_coverage → answered (2 rounds, 6734.9ms, covered 2/3)
- payment_getting_started-zh [holdout]: full_coverage → answered (2 rounds, 9425.3ms, covered 1/4)
- payment_getting_started-en [development]: full_coverage → answered (2 rounds, 24214.6ms, covered 1/4)
- connectivity_sim_documents-zh [development]: full_coverage → answered (2 rounds, 7145.8ms, covered 1/1)
- connectivity_sim_documents-en [holdout]: full_coverage → answered (2 rounds, 14049.8ms, covered 1/1)
- connectivity_plan_allowances-zh [holdout]: full_coverage → answered (2 rounds, 8574.7ms, covered 1/1)
- connectivity_plan_allowances-en [development]: full_coverage → answered (2 rounds, 7256.3ms, covered 1/1)
- connectivity_getting_started-zh [development]: full_coverage → answered (2 rounds, 15651.4ms, covered 2/2)
- connectivity_getting_started-en [holdout]: full_coverage → answered (2 rounds, 6517ms, covered 2/2)
- place_address-zh [holdout]: full_coverage → unavailable/retrieval_miss (? rounds, 5438.1ms, covered 0/0)
- place_address-en [development]: full_coverage → unavailable/retrieval_miss (? rounds, 4859.6ms, covered 0/0)
- place_opening_hours-zh [development]: full_coverage → unavailable/retrieval_miss (? rounds, 13932ms, covered 0/0)
- place_opening_hours-en [holdout]: full_coverage → unavailable/retrieval_miss (? rounds, 10979.3ms, covered 0/0)
- place_address_and_hours-zh [holdout]: full_coverage → answered (2 rounds, 20598.8ms, covered 0/0)
- place_address_and_hours-en [development]: full_coverage → answered (2 rounds, 25371.2ms, covered 0/0)
- diversity-missing-content-zh [development]: missing_content → unavailable/missing_content (? rounds, 0.1ms, covered 0/1)
- diversity-retrieval-miss-en [holdout]: retrieval_miss → answered (2 rounds, 23643.8ms, covered 1/1)
- diversity-partial-coverage-zh [holdout]: partial_coverage → answered (2 rounds, 9688.6ms, covered 2/2)
- diversity-getting-started-partial-en [development]: partial_coverage → answered (2 rounds, 11847.3ms, covered 1/4)
