# VPJ-06 provider protocol preparation

Related to #193. The original slice below was offline preparation. Subsequent actual C0
protocol evidence is in [the live report](../../../artifacts/VPJ-06/live-c0-20260910/verification.md);
it does not activate a default gateway or establish general quality/production acceptance.
Source baseline: `080d5f0`; implementation lives in
`lib/server/model-gateway/adapters/provider-protocol.ts`.

## Scope and reuse

The preparation function serializes one non-streaming text, closed known/unknown JSON, or
single function-tool candidate request. It reuses the existing known/unknown validator,
model data classes, Qwen/DeepSeek candidate IDs and C0 `CostGuard.admitModelStep`.
The injected HTTP transport is mandatory; there is no default fetch, URL, key loading,
registry activation, retry, fallback, tool executor, prompt evaluation, or gateway routing change.
Only `c0_synthetic` is admitted. Passing a protocol test grants no data/recipient/region permission.

`protocol_validated` means only the bounded response passed local protocol validation.
A tool candidate is not executed and does not authorize a Trip write. The caller supplies a
trusted argument validator along with its function schema; this is not a general JSON Schema engine.
Only one function and one returned call are supported. Natural text in tool mode, unexpected
function names, argument validation failure, multiple choices/calls, partial or filtered answers,
model mismatch, missing usage and inconsistent token totals reject. Reasoning text is discarded.

## First-party references checked 2026-09-10

| Provider | Candidate, not an account availability claim | Relevant protocol distinction | Official source |
| --- | --- | --- | --- |
| Qwen | existing `qwen3.7-plus-2026-05-26` | Direct HTTP uses top-level `enable_thinking: false`; JSON object mode needs an explicit JSON instruction; cache hits use `prompt_tokens_details.cached_tokens`. | [Chat API](https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions), [Structured output](https://help.aliyun.com/en/model-studio/qwen-structured-output) |
| GLM | `glm-5.3-flash` | Native default thinking; explicit `thinking.type: disabled` was rejected with HTTP400/1210 in the actual C0 check; text `json_object` mode; `sensitive` finish reason is blocked; cache details use `prompt_tokens_details`. | [Chat completion](https://docs.bigmodel.cn/api-reference/模型-api/对话补全) |
| DeepSeek | existing `deepseek-v4-flash` | `thinking.type: disabled`; JSON object mode plus prompt instruction; cache hit and miss counts are separate required fields. | [Chat completion](https://api-docs.deepseek.com/api/create-chat-completion) |

Qwen's current documentation distinguishes workspace/region-specific endpoints; this slice
chooses none. Compatibility does not establish identical model capabilities or accepted model
aliases. Exact response model IDs are required here; any provider-reported alias/snapshot
mapping needs observed evidence before widening that rule. GLM's ID appears in the current
official API examples; its actual account/region and per-feature availability remain UNRUN.
Provider-native JSON Schema strict mode, built-in search/retrieval, multimodal input, reasoning controls/display,
streaming, continuation and parallel tools remain unsupported in this slice.

## Usage and interruption

Prompt/completion/total counts must be non-negative safe integers with equal totals. DeepSeek
cache hit plus miss must equal prompt tokens. Optional missing cache/reasoning dimensions stay
`null`, never fabricated zero. Numeric cache/reasoning counts cannot exceed their parent counts.
`cost: unknown` applies even when token counts are present. We do not infer charges or refunds
from a timeout, cancellation, HTTP failure, absent usage or a partial body. No price table is added.
Valid usage is retained on invalid/filtered complete responses for later reconciliation.

The local deadline covers transport plus body read. Abort is propagated; a transport that ignores
it cannot return a late success to the caller. Bodies are capped at 256 KiB; SSE is rejected.
Errors expose only existing failure codes and safe numeric usage, never response headers,
provider error bodies, exception messages or secrets. Nothing is logged by this module.

## Remaining public-interface and runtime gates

`ModelProfileId` currently lacks GLM; `ModelAttemptOutcome` has no tool candidate or full usage
shape. The route and model registry remain fixture-only. Before integration, their owner must
version a real producer/consumer contract and decide how candidates enter TurnCoordinator.
The existing C0 CostGuard is an in-memory attempt/step gate, not RuntimeBudget reserve/settle;
it does not expose its remaining turn deadline. The per-attempt timeout is therefore not proof
of durable total-budget enforcement. No new permission or reserve/settle protocol is invented.

Real dispatch additionally requires approved credentials through the existing secure process,
provider/region/purpose policy, authoritative request budget reservation/deadline, complete usage
reconciliation, current price/account evidence, and the bilingual quality/cost comparison.
The original preparation ran no provider calls or account operations; the subsequent C0 report
separately records actual calls and conservative budget debits, with invoice cost unverified.
Parent #193 stays OPEN. Revert this isolated preparation slice to roll back; no schema or data rollback.

## Actual C0 compatibility correction, 2026-09-10

A bounded real request with the disabled-thinking flag returned HTTP400/1210. A matched
diagnostic with the same synthetic prompt/max_tokens64 and the thinking field omitted
returned HTTP200 with23 prompt/64 completion tokens and finish_reason=length. That proves
this request-mode difference and key usability, not successful answer completion or broad
GLM quality. The adapter now preserves GLM's native default; Qwen/DeepSeek keep their
explicit non-thinking controls. Reasoning content remains discarded, length outcomes still
reject, and complete real GLM protocol/quality acceptance remains separate.
