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

V4-20 adds `proposeRecovery` and `decideRecoveryProposal` as pure, in-memory
contracts for a timestamped `delay` or `closure`. Evidence that is absent,
malformed, future-dated or of an unknown kind fails closed to
`NO_ELIGIBLE_EVIDENCE`; expired evidence returns `EVIDENCE_STALE` and requests
a recheck. A current observation can only create a `pending_confirmation`
proposal, which freezes the observation and expiry timestamps. The user can
accept or reject it; accepting rechecks the frozen expiry against the supplied
decision time and returns `EVIDENCE_STALE` when it has elapsed. An otherwise
current accept whose Trip id or version no longer matches returns
`TRIP_VERSION_CHANGED`. Neither function writes a Trip, calls a provider,
cancels anything, or purchases anything. The existing canonical Trip writer is
intentionally not a V4-20 consumer; a future writer must independently
validate and atomically apply any accepted recovery.

Rollback: revert the pure engine/recovery contracts and their tests. No Trip
state, evidence or recovery action is written.
