# PR670 head03a fresh PG failures: independent evidence

Completed PG job112842338981/run37635899278 on exact03a067fa is distinct from
old3201. Coordinator supplied its normal downloaded log; no repeated download
or blind retry. Isolated691/688PASS/3FAIL/0skip: Profile capacity subcase + parent,
and original Brief bounds subcase. Old cleanup missing-container failure is gone.

Profile.test137/143 expected PROFILE_SCOPE_TOO_LARGE but got statement timeout
in progress_v1 line6 at IF/publicRPC line19. Original10000 count,1MB envelope and
source30s/existing5s SQL budget are unchanged. Sole ProfileSQL01a11608 owns cost
proof and narrow source fix; TS does not concurrently edit the migration.

Brief original file258 inserts9800 source-free audit rows after201 and expects
exit0, then original BRIEF_LIMIT. Actual CI exit3/5s timeout stack showed the
ordinary auth.users FK SELECT FOR KEY SHARE. Stack position alone is not proof
of a lock, CPU cause, old669 cause or flaky execution; no CI PID/wait/cost was
available. Remote root cause remains UNKNOWN, not claimed fixed.

## Necessary owned local counterexample, not CI acceptance

One network-none uniquely owned PG1a166c58 replayed all current147 migrations.
Original append/ACL prerequisite + exact original export bounds cases2PASS0skip;
no source/case/9800 count/5s timeout/30s lease/oracle change. Same real9800 INSERT
was separately explained in a rolled-back transaction with actual function cost
and backend PID wait/blocker samples,5s still active.

EXPLAIN execution792.062ms; process elapsed861.441ms. FKcase13.902ms,FKowner13.279ms,
Result source trigger718.221ms/9800calls. Original complete typed walk39200 and
reference-kind196000 calls remain. Ten samples of PID1542 were active with null
wait type/event and blocker arrays empty. See adjacent actual JSON/log. This proves
only this local execution; it does not disprove or explain the remote timeout.
Owned container cleanup PASS. No target grants/config/provider/fees/deployment.

Initial local selection omitted original prerequisite case72 (where test-only
RPC grant/settings are prepared), so selected bounds failed permission denied
before9800. Setup FAIL + cleanupPASS is retained in brief-setup-fail.log; it was
not a runtime/schema result or an overwritten successful log. Subsequent selector
included original prerequisite, without inventing a new grant or weakening a guard.

Main26e60d read the actual JSON/case output and ruled no additional Brief/Result
owner diagnostic or local matrix this turn. Brief source remains untouched; source
cost snapshot is a counterexample, not a fix. After actual Profile progress source
increment, normal new-head CI retains all original Brief oracles/gates. If failure
recurs on that new head, use its actual added evidence for targeted diagnosis.
No old03a rerun, timeout/row-limit adjustment, skip waiver or merge bypass.
