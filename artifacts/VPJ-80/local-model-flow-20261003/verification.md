# VPJ-80 local model flow — preparation evidence

Base: b9309495e5ea3f0184b4ef54aa2d40b7fecff144.
SQL source: aa759054bfc83aa2d4d367234a2d35a93b7571ba, 050000 and 060000 only.
060000 SHA-256: 6120eafe95fc529cfbc95050038e727d1bde82145f64dbbdec2923d07fd80563; identical to fixed 0d949ad96e2bcb46ae712c9507df69812217fb8c.
TS source: b64ec9458fed017265ab705a6a155310c5b49f2b, request/output-receipt/journal, exact temporary copies with existing model-gateway dependencies.

Command: `VP_TURN_DB_TEST=1 node --test tests/preparation/planning-v2-local-model-flow.test.mjs`.
First actual run: 3/3 PASS, 7.713 seconds. Final run after making discarded ACK an explicit thrown/caught fixture failure and removing unused inherited helpers: 3/3 PASS, 7.642 seconds. Syntax and diff checks PASS.

## Observed

- Actual full base migrations plus fixed private SQL run in owned PostgreSQL Docker container with network none and Unix socket only.
- Fake HTTP server binds dynamic port on 127.0.0.1. Request carries no credentials. Exact serializer UTF-8 bytes and payload SHA match the one received request.
- Existing reserve/dispatch budget primitives create synthetic attempt. Private intent before send; send_ack only after Node request finish (local write completion, not remote receipt). Actual fake HTTP response supplies closed selection/usage to frozen TS constructor; real SQL records response; strict frozen TS decoder reads revision 3 with exact expected output/usage digests.
- Controlled response write ACK loss occurs after real SQL commit. Recovery reads the same sole row. A second send is refused; HTTP count remains one.
- Actual loopback timeout and socket disconnect each yield sticky unknown. No second HTTP; wrong lease read and late response are blocked. Ledger remains byte-for-byte unchanged from dispatched state after transport. No settle/release/pending mutation.
- providerOriginVerified, executionAvailable, readyForPublication remain false; reconciliationRequired true. No result artifact or completed work.

## Limits

This is preparation against explicitly frozen sources, not normal-checkout union integration. Only this exclusive test is added; no SQL/TS runtime/registry edits. Owner 560 will integrate registration and switch imports/migrations to accepted checkout when the union exists.

Fake known-zero usage is explicit synthetic protocol input, not observed real provider cost. Unknown transport produces no output receipt and does not normalize unknown ledger cost to zero. No real provider, fee, target deployment/migration, public executor/claimer/grant, publication, settlement or completion acceptance. Existing tuple/NULL negative matrices are not rerun here. Parent #561 remains open.
