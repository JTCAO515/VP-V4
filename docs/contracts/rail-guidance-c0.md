# Rail guidance C0

AI-38/#40 provides a pure local rail guidance projection. Exact departure and arrival instants are
accepted only from one already confirmed user artifact. No confirmed artifact, malformed input,
provider, URL, crawler or extra key returns a truthful `rail_unavailable` result with
`officialRecheck: true`.

There is no 12306 request, robot, spider, crawler, feed, provider, URL, cache, persistence, Trip,
Proposal, account or external action. This C0 neither claims a schedule nor makes a permanent claim
about future partner/feed availability. RL-06 has 3/3 provider/URL/crawler fixtures; closed-key
validation occurs before guidance exists.

Rollback: revert this module, tests, contract and evidence. No external or durable state exists.
