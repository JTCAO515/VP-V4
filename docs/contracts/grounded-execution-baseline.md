# Grounded execution baseline

Issue: AI-20/#22. Deviation: **D2** — additive, pure claim-to-card interface.

## Contract

`prepareGroundedExecution` accepts only a closed low-risk mode or a closed grounded-execution request with an explicit RFC3339 clock, opaque card ID, typed `GroundedClaim` values, and closed qualifiers. It returns exactly one of:

- `low_risk_explanation` with no card;
- `execution_card`, with immutable deterministically ordered rows and the exact deduplicated accepted receipt set; or
- `unsupported_execution`, with no rows and an explicit closed reason.

Every Fact and Observation receipt must be current at the supplied clock; every user-artifact confirmation must not be future dated. Negative qualifiers, absent/stale/duplicate evidence, unknown claim types, malformed records, future claims, invalid timestamps, invalid time zones, and unrecognised qualifier codes fail closed before rendering. The renderer receives only this validated result plus five-locale labels, formats discriminated typed values, and has no prompt, provider, route, persistence, database, or mutation channel.

## Release limits

RL-04 is covered by three named unsupported fixtures (stale, negative, forged) and guarantees zero rows. RL-05 requires all card evidence to be the exact deduplicated accepted receipt set. The Knowledge owner reviews these fixtures at each future adapter or consumer integration; until then this is a C0 interface baseline, not a live execution claim.

## Rollback

Revert AI-20's isolated module, component, tests, i18n copy, plan, and evidence. No durable, provider, account, database, deployment, or external state exists.
