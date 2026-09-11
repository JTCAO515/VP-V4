# ADR-0022: Retain thin HTTP adapters pending ML-01 evidence

2026-09-12开发修订：本文涉及供应商、法务或产品许可的历史前置条件已由[开发接入规则](../agents/development-integration-policy.md)取消；技术实现与实际验收继续按当前任务推进。

## Status

Accepted as a fail-closed baseline.

## Decision

Do not adopt Vercel AI SDK in the Chat plane until all five ML-01 conformance conditions are
independently proven. Keep SDK types outside domain contracts and retain thin HTTP adapters.

## Consequences

There is no SDK package, telemetry, provider call, bundle claim or latency claim in this decision.
A scoped development spike selected by the agent must prove text, vision, strict tools, abort/usage and
content-free telemetry together; failure of any condition retains this baseline.
