# AI-17 unrun checks

- No DeepSeek, Qwen, OpenAI-compatible, or other provider request was made. The modules contain no transport or SDK.
- No API key, cookie, account, environment variable, production flag, deployment, region, DPA, retention configuration, or provider price sheet was read or changed.
- Live route selection, cost/usage, latency, provider outage/retry, streaming, after-output cancellation, model-version drift, schema behavior, account access, and circuit integration with a provider transport remain unrun. They require a separately accepted provider and policy issue.
- No Trip, Fact, permission, external state, database, migration, persistence, or browser check applies to these server-only fixture contracts.
- `jq` is unavailable locally; a read-only Node JSON parse is the narrow substitution for `docs/handoff.json` validation.

Residual risk: this proves only deterministic C0 fixture policy and content-free metadata projection. It does not validate live provider policy, availability, telemetry pipeline behavior, billing, or failure semantics.

Rollback: remove the isolated AI-17 route/observability modules, tests, contract, and evidence. No durable or external state was created.
