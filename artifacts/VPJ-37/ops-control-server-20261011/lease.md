# W2 private-path lease

Owner: this independent Server/Ops UI chat. Current Main: 01a12dad-d333-70c3-9bf9-58cc26f1803d.
Original Main 01a12606-1eb9-70e7-8bfe-02684406c02e coordination lease revoked.
Base: 9ee43aa280f7b57f2ed3245db2a2ca805baebf8b; branch vpj37-ops-control-server-20261011.
Exclusive new paths: lib/server/observability/ops-control/**, app/api/ops/controls/**,
app/ops/controls/**, tests/contract/observability/ops-control-*.test.mjs,
artifacts/VPJ-37/ops-control-server-20261011/**.
No local stack, host, port, scheduler, Simulator or database allocated.
Shared request/worker/adapters/flags/budget/SQL/tests/CI remain candidate-only until
current holder release and Main's exact lease. No PR677 dependency. Original root dirty retained.

2026-10-12: normal fast-forward to 4f3c7b322316f3c6be3d505bdeb86b300a1596f4; private dirty preserved. API/DTO frozen by current Main, shared/migration fullbody still HOLD.
