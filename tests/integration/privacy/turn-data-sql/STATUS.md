# Turn SQL checkpoint

Own migration `20261007050000_turn_data.sql`; base `2b60e4fdf272f44ab8111491df5a30b36cf4554a`.
Source schema SHA256 `1629f0b1382aa08a6bc8dfbe5c2f49f9775991691819f593ea95a9f57b5917a1`.
Profile/Export ff1 dependency remains unmerged. Shared candidates remain unapplied pending exact Main lease.

Observed in disposable network-none PostgreSQL 17, SQL claims fixture:

- Complete predecessor migrations + new own migration: applied; exact 35-source schema check true.
- Actual completed legacy Turn preview: eligible; TS current decodeTurnPreview accepted.
- Finite progress erase clears one preview, keeps Turn text; original whitespace-bearing mutation bytes recover identical immutable receipt; reserialized bytes rejected. TS decodeTurnReceipt accepted.
- Actual 35-group fixed-order snapshot with typed bigint/xid8 strings, real operations and operation fence: TS closed decoder accepted.
- Shared metadata candidate delta: two source shapes and two FKs added, no old shape/FK changes; 13 relevant existing-source guards plus two own immutable triggers added to Profile's strict trigger inventory, old trigger removals zero.

Sensitive erase requires every reviewed source guard installed. D2 managed provenance requires fixed hooks. These remain fail closed until lease; sensitive effects, OLD/NEW concurrent writer proof, registered signed Auth and original encrypted private download are not claimed by this checkpoint. Shared candidate `review.sql` preserves exact original pg_get_functiondef baselines. Entire application catalog is pinned, including this namespace; unknown empty table/column/FK changes are rejected.

Run from the sole SQL worktree: `node tests/integration/privacy/turn-data-sql/runtime.mjs`, then `behavior.mjs`, `progress.mjs`, `export-snapshot.mjs` in that directory. Runtime starts a disposable database, never a target. Its container is retained for scoped follow-up and must be removed after tests. Temporary outputs contain synthetic fixture data only. Browser/Auth/Native/target acceptance belongs to the original integrators.
