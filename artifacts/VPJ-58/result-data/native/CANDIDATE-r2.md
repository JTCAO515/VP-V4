# ResultData Native candidate r2

Sole fixed TS producer/contract: 725827b02ac5e1057fe8504e6fea34717b7f7101. No separate Native wire. Fixtures emitted by its `tests/integration/privacy/result-data/emit-native-fixtures.mjs`: 10 self-validated response envelopes plus exact original commands (whitespace preserved).

Actual Xcode 27.0 / iOS 26.5 Simulator test evidence against a temporary full App source copy with the exact 10-file SharedNative.patch candidate. Shared source in this worktree remained untouched until Main granted the TripView4 hunk; only that hunk has been applied here so far.

- r1: full App compile PASS; 55 tests, 54 PASS / 1 FAIL / 0 SKIP. Only failing new explicit confirmation fixture had decidedAt future relative to its own mocked client clock; strict decoder correctly rejected it. Old FiveResult/LibrarySources/Knowledge 45 tests PASS; unchanged regression evidence reused.
- r2: fixture time repaired; current own Consumer scope lifecycle and exact confirmation summary included; full App incremental compile PASS; own NativeResultDataTests + NativeResultDataStorageTests: 10 PASS / 0 FAIL / 0 SKIP.
- r1 result: `/Users/jtsm5p/Library/Developer/XcodeBuildMCP/workspaces/Codex-64a03d9ff053/result-bundles/test_sim_2026-10-07T09-48-34-944Z_pid46004_9c27a79e.xcresult`.
- r2 result: `/Users/jtsm5p/Library/Developer/XcodeBuildMCP/workspaces/Codex-64a03d9ff053/result-bundles/test_sim_2026-10-07T09-51-12-871Z_pid46004_8d9bd2d3.xcresult`.

Covered: TS closed schemas; all artifact revisions/events; canonical numeric PG-bigint event IDs; malformed/foreign/epoch/authority/count/partial-graph rejection; current actor/session/generation; start-bound30s; explicit selection and exact current confirmation; restart/unknown ACK retained original bytes; authoritative immutable receipt after original TTL; projection cleanup must succeed before journal completion; malformed recover does not enable retry; old response cannot publish after suspension; protected receipt file readback/purge/symlink/failure boundary; selected cache identity and unselected identity remain separate; finite old-session operation/fence inventory and progress selection.

This is local synthetic producer + App behavior evidence. Real TS/SQL signed Auth erase/recovery, target grants/config, real device/human/provider/backup remain UNRUN. Shared integration is pending precise Main leases for the remaining9 files; no whole239 completion claim. The earlier macOS protected-file failure in COMPONENTS-r1.md remains separate.
