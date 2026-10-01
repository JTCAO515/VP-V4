# Task-directed exact result reopen — 2026-10-01

The previous native open/refresh path lost selectedArtifactID after restart and read global latest, then checked Task identity. With Task A's valid result followed by Task B's result, that global read returned B and prevented reopening A. The disposable regression demonstrated the mismatch; before implementation the new task route returned HTML 404 and the test failed.

The new owner/Task-only reference RPC uses an indexed, maximum-64 candidate scan and delegates currentness and source permissions to the existing exact reader. NativeSession resolves and opens the exact ID/revision with no global fallback. Native VP open and refresh fence selected Task, data scope and request generation. No writer, worker, usage/profile/deploy change or task-history expansion is included.

PASS: disposable Auth/Next/Postgres native HTTP 8/8 (two Tasks, earlier-task exact reopening, foreign actor, missing, stale, revoked and replaced session); full-migration RLS/ACL 23/23; Simulator AssistantResultIdentityTests/AssistantTaskProjectionTests 3/3; contract 698/698; lint/typecheck/build/docs/diff checks.

Coordinator review requested Task-specific candidate boundaries. The same disposable suite now also proves newer stale candidates do not hide an older current result for that Task; exactly 64 stale candidates return empty, while 65 return unavailable. Private fixture rows are removed before continuing the suite. No Library enumeration is used by the resolver.

INCOMPLETE: default integration 39 pass/133 environment skips; security 192 pass/1 environment skip. The relevant disposable DB lane ran separately. Initial native test compilation failed on a dictionary inference expression and was fixed using an explicit type before passing.

UNRUN: Staging/real provider/physical-device restart, production migration/release and complete #560 acceptance. #562 remains CLOSED; its status is not used as acceptance evidence. #560 remains OPEN.

Rollback: revert the native task-resolution consumer to the prior supported entry before migration application. After application, retain the read-only RPC or use a reviewed forward compatibility migration; do not revive revoked/deleted data. No target writes or paid calls were made.
