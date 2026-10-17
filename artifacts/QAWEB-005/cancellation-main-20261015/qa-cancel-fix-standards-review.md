Standards：0 findings。Spec：0 findings。

原 P2 已解决：`service.ts:15` 在 UUID 校验后、RPC 前统一小写，并将相同 canonical IDs 用于原有严格 receipt 解码；其他 UUID 仍无法通过 scope 检查。

PG helper delta 保留原检查，按固定 HEAD 的排序 SQL 快照重放，在 cancellation migration 前后比较原 metadata；默认结果文件为私有 `0600`、`wx`，仅停止自建 PG。默认 contract 无 PG 依赖或 PG skip 分支，新 UUID 回归会被正常收集。

本轮仅静态只读审查，未运行测试或服务；所述 HTTP / PG PASS 未独立复验，不代表 GoTrue 或目标环境验收。