# AI-21 R2 unrun checks

- Real DeepSeek/Qwen protocol conformance, returned-model alias drift, credentials, region/DPA,
  retention, policy receipt, availability, cost, latency, timeout, cancellation, and streaming were
  not run: no external account, provider configuration, or operator authorization is present.
- Staging SSE/abort/degraded browser E2E and feature-flag rollback were not run: no staging runtime
  or approved runtime flag exists.
- Local Supabase/RLS integration was not run: all three database probe paths are `not-configured`.
  The integration suite reports 1 static pass and 8 local-runtime skips; the security suite reports
  26 passes and 1 local-runtime skip.
- No reviewed runtime corpus, FTS/vector adapter, provider-backed answer, or production observation
  window exists, so time-to-status/validated-answer and p50/p95/p99 cannot be measured honestly.

Unblock only through a separately authorized provider/staging/region/data-policy Issue. This audit
does not authorize those actions. Rollback is a normal revert of AI-21 documents and artifacts.
