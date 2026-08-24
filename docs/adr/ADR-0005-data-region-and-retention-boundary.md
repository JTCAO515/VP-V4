# ADR-0005: Data-class, region, and retention boundary

Status: accepted on 2026-08-24 through explicit operator delegation.

## Decision

R1 may use only fixtures and synthetic data. Controlled future provider conformance may use C0/C1 data only after an explicit provider/region/purpose record. C2/C3, precise location, user artifacts, and raw image/audio are prohibited from provider flow until a dedicated data-policy and retention gate accepts them.

## Consequences

- No real OCR, ASR, TTS, Vision, external-data, or sensitive attachment flow is enabled by this ADR.
- Provider/cache/trace code must fail closed before transmission when policy is missing.
- Any actual region, DPA, retention period, or deletion procedure remains a later reviewed configuration.

## Rollback

Disable the route, purge only data covered by the future policy, and return unavailable.
