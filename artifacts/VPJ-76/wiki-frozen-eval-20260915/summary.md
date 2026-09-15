# VPJ-76 冻结评测集（fixture 模式）

34 个场景：中文17条，英文17条；development 17条，holdout 17条。

覆盖率 90.9%，过拒答率 9.1%（相对同批结构化/直接读取baseline，共3条分歧，均为刻意构造的 retrieval_miss/budget_exhausted 场景）。p50 0.156ms / p95 1.05ms（fixture transport，非真实网络/模型延迟）。累计 usage token：960（fixture声明值，非真实计费）。

判定：PASS。真实模型/真实数据库一轮尚未做，见本目录 README。

- rail_boarding_documents-zh [development]: full_coverage → answered (covered 2/2)
- rail_boarding_documents-en [holdout]: full_coverage → answered (covered 2/2)
- payment_card_acceptance-zh [holdout]: full_coverage → answered (covered 1/1)
- payment_card_acceptance-en [development]: full_coverage → answered (covered 1/1)
- payment_mobile_setup-zh [development]: full_coverage → answered (covered 1/1)
- payment_mobile_setup-en [holdout]: full_coverage → answered (covered 1/1)
- payment_cash_access-zh [holdout]: full_coverage → answered (covered 2/2)
- payment_cash_access-en [development]: full_coverage → answered (covered 2/2)
- payment_card_and_mobile-zh [development]: full_coverage → answered (covered 2/2)
- payment_card_and_mobile-en [holdout]: full_coverage → answered (covered 2/2)
- payment_card_and_cash-zh [holdout]: full_coverage → answered (covered 3/3)
- payment_card_and_cash-en [development]: full_coverage → answered (covered 3/3)
- payment_mobile_and_cash-zh [development]: full_coverage → answered (covered 3/3)
- payment_mobile_and_cash-en [holdout]: full_coverage → answered (covered 3/3)
- payment_getting_started-zh [holdout]: full_coverage → answered (covered 4/4)
- payment_getting_started-en [development]: full_coverage → answered (covered 4/4)
- connectivity_sim_documents-zh [development]: full_coverage → answered (covered 1/1)
- connectivity_sim_documents-en [holdout]: full_coverage → answered (covered 1/1)
- connectivity_plan_allowances-zh [holdout]: full_coverage → answered (covered 1/1)
- connectivity_plan_allowances-en [development]: full_coverage → answered (covered 1/1)
- connectivity_getting_started-zh [development]: full_coverage → answered (covered 2/2)
- connectivity_getting_started-en [holdout]: full_coverage → answered (covered 2/2)
- place_address-zh [holdout]: full_coverage → answered
- place_address-en [development]: full_coverage → answered
- place_opening_hours-zh [development]: full_coverage → answered
- place_opening_hours-en [holdout]: full_coverage → answered
- place_address_and_hours-zh [holdout]: full_coverage → answered
- place_address_and_hours-en [development]: full_coverage → answered
- diversity-missing-content-zh [development]: missing_content → unavailable/missing_content (covered 0/1)
- diversity-retrieval-miss-en [holdout]: retrieval_miss → unavailable/retrieval_miss (covered 0/1)
- diversity-partial-coverage-zh [holdout]: partial_coverage → answered (covered 1/2)
- diversity-provider-failure-en [development]: provider_failure → unavailable/provider_failure (covered 0/1)
- diversity-budget-exhausted-zh [holdout]: budget_exhausted → budget_exhausted
- diversity-getting-started-partial-en [development]: partial_coverage → answered (covered 2/4)
