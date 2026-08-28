# ModelGateway fixture conformance contract

## Status

AI-16 provides a TypeScript-only R1 fixture seam. It makes no provider request, reads no credential or environment value, has no provider SDK, and records no prompt or response. This is not a production route, provider approval, regional data-flow approval, or model-capability claim.

## Boundary

`ModelGateway.invoke(request, signal)` validates an allowlisted provider-profile/task pairing and a bounded output shape only. It returns the closed `validated`, `unavailable`, or `cancelled` union. It does not determine domain truth and has no Trip, Fact, permission, persistence, tool, or external-side-effect dependency.

Only complete `c0_synthetic` requests reach a fixture output. C1 through C4 values return `DATA_POLICY_BLOCKED` before profile selection. `null`, arrays, empty input, invalid request fields, and invalid signals return `INVALID_INPUT`; an already-aborted valid signal returns `CANCELLED` before any output. A `shadow_only` profile is unavailable even if a task is later added to its registry record.

## Provider conformance matrix

| Profile | Provider API model ID | Observed deployment | Lifecycle | Supported fixture task | Thinking | Route |
| --- | --- | --- | --- | --- | --- | --- |
| DeepSeek Flash | `deepseek-v4-flash` | `DeepSeek-V4-Flash-0731` | beta | ordinary text | disabled | fixture only |
| DeepSeek Pro | `deepseek-v4-pro` | `DeepSeek-V4-Pro-0813` | GA | ordinary text | not used | fixture only |
| DeepSeek Vision | `deepseek-v4-flash-vision-exp` | `DeepSeek-V4-Flash-Vision-Exp` | experimental | none | not used | shadow only |
| Qwen 3.7 strict | `qwen3.7-plus-2026-05-26` | `qwen3.7-plus-2026-05-26` | candidate | strict known/unknown | not used | fixture only |

The Flash API identifier is deliberately distinct from its observed deployment label. DeepSeek strict/tool behavior is not inferred from an OpenAI-compatible transport. Vision is registry-only and cannot be invoked through this fixture adapter.

## Strict output rule

The Qwen candidate accepts exactly one of the following JSON-shaped values:

```ts
{ kind: "known", value: "non-empty string" }
{ kind: "unknown", reason: "fixture_no_evidence" }
```

`null`, arrays, empty values, missing discriminator fields, and extra or unsupported keys are invalid. Invalid strict output maps to `MODEL_OUTPUT_INVALID`; unsupported profile/task combinations map to `PROVIDER_UNAVAILABLE`.

## Rollback and next gate

Rollback removes this isolated module, tests, contract, and evidence; no data, provider route, flag, or domain state must be reverted. A later provider transport Issue must separately pass live protocol conformance, policy/region/DPA approval, no-secret handling, cost/latency measurement, observability, and independent review before any provider route can exist.
