# Non-activated persistent controller candidate

This host library does not load an actual plan or create START/claim records.
A separately reviewed operator must construct the original Budget with
`entry.new_start_budget()`, finalize authorized metadata, bind the exact initial
header/arguments/configuration and three fixed metadata paths, then call
`Controller(...)` and `serve(controller, stdin.fileno(), stdout)` in that same
process. Direct execution refuses. There is no synthetic production CLI mode.

The ordinary exec PTY/session plus later stdin writes keeps that process alive.
Commands are exactly `run_first`, `status`, `abort`, or `repair` with one lowercase
SHA256 of the already bound repair descriptor. Commands cannot provide paths,
Python, shell, SQL, authority, cleanup or causal-qualification booleans. EOF,
interrupt, invalid command, expiration or lost original ownership closes the
controller. No resume, new UUID, Budget deserialization or automatic retry exists.
Waiting continues to consume both original clocks; data reserve120 and cleanup60
remain owned by the unchanged Budget. COMPLETE means the controller finished;
`lastEntryOutcome` separately preserves PASS/FAIL/UNKNOWN boundaries.

After an actual first entry returns a matching attempt1 claim, FAIL and cleanup
PASS, the controller may HOLD. A repair descriptor at the one prebound path has
only `configuration`, `sourceProfile`, and `sourceSha256`. Scope/window/authority
and all non-lock profile fields remain equal; the attempt2 START path is fixed.
Its source hash map names exactly `host-permission-diagnostics.py` and
`container-diagnostic/restore/bridge.py`. At least one must change, and both must
match the descriptor and updated base source lock. All other base-lock inputs,
loaded core hash, entry, profile, provenance and controller bytes are frozen.
Changed clock/runtime/loaded-core dependencies are INELIGIBLE.

This narrow repair class is safe to reload because the unchanged restore adapter
imports its typed bridge on each restore call, and that bridge loads the host
hint helper. The original core/gate/profile objects and original Budget survive;
no cached implementation is relabeled with changed source bytes. Repairs needing
another module or new dependency set are not supported. A new exact source lock
and profile lock still must pass the original strict entry.

Both calls use the real `entry.run` directly. The controller never fabricates
failed-result, consumed-slot, repair-review, causal, approval or cleanup records.
The original entry rechecks all of them and can refuse the second call. A refused
entry closes the controller; there is no alternate path or third invocation.
The controller writes no operator evidence records itself.

Synthetic fixture tests patch entry only inside the test process. The persistent
session proof demonstrates PID/object continuity and explicit dispatch, not real
permission/causal gates, PostgreSQL, material access or actual recovery. Test
processes exit and temporary fixtures are removed. A killed live process cannot
be resumed; existing actual guards/records remain authoritative.

Before any real use, Main must obtain new actual-scope authority and independently
review a concrete operator bootstrap/configuration and exact source bindings.
The old bda window and old directives/used grant are not reusable. Proposed cap
remains at most60 minutes/max2 with original reserves and strict second-attempt
causal repair; this candidate grants none of that execution authority.
