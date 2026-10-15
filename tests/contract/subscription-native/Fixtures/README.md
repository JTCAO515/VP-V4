# Source-backed catalog fixtures

`catalog-en.json` and `catalog-zh.json` are exact `{data: subscriptionDevelopmentPresentation(locale)}` output from the AGENT018 producer, verified against commit `1fd9669d43a2febae96c29949ebbadd211f42a53` in `subscription-catalog-20261016`. They contain no balance, real SKU or price. Native tests mutate them only in memory to exercise closed-wire rejection.

Entitlement/transport tests construct explicitly synthetic snapshots. They do not assert Apple verification, database persistence, real Sandbox purchase or target acceptance. Consumer field parity follows backend `subscription-ledger/contract.ts`; observed clean contract in backend commit `192cc94c`, SHA256 `3680262e46bb2610fe8cd961de5d03425048937930ad2df892eff09e9c489eac`. Parser parity is not a signature proof.
