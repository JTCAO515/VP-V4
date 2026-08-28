# Today Engine contract v1

V4-18 provides `buildToday`: a deterministic pure function that accepts one
current Trip, an evaluation time and one Fact. It creates a single
`review_fact` NextAction only when that Fact is reviewed, licence-allowed and
unexpired. Otherwise it returns `NO_ELIGIBLE_EVIDENCE`. It always produces the
same closed nine-item CheckResult registry; only the Fact's declared check kind
may be marked `evidence_available`, never passed, live, booked or recovered.

The browser route remains a five-locale/RTL unavailable surface because this
Issue owns neither an owner-scoped current-Trip reader nor an eligible-Fact
query. It makes no request, mutation, browser-local write or real-time claim.
V4-19–V4-21 own external evidence and recovery; they must not reinterpret a
Today result as a Trip write.

V4-19 adds `projectTodayObservation` for the closed `weather`, `air_quality`,
`alert`, and `closure` kinds. Every projection retains its observation and
expiry timestamps. A non-expired record is `current` only as a freshness state,
not a live-provider claim; expired cache is `stale`, and absent, failed or
malformed input is `unavailable`. Both stale and unavailable request Canvas
recheck. The function has no provider, cache, browser or Trip write path.

Rollback: revert the pure engine and its contract tests. No Trip state,
evidence or recovery action is written.
