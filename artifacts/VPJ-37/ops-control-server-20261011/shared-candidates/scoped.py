import runtime as r
import generate as g
import json
candidate=g.candidate;W1=g.W1;NATIVE=g.NATIVE
candidate('lib/server/turn/scoped-edit/executor.ts',[
 ("import { CostGuard }", "import {decodeOpsRefusal,opsRefusalCode,OpsControlRefusal,type OpsRefusalCode} from '../../observability/ops-control/refusal.ts';\nimport { CostGuard }"),
 ("Promise<'persisted'|'declined'|'pending'|'unavailable'>", "Promise<'persisted'|'declined'|'ops_paused'|'pending'|'unavailable'>"),
 ("    const allow=async(effect:'reserve'|'dispatch'|'publish',s:AbortSignal)=>await current(s)&&authorized(await ports.rpc('authorize_scoped_trip_edit_effect_v1',{...params,p_effect:effect},s),b,effect)&&!s.aborted;", """    let refusal:OpsRefusalCode|null=null;
    const pauseOps=async(code:OpsRefusalCode)=>{
      const reason=code==='OPS_CONTROL_DISABLED'?'ops_control_disabled':'ops_scope_unavailable';
      const v=await ports.rpc('pause_scoped_trip_edit_work_v1',{...params,p_reason:reason},signal);
      if(!record(v)||!exact(v,['kind','binding','receipt'])||v.kind!=='ops_paused'||!sameValue(v.binding,b)||!record(v.receipt))return 'pending' as const;
      const p=v.receipt;
      return exact(p,['kind','operationId','tripId','contextId','contextDigest','baseVersion','reason','reused'])&&p.kind==='scoped_edit_pending/1'&&p.operationId===b.operationId&&p.tripId===b.tripId&&p.contextId===b.contextId&&p.contextDigest===b.contextDigest&&p.baseVersion===b.baseVersion&&p.reason===reason&&typeof p.reused==='boolean'?'ops_paused' as const:'pending' as const;
    };
    const allow=async(effect:'reserve'|'dispatch'|'publish',s:AbortSignal)=>{
      if(!await current(s))return false;
      const value=await ports.rpc('authorize_scoped_trip_edit_effect_v1',{...params,p_effect:effect},s),denied=decodeOpsRefusal(value);
      if(denied){refusal=denied;return false;}return authorized(value,b,effect)&&!s.aborted;
    };"""),
 ("if (!record(previous)||!exact(previous,['kind'])||previous.kind!=='missing'||!await allow('reserve',signal)) return 'pending';", "if (!record(previous)||!exact(previous,['kind'])||previous.kind!=='missing'||!await allow('reserve',signal)) return refusal?await pauseOps(refusal):'pending';"),
 ("        if (!effect || p.p_scope_id!==b.scopeId||p.p_owner_id!==b.ownerId||p.p_attempt_id!==b.attemptId || effect!=='finish'&&!await allow(effect,signal)) return {kind:'blocked'};", "        if (!effect || p.p_scope_id!==b.scopeId||p.p_owner_id!==b.ownerId||p.p_attempt_id!==b.attemptId) return {kind:'blocked'};\n        if(effect!=='finish'&&!await allow(effect,signal))return {kind:'blocked'};"),
 ("()=>allow('dispatch',s),guard,ports.transport,s);", "async()=>{const permitted=await allow('dispatch',s);if(!permitted&&refusal)throw new OpsControlRefusal(refusal);return permitted;},guard,ports.transport,s);"),
 ("      if(result.kind!=='completed'||result.accounting!=='settled'||signal.aborted)return 'pending';", "      if(signal.aborted)return 'pending';\n      const denied=result.kind==='completed'&&result.value.kind==='unavailable'?opsRefusalCode(result.value.code):refusal;\n      if(denied)return await pauseOps(denied);\n      if(result.kind!=='completed'||result.accounting!=='settled')return 'pending';")],W1)
candidate('lib/server/turn/scoped-edit/hosted-job.ts',[
 ("import { createHash }", "import {decodeOpsRefusal,OpsControlRefusal} from '../../observability/ops-control/refusal.ts';\nimport { createHash }"),
 ("          if(!authorized(decision,currentBinding,'dispatch'))", "          const denied=decodeOpsRefusal(decision);if(denied)throw new OpsControlRefusal(denied);\n          if(!authorized(decision,currentBinding,'dispatch'))"),
 ("        if(!record(stored)||!exact(stored", "        const denied=decodeOpsRefusal(stored);if(denied)throw new OpsControlRefusal(denied);\n        if(!record(stored)||!exact(stored"),
 ("if(result==='persisted'||result==='declined')return 'persisted';", "if(result==='persisted'||result==='declined'||result==='ops_paused')return 'persisted';")],W1)
candidate('lib/server/trip/scoped-edit/wire.ts',[
 ('reason: "provider_unavailable" | "queued"; reused: boolean','reason: "provider_unavailable" | "queued" | "ops_control_disabled" | "ops_scope_unavailable"; reused: boolean'),
 ('["provider_unavailable", "queued"].includes(String(v.reason))','["provider_unavailable", "queued", "ops_control_disabled", "ops_scope_unavailable"].includes(String(v.reason))')],W1)
candidate('ios/VisePanda/VisePanda/Features/ScopedTripEdit/NativeScopedTripEditStore.swift',[
 ('["queued", "provider_unavailable"].contains(reason)','["queued", "provider_unavailable", "ops_control_disabled", "ops_scope_unavailable"].contains(reason)')],NATIVE)
# Regenerate this one full candidate with both the prior copy and resend-blocking hunk.
g.entries[:]=[e for e in g.entries if e['path']!='ios/VisePanda/VisePanda/Features/ScopedTripEdit/NativeScopedTripEditSheet.swift']
candidate('ios/VisePanda/VisePanda/Features/ScopedTripEdit/NativeScopedTripEditSheet.swift',[
 ('        case "queued": t(', '''        case "OPS_CONTROL_DISABLED", "OPS_SCOPE_UNAVAILABLE", "ops_control_disabled", "ops_scope_unavailable": t("VP editing is paused or the current scope cannot be qualified. Close this sheet to read the same retained Trip and edit manually through its original confirmation flow. Sent operations are not retried automatically.", "VP 编辑暂时停用，或当前范围无法核实。关闭此页可查看同一已有行程，按原确认流程手工调整；不会自动重发已发送操作。")
        case "queued": t('''),
 ('                .accessibilityIdentifier("trip.scoped.recovery.retry")','                .accessibilityIdentifier("trip.scoped.recovery.retry")\n                .disabled(["OPS_CONTROL_DISABLED", "OPS_SCOPE_UNAVAILABLE", "ops_control_disabled", "ops_scope_unavailable"].contains(store.notice ?? ""))')],NATIVE)
(g.OUT/'pins.json').write_text(json.dumps({'base':g.BASE,'privateHead':g.PRIVATE_HEAD,'applied':False,'files':g.entries},indent=2)+'\n')
print(f'{len(g.entries)} candidates written; no shared apply')
