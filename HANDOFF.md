# Handoff

Generated from docs/handoff.json by vpj-program.mjs.

最新Program：[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187)。

目标：交付中英原生iOS的一站式陪伴Journey Agent，全程Trip、知识、现场能力、IAP、运营、用户交付和可维护系统；以VPJ-00#187统筹。

状态：VPJ-00 #187 replaces the old open Issue queue. New task graph is published in stages; baseline PR must merge before code implementation. Product/runtime gates remain unverified.

阶段：VPJ governance and task publication; no product runtime implementation claimed.

## 读取顺序

- [docs/program/2026-09-05/README.md](docs/program/2026-09-05/README.md)
- [docs/VISEPANDA-MASTER-PLAN-2026-09-05.md](docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)
- [docs/adr/ADR-0023-vpj-integrated-native-journey-baseline.md](docs/adr/ADR-0023-vpj-integrated-native-journey-baseline.md)
- [docs/program/2026-09-05/INTERFACES.md](docs/program/2026-09-05/INTERFACES.md)
- [docs/program/2026-09-05/EXECUTION-CONTRACT.md](docs/program/2026-09-05/EXECUTION-CONTRACT.md)

## 当前决定

- One VP identity, same Trip, full journey; native iOS complete and Web lightweight same-Trip edit/confirm.
- Current release zh/en; existing es/ru/ar wire/UI assets remain legacy-compatible until VPJ-01 migration.
- Hotel L1a accommodation fit + verified L1b handoff; no inventory/payment/fulfillment.
- Free + non-renewing 30-day Journey Pass experiment; $19.99 reference, $14.99 alternative; actual StoreKit terms and cost checked before sale.
- Keep valid Trip/RLS/migration/knowledge/privacy safety contracts; archived code not production input.

## 未决与运行证据

- Baseline PR must merge before consumers implement new scope.
- Actual data retention, model/media regions, maps/hotel contracts, Apple signing/store product and Production actions remain owned by corresponding operator Issues.

- No live customer/model/DB/provider/Store/production test or deployment in this planning task.
- Original local iOS remains preview source; copying archive does not prove native build acceptance.

## 验证

验证进行中，最终见Program VERIFICATION.md。

## 下一动作与回滚

Finish and merge the reviewed VPJ planning baseline; then recompute the live frontier. Initial parallel paths: VPJ-01, VPJ-02, VPJ-03, VPJ-33, VPJ-46 and VPJ-62 as dependencies allow.

Revert the planning/archival PR; restore the retired Landing from exact archive; reopen old Issues and restore labels from before snapshot. Never roll back applied migrations or revive revoked user data.

Technical release acceptance in VPJ-45 and commercial lifecycle evidence in VPJ-47 are distinct terminal conditions.

历史：[docs/archive/2026-09-05/baseline/handoff.json](docs/archive/2026-09-05/baseline/handoff.json), [docs/archive/2026-09-05/baseline/CONTEXT.md](docs/archive/2026-09-05/baseline/CONTEXT.md), [docs/archive/2026-09-05/baseline/HANDOFF.md](docs/archive/2026-09-05/baseline/HANDOFF.md), [docs/archive/2026-09-05/baseline/issue-execution-contract.md](docs/archive/2026-09-05/baseline/issue-execution-contract.md)。
