# AI-16 unrun checks

- No DeepSeek, Qwen, OpenAI-compatible, or other provider request was made. The adapter is fixture-only and contains no HTTP transport or provider SDK.
- No API key, cookie, account, environment variable, region, DPA, retention setting, deployment, feature flag, or production configuration was read or changed.
- Live protocol/schema conformance, thinking behavior, streaming, usage accounting, abort propagation beyond a pre-aborted in-memory signal, provider errors, rate limits, latency/cost measurements, and provider-account access remain unrun. They require a separately authorized transport and policy gate.
- No Trip, Fact, permission, external state, database, migration, or browser check applies to this server-only fixture contract.
- `jq` is unavailable in this local environment. A read-only Node JSON parse will be used for `docs/handoff.json` verification.

Residual risk: provider API versions, regional availability, strict-schema semantics, thinking controls, streamed usage, cancellation and error envelopes remain unverified against real provider accounts. The implementation is safe only because it cannot route to a provider.

Rollback: remove the AI-16 ModelGateway module, contract tests, contract document, and evidence. No durable state or external configuration was created.
