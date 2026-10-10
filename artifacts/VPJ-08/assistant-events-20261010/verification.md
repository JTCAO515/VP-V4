# First TS product implementation evidence

Exact base:6e341f10e6076d259e1781246c493d5d60137e71. Owned source only; no shared file, migration, permissions, provider, configuration value, user data or legacy wire changed.

PASS: `pnpm install --frozen-lockfile --offline` (108 cached packages; no lockfile change).
PASS: `pnpm lint` (777 source files at initial implemented route).
PASS: `pnpm typecheck` after fixing unknown-to-UUID narrowing.
PASS: `node --experimental-strip-types --test tests/contract/turn/assistant-events/protocol.test.mjs tests/security/turn/assistant-events/http.test.mjs` (10/10, no skips, signed local fixture Auth with controlled RPC responses). Scope: closed wire/sequence pagination, process-independent decoder restart, private-field rejection, invalidation hints, preparse bytes, original authenticated transport, replaced session, missing SQL, default-deny additive reader. This is not a SQL persistence or real restart test.
PASS: `pnpm build` compiled and registered `/api/chat/native/v5/assistant-events/[conversationId]`; runtime default-deny guard was added while this build was in flight and checked separately with final typecheck/HTTP tests. Build is route integration evidence, not target availability.
PASS: repository recursive suite discovery automatically includes the new contract/security `.test.mjs` files; no CI shared-file edit required.

UNRUN: read_assistant_events_v1, SQL transactional outbox/counter/atomic linking hooks, bounded backfill, original current-policy/consent/epoch/source qualification on actual database; SQL is outside this TS writer's authorization and awaits Main's one batch review + new official SQL owner.
UNRUN: Native registered consumer/collector and original private SSE reconnect/background/account-loss chain; new Native peer owns its new files, shared file integration needs Main lease.
UNRUN: true DB/server restart durable replay and privacy/export/delete/catalog/rollback integration, final integrated required CI, real target/provider/device and backup restore. No provider/account/environment was activated; usage settlement and Trip writers were not invoked.

#196 remains OPEN, no full-chain completion claim or partial PR. Fixed candidate WIRE and SOURCE-GRAPH are the concrete package for Main's SQL/Native coordination. Continue the same TS session for dependency integration, findings and single overall PR after approved sources land.
