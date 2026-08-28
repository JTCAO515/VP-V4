# Weather card C0

AI-36/#38 adds a pure local weather-card projection. It consumes caller-supplied, closed metadata
only and has no provider selection, request, URL, cache, durable storage, model prompt, Trip,
Canvas, Proposal or global feature-flag path.

The projection delegates policy, time and need validation to AI-35's ExternalEvidenceResolver,
then accepts only a closed weather condition, air-quality band and optional alert severity/category.
The alert cannot carry free-form wording or a provider-derived key value; its issue instant must not
follow the observation. A permitted, fresh result exposes the policy ID as its required source
attribution plus the source observation and expiry timestamps. It is an Observation, never a Fact.

The local `weatherDataEnabled` input is deliberately fail-closed. A disabled input, denied receipt,
expired observation, malformed timestamp, future/inverted timeline, provider/raw-payload key or
unknown typed value produces a `weather_unavailable` outcome with `recheck: true`; no current
weather claim or card data exists on those paths. This is RL-04's unavailable terminal and RL-06's
closed-key-before-projection invariant. The deterministic RL-06 fixture count is 2/2 (provider and
raw-payload injection).

`WeatherObservationCard` owns five local label sets and sets Arabic `dir="rtl"`; it displays source,
observation time, expiry and an official-channel recheck instruction without a navigable URL. It is
not mounted on a public route in C0, so this does not claim a live QWeather integration, provider
attribution clearance, five-language provider-quality acceptance, or a Canvas recheck action.

Rollback: revert the projector, card, fixtures, tests and evidence. No external or durable state is
created.
