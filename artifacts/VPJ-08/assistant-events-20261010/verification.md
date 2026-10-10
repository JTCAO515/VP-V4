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

## Main-approved retirement delta20261010

Actual product change: protocol.ts closed sixth union source_retired and whole-page decoder branch; sole WIRE.md updated to exact metadata-free retirement shape and canonical source-erasure notification semantics. HTTP/SSE formatter is unchanged and serializes only the newly validated closed event; no old five-variant task/turn nullability, cursor gap, hidden skip or extra authority admitted. SQL erase hook/atomic counter and Native hint clearance are required downstream inputs, not implemented by TS.

PASS: `node --experimental-strip-types --test tests/contract/turn/assistant-events/retirement.test.mjs`3/3, no skips: scrubbed old ordinal plus later notification, deleted-anchor contiguous continuation, lost mixed50-row page/repeated references/stable IDs, no cursor jump/duplicate page sequence, no extra metadata including null fields, unknown variant/retirement bounds/nullable live reference rejection. Decoder+SSE fixture evidence only; not durable erasure/runtime proof.
PASS: `pnpm typecheck`, `pnpm lint`778 files, `git diff --check`. Prior10 fixture/security proofs retained for their tested source; not rerun for this report. Real affected Auth/SQL/Native deletion and reconnect test remains UNRUN until Main-approved SQL source and precise shared leases. Port62720/currentTurnCI candidate remains as86bc4966; no shared source was applied.
