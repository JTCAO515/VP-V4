# AI-05 Data Classes and Purpose-Bound Policy Baseline

Status: accepted architecture policy for [AI-05](https://github.com/JTCAO515/VP-V4/issues/7). This is an engineering control baseline, not legal advice, a production privacy notice, a DPA, or evidence that any provider/data flow is enabled.

## Default posture

R1 uses synthetic fixtures only. No production/provider region has been selected. If a future action lacks a complete, current policy record, VisePanda returns unavailable and does not transmit, cache, persist, embed, translate, TTS-render, or display the protected value. License permission and inference permission are separate from permission to train a model.

## C0–C4 classification

| Class | Examples | Default persistence | Provider/model rule | Logging and display rule |
| --- | --- | --- | --- | --- |
| C0 public | reviewed public Fact, public editorial copy | durable only under source/licence and review policy | controlled C0 inference only after named provider/region/purpose record | attribution and licence conditions remain attached; public does not mean unbounded reuse |
| C1 account | locale, explicit preferences, feature choices | owner-scoped until deletion policy | minimum necessary context only after named provider/region/purpose record | no raw request/response tracing; allowlisted metadata only |
| C2 trip-sensitive | itinerary, dates, precise location, booking references | owner-scoped under accepted retention | deny from provider flow until a dedicated region/purpose/retention decision | no general logs or public display; no cross-user access |
| C3 highly sensitive | passport, ticket QR, medical/payment image, raw voice/image | shortest explicit TTL or no persistence | deny by default; no upload/inference/provider retention without separate accepted policy | never general logs; private media/deletion path required later |
| C4 secret | API key, cookie, OTP, session secret | secret store only | never model, provider, embedding, TTS, or ordinary database content | never browser, client bundle, fixture, screenshot, chat, or general log |

“Public” describes the source exposure, not permission for display, caching, model inference, training, translation, TTS, redistribution, or cross-region transfer. A reviewed Fact is also subject to freshness and eligibility.

## Policy record required before any data action

Every future `PolicyReceipt`/Data License Registry decision must bind these fields to the exact object or field set:

| Required field | Why it must be explicit |
| --- | --- |
| source/provider/dataset and contract or licence version | authority cannot be inferred from a provider name |
| data class and field allowlist | a permitted dataset can still contain prohibited fields |
| actor/user class and owner scope | public, owner, reviewer, and worker paths are different consumers |
| surface and purpose | display, Trip, Chat, review, and Ops are not interchangeable |
| action | display, cache, persist, inference prompt, embed, translate, TTS, export, and training are independently denied/allowed |
| transformation/derivative rule and attribution | derivative/combination obligations survive rendering |
| origin/destination region and cross-border basis | latency is not authorization for C2/C3 transfer |
| effective/freshness/expiry and retention/deletion instruction | expired policy must deny rather than silently keep using a value |
| audit owner and receipt identifier | a later decision must be reproducible and reversible |

An entity reference, model result, candidate, draft, expiry-bypassed cache, or raw provider payload is not a policy receipt and cannot authorize a new action.

## Enforcement matrix

| Action | C0 | C1 | C2 | C3 | C4 |
| --- | --- | --- | --- | --- |
| Public display | only reviewed/current and licence-permitted | deny | deny | deny | deny |
| Owner-scoped display | policy/eligibility required | owner scope required | owner scope + explicit policy required | explicit future policy only | deny |
| Cache or durable persistence | policy-defined | owner + deletion policy | owner + explicit retention/region policy | default deny | deny |
| Provider inference/prompt | synthetic or policy-approved C0 only | minimal, policy-approved C1 only | deny until dedicated approval | deny | deny |
| Embedding/rerank/translation/TTS | policy-approved C0 only | minimal, purpose-bound approval | deny until dedicated approval | deny | deny |
| Provider training | deny unless a separate explicit training grant exists | deny | deny | deny | deny |
| General telemetry/logs | allowlisted non-content metadata only | allowlisted non-content metadata only | deny raw content | deny raw content | deny |

Runtime implementation later must fail closed before the action and must not “retry” a policy/safety block through another provider. AI-44 owns the detailed user-facing failure taxonomy; this policy reserves the terminal `DATA_POLICY_BLOCKED` behavior required by RL-06.

## Retention, deletion, and backup boundary

- No production duration is set by this issue. A duration is valid only inside a future accepted policy record for the specific class/purpose/region.
- R0/R1 has no real raw-media path. Future raw image/audio requires explicit TTL, provider deletion where supported, content-free deletion receipt, and a rule for cancellation/expiry/retry cleanup.
- Deleting a database record does not prove a provider file or Storage object is deleted. Later media/backup work must verify object metadata, provider deletion receipt, and retention policy separately.
- Backups may not convert ephemeral C3 data into indefinite retention. The future backup/restore owner must select a compliant backup or deliberate no-backup TTL policy.
- C4 rotation/revocation is handled only in the secret store/runbook of the future environment; no value or identifier belongs in source control.

## Region gate

| Stage | Allowed data | Region decision | Result |
| --- | --- | --- | --- |
| R0/R1 current state | synthetic fixtures | no production/provider region selected | no external transmission |
| future controlled conformance | synthetic C0/C1 only | named provider + region + purpose record required | isolated evidence only, not traffic authorization |
| future production | only class/field combinations explicitly accepted | joint record for user latency, database, function, provider, storage, DPA/cross-border, retention, and rollback | route remains disabled until all records and tests pass |

Selecting a lower-latency region never overrides class, purpose, licence, retention, or cross-border controls.

## RL-06 / RL-07 handoff

| Red line | Policy invariant | Later runtime evidence owner |
| --- | --- | --- |
| RL-06 | no display/cache/persist/prompt/embed/translate/TTS action without a complete current PolicyReceipt | AI-22 policy/licence contract plus the owning adapter tests |
| RL-07 | no C3 raw media or C4 secret in general logs; traces contain allowlisted metadata only | AI-17 observability, AI-30 media, and AI-32 realtime security tests |

AI-05 does not claim an observed zero-violation count. It defines the invariant and the owners that must later supply deterministic fixtures, runtime enforcement, and measurement.
