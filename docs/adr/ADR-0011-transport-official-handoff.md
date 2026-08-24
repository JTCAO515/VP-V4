# ADR-0011: Transport without purchase or crawler

Status: accepted on 2026-08-24 through explicit operator delegation.

## Decision

VisePanda does not purchase tickets, expose inventory, or run periodic 12306 crawling. Rail uses reviewed station/corridor guidance, user-confirmed artifacts, and official recheck actions. Aviation remains official handoff until a licensed provider passes China-route benchmark, attribution, retention, and field-allowlist gates.

## Consequences

- No 12306 robot/spider/crawler path is permitted.
- AI-39/AI-40 remain data-policy and contract gated.
- Missing current transport data renders an official action or unavailable state.

## Rollback

Disable the adapter, purge provider data under its contract, and retain only allowed user references and official actions.
