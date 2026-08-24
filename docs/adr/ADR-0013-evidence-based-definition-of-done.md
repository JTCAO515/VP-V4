# ADR-0013: Evidence-based Definition of Done

Status: accepted on 2026-08-24 through explicit operator delegation.

## Decision

A release claim requires applicable L1–L7 evidence, five-language and RTL coverage, named RL-01 through RL-09 suites with fixture count and runtime invariant, explicit unrun checks, rollback, and an observation window. A green build or merged PR alone is not product completion.

## Consequences

- AI-07a provides command layers; AI-42 owns corpus and red-line registry content.
- Each release gate produces an eight-dimension acceptance report.
- Provider, data, beta, and production claims stay `planned`, `fixture-only`, or unavailable until the corresponding evidence exists.

## Rollback

Pause promotion, disable the affected feature flag, and return to the last evidence-backed boundary.
