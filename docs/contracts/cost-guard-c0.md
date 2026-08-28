# Cost guard C0

AI-48 is an in-memory, metadata-only admission guard. A caller provides operator-owned positive
safe-integer limits for a sliding window, per-user attempts, per-user/per-task attempts, turn
deadline, model steps and tool steps. The guard holds no prompt, response, reasoning or provider data.

Before consuming a quota slot, it rejects an expired turn as `TIMEOUT_BEFORE_OUTPUT` and rejects
model/tool-step or quota excess as `BUDGET_EXHAUSTED`. Both return the frozen taxonomy metric label;
neither invokes a fallback. Unknown fields, invalid identifiers and an invalid server-clock value fail closed.
Rejected attempts do not consume a quota slot.

This C0 guard is process-local: it is not authorization, durable quota storage, a distributed rate
limiter, a provider adapter or a user-visible API. Production values, persistence and observability
require a separately accepted integration. Rollback removes this isolated guard and its fixtures.
