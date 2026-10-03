# #561 fixed full source combination

TS source86c85b13 + original SQL6e272d833781ff2b84cd4720f186c49540c9e00b adopted as59f25cb3 on current main #630 union9b36e39a. Actual18 worker wrappers and single v2 ledger bridge are present; no missing implementation functions. SQL owner7/7 fixed-source evidence is reused, not represented as a new union run.

Only two real consumer mapping differences repaired:

1. Consume actual claim.execution22-key wire; CNY/micros/1048576 ceiling remain enforced by registered SQL tariff/scope/usage-cost and host price/reservation, not added wire keys.
2. Check sameattempt model_dispatch authorization while ledger reserved, then budget bridge dispatch. Protocol consumes this exact decision once plus fresh020 qualification. Actual configured collector current original lease/scope/source/recipient+one-shot gate still commits after credential retrieval and before HTTP. No derived false-flag/local permit or broader SQL state permission.

PASS affected8/8 TS worker/host negative and recovery paths; PASS typecheck; PASS registry classification and diff. One actual SQL test registered in existing postgres batch by this sole integrator. No new role/grants/identity/target/provider activation. No old generic ledger RPC fallback or completion fence removal.

Core complete: all owned worker/model/host and durable SQL authority/output/budget/completion/current-readable receipt paths implemented and combined. Development closure is distinct from observed runtime acceptance per Main instruction. New real loopback union engineering/CI/signed deployed collector/fees/target/device remain UNRUN and are not development-closing prerequisites. Historical failures are preserved. No new micro PR.
