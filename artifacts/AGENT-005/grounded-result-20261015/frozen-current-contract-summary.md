# VPJ-76 冻结评测集（fixture 模式）

34 个场景：中文17条，英文17条；development 17条，holdout 17条。

覆盖率 72.7%，过拒答率 27.3%（相对同批结构化/直接读取baseline，共9条分歧，包含未解析地点对象、retrieval_miss 与 budget_exhausted；分母与原baseline保持不变）。p50 0.147ms / p95 0.932ms（fixture transport，非真实网络/模型延迟）。累计 usage token：780（fixture声明值，非真实计费）。

当前合同 grounded-result-contract/2 判定：PASS；原冻结预期判定：FAIL（保留原差异，不将原FAIL称为PASS）。真实模型一轮已做（GLM，见 ../wiki-frozen-eval-real-model-20260916/verification.md）；真实数据库一轮仍未做，见本目录 README。

- rail_boarding_documents-zh [development]: full_coverage → answered (covered 2/2); legacy=answered/ match=true; current=answered/ match=true
- rail_boarding_documents-en [holdout]: full_coverage → answered (covered 2/2); legacy=answered/ match=true; current=answered/ match=true
- payment_card_acceptance-zh [holdout]: full_coverage → answered (covered 1/1); legacy=answered/ match=true; current=answered/ match=true
- payment_card_acceptance-en [development]: full_coverage → answered (covered 1/1); legacy=answered/ match=true; current=answered/ match=true
- payment_mobile_setup-zh [development]: full_coverage → answered (covered 1/1); legacy=answered/ match=true; current=answered/ match=true
- payment_mobile_setup-en [holdout]: full_coverage → answered (covered 1/1); legacy=answered/ match=true; current=answered/ match=true
- payment_cash_access-zh [holdout]: full_coverage → answered (covered 2/2); legacy=answered/ match=true; current=answered/ match=true
- payment_cash_access-en [development]: full_coverage → answered (covered 2/2); legacy=answered/ match=true; current=answered/ match=true
- payment_card_and_mobile-zh [development]: full_coverage → answered (covered 2/2); legacy=answered/ match=true; current=answered/ match=true
- payment_card_and_mobile-en [holdout]: full_coverage → answered (covered 2/2); legacy=answered/ match=true; current=answered/ match=true
- payment_card_and_cash-zh [holdout]: full_coverage → answered (covered 3/3); legacy=answered/ match=true; current=answered/ match=true
- payment_card_and_cash-en [development]: full_coverage → answered (covered 3/3); legacy=answered/ match=true; current=answered/ match=true
- payment_mobile_and_cash-zh [development]: full_coverage → answered (covered 3/3); legacy=answered/ match=true; current=answered/ match=true
- payment_mobile_and_cash-en [holdout]: full_coverage → answered (covered 3/3); legacy=answered/ match=true; current=answered/ match=true
- payment_getting_started-zh [holdout]: full_coverage → answered (covered 4/4); legacy=answered/ match=true; current=answered/ match=true
- payment_getting_started-en [development]: full_coverage → answered (covered 4/4); legacy=answered/ match=true; current=answered/ match=true
- connectivity_sim_documents-zh [development]: full_coverage → answered (covered 1/1); legacy=answered/ match=true; current=answered/ match=true
- connectivity_sim_documents-en [holdout]: full_coverage → answered (covered 1/1); legacy=answered/ match=true; current=answered/ match=true
- connectivity_plan_allowances-zh [holdout]: full_coverage → answered (covered 1/1); legacy=answered/ match=true; current=answered/ match=true
- connectivity_plan_allowances-en [development]: full_coverage → answered (covered 1/1); legacy=answered/ match=true; current=answered/ match=true
- connectivity_getting_started-zh [development]: full_coverage → answered (covered 2/2); legacy=answered/ match=true; current=answered/ match=true
- connectivity_getting_started-en [holdout]: full_coverage → answered (covered 2/2); legacy=answered/ match=true; current=answered/ match=true
- place_address-zh [holdout]: full_coverage → unavailable/user_input_missing; legacy=answered/ match=false; current=unavailable/user_input_missing match=true
- place_address-en [development]: full_coverage → unavailable/user_input_missing; legacy=answered/ match=false; current=unavailable/user_input_missing match=true
- place_opening_hours-zh [development]: full_coverage → unavailable/user_input_missing; legacy=answered/ match=false; current=unavailable/user_input_missing match=true
- place_opening_hours-en [holdout]: full_coverage → unavailable/user_input_missing; legacy=answered/ match=false; current=unavailable/user_input_missing match=true
- place_address_and_hours-zh [holdout]: full_coverage → unavailable/user_input_missing; legacy=answered/ match=false; current=unavailable/user_input_missing match=true
- place_address_and_hours-en [development]: full_coverage → unavailable/user_input_missing; legacy=answered/ match=false; current=unavailable/user_input_missing match=true
- diversity-missing-content-zh [development]: missing_content → unavailable/missing_content (covered 0/1); legacy=unavailable/missing_content match=true; current=unavailable/missing_content match=true
- diversity-retrieval-miss-en [holdout]: retrieval_miss → unavailable/retrieval_miss (covered 0/1); legacy=unavailable/retrieval_miss match=true; current=unavailable/retrieval_miss match=true
- diversity-partial-coverage-zh [holdout]: partial_coverage → answered (covered 1/2); legacy=answered/ match=true; current=answered/ match=true
- diversity-provider-failure-en [development]: provider_failure → unavailable/provider_failure (covered 0/1); legacy=unavailable/provider_failure match=true; current=unavailable/provider_failure match=true
- diversity-budget-exhausted-zh [holdout]: budget_exhausted → budget_exhausted; legacy=budget_exhausted/ match=true; current=budget_exhausted/ match=true
- diversity-getting-started-partial-en [development]: partial_coverage → answered (covered 2/4); legacy=answered/ match=true; current=answered/ match=true
