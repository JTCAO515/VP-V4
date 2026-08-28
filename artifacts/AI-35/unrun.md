# AI-35 unrun checks

- No weather, flight or rail provider, URL, account, credential, source licence, region/DPA,
  external request, cache, durable receipt store, database, RLS, feature flag, browser, staging or
  production action exists or was attempted.
- This C0 resolver validates only caller-supplied metadata. It does not prove provider selection,
  attribution, TTL cache behavior, live freshness, card rendering, Proposal persistence or Trip/
  Knowledge writes.

Residual risk: a future adapter must independently validate source, policy, owner/eligibility,
attribution, retention and durable receipt semantics before it supplies observations here.

Rollback: revert the module, dedicated tests, contract, scoped execution-rule change and evidence.
No external or durable state exists.
