# VPJ-76 冻结评测集（真实模型：Qwen qwen3.7-plus-2026-05-26，命名具体地点后重测）

32 个场景真实跑通（跳过 2 个纯机制性场景：provider_failure/budget_exhausted，无法用真实模型脚本化触发）。

准确率 84.4%（27/32 匹配预期真值）。地点类场景单独：6/6 匹配。覆盖率 90.6%。p50 4358.8ms / p95 7039.1ms（真实网络+模型延迟）。累计真实 usage token：52980。

判定：PARTIAL。

## 与预期不符的场景

- rail_boarding_documents-en: 预期 answered，实际 unavailable/retrieval_miss
- payment_card_and_cash-zh: 预期 answered，实际 answered
- payment_card_and_cash-en: 预期 answered，实际 answered
- payment_getting_started-zh: 预期 answered，实际 answered
- payment_getting_started-en: 预期 answered，实际 answered

- rail_boarding_documents-zh [development]: full_coverage → answered (3 rounds, 6691.8ms, covered 2/2)
- rail_boarding_documents-en [holdout]: full_coverage → unavailable/retrieval_miss (? rounds, 3173.8ms, covered 0/2)
- payment_card_acceptance-zh [holdout]: full_coverage → answered (2 rounds, 3765.8ms, covered 1/1)
- payment_card_acceptance-en [development]: full_coverage → answered (2 rounds, 4443ms, covered 1/1)
- payment_mobile_setup-zh [development]: full_coverage → answered (2 rounds, 4358.8ms, covered 1/1)
- payment_mobile_setup-en [holdout]: full_coverage → answered (2 rounds, 4591.9ms, covered 1/1)
- payment_cash_access-zh [holdout]: full_coverage → answered (2 rounds, 4634.5ms, covered 2/2)
- payment_cash_access-en [development]: full_coverage → answered (2 rounds, 4142.2ms, covered 2/2)
- payment_card_and_mobile-zh [development]: full_coverage → answered (2 rounds, 4383.4ms, covered 2/2)
- payment_card_and_mobile-en [holdout]: full_coverage → answered (2 rounds, 4191.3ms, covered 2/2)
- payment_card_and_cash-zh [holdout]: full_coverage → answered (3 rounds, 4998.9ms, covered 2/3)
- payment_card_and_cash-en [development]: full_coverage → answered (3 rounds, 6130.1ms, covered 2/3)
- payment_mobile_and_cash-zh [development]: full_coverage → answered (2 rounds, 5635.3ms, covered 3/3)
- payment_mobile_and_cash-en [holdout]: full_coverage → answered (3 rounds, 7039.1ms, covered 3/3)
- payment_getting_started-zh [holdout]: full_coverage → answered (3 rounds, 5566ms, covered 1/4)
- payment_getting_started-en [development]: full_coverage → answered (3 rounds, 5217.2ms, covered 1/4)
- connectivity_sim_documents-zh [development]: full_coverage → answered (2 rounds, 4134.9ms, covered 1/1)
- connectivity_sim_documents-en [holdout]: full_coverage → answered (2 rounds, 3714.7ms, covered 1/1)
- connectivity_plan_allowances-zh [holdout]: full_coverage → answered (2 rounds, 3838ms, covered 1/1)
- connectivity_plan_allowances-en [development]: full_coverage → answered (2 rounds, 4211.4ms, covered 1/1)
- connectivity_getting_started-zh [development]: full_coverage → answered (3 rounds, 6140.6ms, covered 2/2)
- connectivity_getting_started-en [holdout]: full_coverage → answered (3 rounds, 5858.8ms, covered 2/2)
- place_address-zh [holdout]: full_coverage → answered (2 rounds, 3851.5ms, covered 0/0)
- place_address-en [development]: full_coverage → answered (2 rounds, 4008.3ms, covered 0/0)
- place_opening_hours-zh [development]: full_coverage → answered (2 rounds, 4009.9ms, covered 0/0)
- place_opening_hours-en [holdout]: full_coverage → answered (2 rounds, 4236.9ms, covered 0/0)
- place_address_and_hours-zh [holdout]: full_coverage → answered (2 rounds, 3768.9ms, covered 0/0)
- place_address_and_hours-en [development]: full_coverage → answered (2 rounds, 3882.2ms, covered 0/0)
- diversity-missing-content-zh [development]: missing_content → unavailable/missing_content (? rounds, 0ms, covered 0/1)
- diversity-retrieval-miss-en [holdout]: retrieval_miss → unavailable/retrieval_miss (? rounds, 3072.7ms, covered 0/1)
- diversity-partial-coverage-zh [holdout]: partial_coverage → answered (3 rounds, 7922.7ms, covered 2/2)
- diversity-getting-started-partial-en [development]: partial_coverage → answered (3 rounds, 4918.2ms, covered 1/4)
