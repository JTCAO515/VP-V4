# Source-backed catalog fixtures

`catalog-en.json` and `catalog-zh.json` are exact `{data: subscriptionDevelopmentPresentation(locale)}` output from the AGENT018 producer, verified against commit `1fd9669d43a2febae96c29949ebbadd211f42a53` in `subscription-catalog-20261016`. They contain no balance, real SKU or price. Native tests mutate them only in memory to exercise closed-wire rejection.

Entitlement/transport tests construct explicitly synthetic snapshots. They do not assert Apple verification, database persistence, real Sandbox purchase or target acceptance. Consumer field parity follows backend `subscription-ledger/contract.ts`; observed clean contract in backend commit `ebd4fe0a70d67d3bc7fafb768f49b75c656bc34c`, SHA256 `4e2b4b65d8f481b9c91e29b1eff848e71ae16b318de61f87a9cb719db721841e`. Parser parity is not a signature proof.

`producer-entitlements.json` contains six explicitly synthetic states with the final checkedAt/lifetimeMs fields. `verify-producer-parity.mjs <catalogRepoRoot> <ledgerRepoRoot>` imports only the actual pure presentation/parser functions and checks exact catalog equality plus server acceptance of these samples. The Native Swift test decodes those same bytes. There is no Apple verification, HTTP operation, SQL apply or transaction evidence here.
