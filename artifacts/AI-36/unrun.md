# AI-36 unrun checks

- No weather/AQ/alert provider, external request, account, credential, licence/region/DPA review,
  cache, durable receipt, database, Trip, Canvas, Proposal, global feature flag, browser, staging
  or production action exists or was attempted.
- The C0 card is a component-level projection and source-contract test. It is not mounted on a
  public route and does not prove visual browser rendering, real provider attribution, official-link
  eligibility, translation quality, QWeather coverage, 429/5xx transport handling, TTL cache
  behavior, Canvas recheck wiring, or provider/user-data retention compliance.

Residual risk: a future approved adapter must independently validate its provider policy,
attribution, error classification, TTL, region, retention and official-action registry before it can
supply the closed metadata accepted here.

Rollback: revert the AI-36 projector, card, tests, contract, execution-rule correction and evidence.
No external or durable state exists.
