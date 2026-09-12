# Saved native Ask answers in Web

Related to #195 and #206. This is a read-only consumer of migration 41's existing
`grounded-turn/1` history. It creates no Turn, model attempt, consent or Trip change.

`GET /api/chat/grounded` uses the existing browser cookie identity adapter and calls
`read_grounded_policy` followed by `list_grounded_turns` for the deployment's selected
grounded policy. Native Authorization credentials, query overrides and cross-site
requests are rejected. Database owner/session/consent and original publication/claim
checks remain authoritative; only a validated presentation projection leaves the API.

Activation requires `VISEPANDA_GROUNDED_WEB_READ=true` **and** the existing grounded
native local/Staging configuration and target checks. It is off by default, cannot
activate in production, and does not require a new migration. Use a dedicated Preview
with deployment-specific configuration; do not change shared aliases or project flags.
Rollback is to disable the Web flag or remove the dedicated Preview allowance.

The existing `/visepanda` Ask workspace shows saved answers for zh/en. Each record
retains its original language, city, task and parent identifiers; legacy locales keep
their existing workspace behavior. Conditions and exclusions remain visible beside
facts. Only the source list folds. A read lasts at most 30 seconds, shortened by source
expiry and the full request duration. Hidden/background, page exit, offline and auth
events invalidate presentation. Owner changes and logout discard records. Expiry
rechecks preserve layout while hiding inaccessible stale facts.
The outer workspace also remounts on logout or owner change, discarding its existing
thread/Trip metadata and pending component state rather than retaining a prior account's list.

Validation for this slice: pure projection adversarial tests, existing local native
HTTP harness extended with real GoTrue/SSR-cookie read/isolation/revocation checks,
affected browser interaction and dedicated Staging readback. These do not establish
full S2 acceptance or authorize a production release.
