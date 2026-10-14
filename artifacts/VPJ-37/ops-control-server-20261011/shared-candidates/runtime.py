import more as m
import generate as g
import json
candidate=g.candidate;W1=g.W1;NATIVE=g.NATIVE
candidate('lib/server/model-gateway/adapters/http-transport.ts',[
 ('export type DestinationReceipt', 'export type DestinationReceipt'),
],W1) if False else None
candidate('lib/server/model-gateway/adapters/http-transport.ts',[
 ('export type HttpTransportDependencies', 'export type HttpTransportDependencies'),
],W1) if False else None
# Entry import is inserted before the existing first import; no global transport bypass.
path='lib/server/model-gateway/adapters/http-transport.ts';first=(g.ROOT/path).read_text().splitlines()[0]
candidate(path,[(first,'import {opsRefusalCode,OpsControlRefusal} from "../../observability/ops-control/refusal.ts";\n'+first),
 ('    } catch {\n      controller.abort();\n      throw unavailable();','    } catch (error) {\n      controller.abort();\n      const refusal=opsRefusalCode(error);if(refusal)throw new OpsControlRefusal(refusal);\n      throw unavailable();')],W1)
candidate('lib/server/turn/planning-comparison-worker.ts',[
 ('import { createHash, randomUUID }','import {decodeOpsRefusal,decodeOpsPause,OpsControlRefusal} from "../observability/ops-control/refusal.ts";\nimport { createHash, randomUUID }'),
 ('    if(result.kind!=="completed"||result.accounting!=="settled") return await pause(rpc,lease);','    if(result.kind!=="completed"||result.accounting!=="settled") return await pause(rpc,lease);'),
 ('p_scope_id:config.scopeId,p_attempt_id:attemptId});return record(decision)&&decision.kind==="authorized";','p_scope_id:config.scopeId,p_attempt_id:attemptId});const refused=decodeOpsRefusal(decision);if(refused)throw new OpsControlRefusal(refused);return record(decision)&&decision.kind==="authorized";'),
 ('  if(!record(result)||result.kind!=="paused_unknown")throw Error("Planning pause acknowledgement unknown");','  if(!decodeOpsPause(result)&&(!record(result)||result.kind!=="paused_unknown"))throw Error("Planning pause acknowledgement unknown");')],W1)
candidate('lib/server/turn/planning-v2-model-step.ts',[
 ("import {PLANNING_COMPARISON_PROMPT}", "import {decodeOpsRefusal,opsRefusalCode,OpsControlRefusal,type OpsRefusalCode} from '../observability/ops-control/refusal.ts';\nimport {PLANNING_COMPARISON_PROMPT}"),
 (' let output:PlanningV2ModelOutputReceipt|null=null;',''' let output:PlanningV2ModelOutputReceipt|null=null;let refusal:OpsRefusalCode|null=null;
 const authorize=async(effect:'model_reserve'|'model_dispatch',s:AbortSignal)=>{
  const value=await ports.authorize(effect,b,s),code=decodeOpsRefusal(value);
  if(code){refusal=code;throw new OpsControlRefusal(code);}return authority(value,effect,b);
 };'''),
 ("authority(await ports.authorize('model_reserve',b,signal),'model_reserve',b)", "await authorize('model_reserve',signal)",2),
 ("authority(await ports.authorize('model_dispatch',b,signal),'model_dispatch',b)", "await authorize('model_dispatch',signal)"),
 ("const result=await attemptBudget(name,p);", "const result=await attemptBudget(name,p);const denied=decodeOpsRefusal(result);if(denied)refusal=denied;"),
 ("  return result.kind==='completed'&&result.accounting==='settled'&&output?", "  const denied=result.kind==='completed'&&result.value.kind==='unavailable'?opsRefusalCode(result.value.code):refusal;\n  if(denied)return {kind:'ops_refused',code:denied} as const;\n  return result.kind==='completed'&&result.accounting==='settled'&&output?"),
 (" }catch{return {kind:'unknown'} as const;}", " }catch(error){const denied=opsRefusalCode(error);return denied?{kind:'ops_refused',code:denied} as const:{kind:'unknown'} as const;}")],W1)
candidate('lib/server/turn/planning-v2-bounded-worker.ts',[
 ("import {createHash,randomUUID}", "import {decodeOpsPause,decodeOpsRefusal,OpsControlRefusal} from '../observability/ops-control/refusal.ts';\nimport {createHash,randomUUID}"),
 ("try{const v=await ports.rpc('pause_planning_intake_work_v1',{...six(lease),p_reason:reason},cleanup.signal);return row(v)","try{const v=await ports.rpc('pause_planning_intake_work_v1',{...six(lease),p_reason:reason},cleanup.signal);if(row(v)&&exact(v,['kind','taskId','turnId','code','accounting'])&&v.taskId===lease.taskId&&v.turnId===lease.turnId&&decodeOpsPause({kind:v.kind,code:v.code,accounting:v.accounting}))return 'paused' as const;return row(v)"),
 ("if(result.kind!=='settled')return await pause('reconciliation');output=result.output;","if(result.kind==='ops_refused')return await pause('blocked');if(result.kind!=='settled')return await pause('reconciliation');output=result.output;")],W1)
candidate('lib/server/turn/planning-v2-hosted-job.ts',[
 ("import {nativeRequestScope}","import {decodeOpsRefusal,OpsControlRefusal} from '../observability/ops-control/refusal.ts';\nimport {nativeRequestScope}"),
 ("    if(saved===null||typeof saved!=='object'", "    const refused=decodeOpsRefusal(saved);if(refused)throw new OpsControlRefusal(refused);\n    if(saved===null||typeof saved!=='object'")],W1)
(g.OUT/'pins.json').write_text(json.dumps({'base':g.BASE,'privateHead':g.PRIVATE_HEAD,'applied':False,'files':g.entries},indent=2)+'\n')
print(f'{len(g.entries)} candidates written; no shared apply')
