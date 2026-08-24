# ADR-0004: Provisional model baseline and fake-model R1

Status: accepted on 2026-08-24 through explicit operator delegation.

## Decision

DeepSeek and Qwen are provisional task-routed candidates; Kimi and GLM remain eval-only. R1 uses a deterministic fake model and reviewed fixture only. No provider route is enabled until AI-16 conformance, DEC-03 data policy, cost, latency, schema, and observability gates pass.

## Consequences

- Provider keys are server-only secrets, never client variables, Git files, logs, fixtures, or documentation.
- A configured key is not evidence of a production route.
- Thinking, structured-output dialect, model alias, repair/fallback, and returned model are provider-specific contract concerns.

## Rollback

Disable the route/flag and return deterministic unavailable or fixture behavior.
