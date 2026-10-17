**Standards：0；Spec：0。** 指定固定区间、六个文件的最终 diff 未发现可操作问题。

- native17 保留原 subject 文件及 `AGENT005_NATIVE_PG=1`，新增 cancellation wrapper 和 `QA_CANCEL_NATIVE_PG=1`；并发仍为 1。
- wrapper 在显式 flag 下动态导入 PG proof，设置 180 秒超时，并将 import 异常、非零 `process.exitCode` 传播为失败。
- DB runner 仍拒绝非零退出、缺失/零测试摘要，以及任何 fail、skip、todo、cancelled；没有新增 `EXCLUDED` 或放宽 PostgreSQL 17 检查。
- cancellation 相关路径通过显式映射或保守 full fallback 包含 native17；HTTP fixture 保持普通 integration 分类。未知范围继续 full。
- 默认 gated skip / incomplete 约定与 README 基线一致，不构成 required DB lane 的跳过豁免。

本轮仅做静态审查，未运行测试；未读取范围外 helper、HTTP/角色测试或 CI 日志，因此不独立确认其覆盖内容、通过数量或最终显式 gate 的运行结果。