# ADR-0012: Modular multimodal baseline

Status: accepted on 2026-08-24 through explicit operator delegation.

## Decision

The release path is modular OCR-to-MT and ASR-to-MT-to-TTS. Realtime translation is an eval-only challenger. Image/voice provider flow requires DEC-03 policy, five-language device evidence, final-only persistence, and modality-specific protocol/security acceptance.

## Consequences

- No raw media provider call or storage is enabled in R1.
- AI-30 through AI-34 own media lifecycle, translation, realtime conformance, UI, and release evidence.
- Text-only or unavailable is the required degradation before those gates pass.

## Rollback

Disable the modality flag, delete media according to the future accepted policy, and fall back to text/unavailable behavior.
