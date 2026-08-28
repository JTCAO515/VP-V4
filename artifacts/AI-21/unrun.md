# AI-21 R2 unrun checks

- Real DeepSeek/Qwen protocol conformance, returned-model alias drift, credentials, region/DPA,
  retention, policy receipt, availability, cost, latency, timeout, cancellation, and streaming were
  not run: no external account, provider configuration, or operator authorization is present.
- Staging SSE/abort/degraded browser E2E and feature-flag rollback were not run: no staging runtime
  or approved runtime flag exists.
- Local Supabase/RLS integration was not run: all three database probe paths are `not-configured`.
  The integration suite reports 5 static passes and 8 local-runtime skips; the security suite
  reports 67 passes and 1 local-runtime skip.
- No reviewed runtime corpus, FTS/vector adapter, provider-backed answer, or production observation
  window exists, so time-to-status/validated-answer and p50/p95/p99 cannot be measured honestly.
- A clean current `pnpm@9.15.9 install --frozen-lockfile` was not re-run: the working tree has a
  pre-existing uncommitted `pnpm-lock.yaml` change outside this Issue. Resolve the lockfile/deploy
  compatibility in that separate work item, then perform the clean pinned install without treating
  a source build as install evidence.

Unblock only through a separately authorized provider/staging/region/data-policy Issue. This audit
does not authorize those actions. Rollback is a normal revert of AI-21 documents and artifacts.
