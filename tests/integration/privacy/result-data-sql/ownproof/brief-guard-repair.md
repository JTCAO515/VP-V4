# Brief 9800 audit guard cost repair

Original remote PR669 run37616091792/head1229795b PG tests666/pass665/fail1,
statement timeout at Result guard line7, remains FAIL in sole TS
CI-FINDING-1229795b.md. Guide withdrawal service_tasks55P03 is a separate UNKNOWN
and is neither explained nor changed by this repair. No060000 writer was touched.

Local original Brief append/ACL prerequisite and export-bound test both PASS
before and after with original9800 rows,5s SQL timeout,BRIEF_LIMIT and30s lease
oracles unchanged. Local success is not a claim that remote CI had no failure.
The controlled actual9800 INSERT/rollback diagnosis retains every original guard,
tracks function time and samples waits without changing the timeout. Before:
result.guard_source9800 calls total2079.448ms; notification parent helper19600
calls total1249.695ms; insert execution2167.653ms. After: same guard9800 calls
698.745ms, no irrelevant notification helper calls; ordinary typed JSON recursion
39200 calls and reference-kind196000 calls match before exactly. Both runs show
active/no wait samples and zero blockers; no disk reads in the statement explain.
This identifies redundant empty notification parent queries as observed local
CPU cost, not an assertion about unknown remote host load or a Guide lock cause.

Runtime delta is only parents_v1's call-site IF for outbox/attempts/operations,
exactly the three existing relation predicates in notification_parents_v1.
No audit-table allowlist/empty-field bypass, capacity reduction, timeout increase,
JSON shortcut, OLD/NEW weakening, account-cascade change, fence/grant/registry/
schema change, or full matrix rerun. Every row still gets the complete typed JSON
walk; INSERT/UPDATE/DELETE retain the same original guard body and entity locks.

Actual PG before/after parent sets equal for source-free Brief, typed Brief,
future typed fields, and all three notification relationships; actual original
account cascade PASS. Actual scoped negative cases for typed/plural/task_result
refs, Brief original BYTEA/malformed bytes, and real incoming-writer/NOWAIT erase
plus permanent late reference fence:3 PASS0FAIL/SKIP. Profile928948 append loaded
in the same owned PG transaction reports profile.schema_v1=true and
result.schema_supported_v1=true, then rolls back. Profile's reviewed function
body-hash set excludes result.parents_v1, and trigger definitions/signatures and
all application hashes remain byte-identical. NoProfile07020000 change required.

Original after Brief prerequisite/export2PASS0FAIL/SKIP and all above diagnosis
logs are in this ownproof directory. Ordinary full source/copy/TTL/Native/Auth
matrices remain unchanged evidence; only the affected CI verification should run
on the new integrated head. All user/account/fixture grants are local disposable
PG fixtures, not target activation. No remote/provider/config/deploy action.
