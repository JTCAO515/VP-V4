# ADR-0015: Data-class, policy, and threat baseline

Status: accepted on 2026-08-24 through explicit operator delegation.

## Context

ADR-0005 permits only synthetic fixtures in R1 and denies C2/C3, precise location, user artifacts, and raw media to provider flows until a dedicated policy gate is accepted. The product also needs a concrete class-to-action boundary and a fail-closed region posture before model, media, external-data, database, or observability adapters exist.

## Decision

VisePanda uses five data classes, C0 through C4, defined in `docs/policy/data-classes.md`. A data flow is allowed only when its class, source/licence, actor, purpose, surface, transformation, destination region, retention/deletion rule, and audit owner are all explicitly recorded. Missing or expired policy blocks the action before an adapter/provider call.

No production or provider region is selected in R0. R1 stays fixture-only. A future controlled conformance run may use synthetic C0/C1 only after a named provider/region/purpose record exists; it does not authorize C2/C3, precise location, user artifacts, raw image/audio, provider training, or production traffic. C4 is never eligible for model, public data, ordinary database content, or general logs.

Raw media is default-deny: no real upload, inference, cache, backup, or retention path exists in R0/R1. A later media flow must set an explicit short TTL, delete provider copies where supported, and persist a content-free deletion receipt. “Provider stores data permanently if TTL is omitted” is a conformance failure, never a default.

## Consequences

- The Data License Registry (AI-22) must evaluate display, cache, persist, prompt/inference, embed, translate, TTS, attribution, region, retention, and deletion independently; licence permission is not a blanket boolean.
- Future provider/model configuration separates inference authority from training authority. No class is sent for training merely because inference is allowed.
- AI-30/AI-31/AI-32 media work, AI-35 external evidence, and AI-16 model routing begin with denial unless their own policy/conformance gates produce evidence.
- RL-06 and RL-07 remain runtime gates owned by later implementation issues. AI-05 fixes their policy/threat baseline, not a claim that they are already enforced in a live route.
- This ADR creates no account, region selection, DPA, provider call, database record, upload, production deployment, or legal conclusion.

## Rollback

Maintain fixture-only unavailable behavior. A later approved flow is disabled at its policy/feature gate, then deletes only data covered by its accepted policy and records the outcome. No fallback may send a stricter class to a different provider or region.
