from pathlib import Path
import hashlib,json,difflib,subprocess
root=Path.cwd(); out=root/'artifacts/VPJ-13/idea-result-server-20261012/shared-candidates';out.mkdir(exist_ok=True)
w2=Path('/Users/jtsm5p/Documents/Codex/VP-V5-worktrees/vpj37-ops-control-server-20261011');p=w2/'lib/server/turn/planning-v2-bounded-worker.ts';before=p.read_text();assert hashlib.sha256(before.encode()).hexdigest()=='6496b1bfd7d05aaf6399a41e1a29cfdb7a646284d2f14c4449743bc2a3d271d6';w2head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=w2,text=True).strip();after=before.replace("import {runPlanningV2ModelStep,type PlanningV2ModelStepPorts} from './planning-v2-model-step.ts';", "import {type PlanningV2ModelStepPorts} from './planning-v2-model-step.ts';\nimport {runIdeaResultModel} from '../journey-entry/idea-result/model-adapter.ts';\nimport {captureIdeaResultSource,matchesIdeaResultSource,type IdeaResultSource} from '../journey-entry/idea-result/source.ts';\nimport {projectIdeaResult} from '../journey-entry/idea-result/result-projection.ts';")
old="   const prompt=JSON.stringify({goal:input.goalText,delegation:input.delegation,intake:input.qualifiedIntake.intake,observation:place,unknown:['hotel_price','availability','safety','quietness','food','photography','pace_suitability']});\n   const result=await runPlanningV2ModelStep({enabled:true,lease:l,binding,reservedMicros:config.reservedMicros,timeoutMs:config.timeoutMs,maxOutputTokens:config.maxOutputTokens,prompt},ports.model,controller.signal);"
new="   const result=await runIdeaResultModel({enabled:true,lease:l,binding,reservedMicros:config.reservedMicros,timeoutMs:config.timeoutMs,maxOutputTokens:config.maxOutputTokens,observation:place,observedNow:ports.now()},ports.model,controller.signal);"
assert old in after;after=after.replace(old,new)
old="  const current=async()=>{if(controller.signal.aborted)throw Error('Planning stopped');const q=decodePlanningV2Read(await invoke('read_planning_intake_work_v1',six(l)),l);if(!q)throw Error('Planning basis unavailable');return q;};"
new="  let pinnedIdea:IdeaResultSource|null=null;\n  const current=async()=>{if(controller.signal.aborted)throw Error('Planning stopped');const q=decodePlanningV2Read(await invoke('read_planning_intake_work_v1',six(l)),l);if(!q||pinnedIdea&&!matchesIdeaResultSource(q,pinnedIdea))throw Error('Planning basis unavailable');return q;};"
assert old in after;after=after.replace(old,new)
old="  input=await current();\n  const model="
new="  input=await current();pinnedIdea=captureIdeaResultSource(input,l,place,ports.now());if(!pinnedIdea)return await pause('blocked');\n  const model="
assert old in after;after=after.replace(old,new)
old="  const content=projection.content as Row,options=content.options as Row[],contentTuple="
new="  const captured=pinnedIdea;if(!captured)return await pause('stale');\n  const personalized=projectIdeaResult(captured,projection,output,output.binding,ports.now());if(!personalized)return await pause('blocked');\n  const content=personalized.content as unknown as Row,options=content.options as Row[],contentTuple="
assert old in after;after=after.replace(old,new)
(out/'planning-v2-bounded-worker.before.ts.txt').write_text(before);(out/'planning-v2-bounded-worker.after.ts.txt').write_text(after)
patch=''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/lib/server/turn/planning-v2-bounded-worker.ts',tofile='b/lib/server/turn/planning-v2-bounded-worker.ts'))
(out/'planning-v2-bounded-worker.patch').write_text(patch)
meta={'base':'daa7bae44a660381fb3295d0d2afc327ea98d3ba','path':'lib/server/turn/planning-v2-bounded-worker.ts','beforeOwner':'01a126a8-7cb5-7a70-aca6-0ba38c99efe2','beforeOwnerHead':w2head,'beforeSourceWorktree':str(w2),'before':hashlib.sha256(before.encode()).hexdigest(),'after':hashlib.sha256(after.encode()).hexdigest(),'patch':hashlib.sha256(patch.encode()).hexdigest(),'applied':False,'requires':['exact W2 current-holder limited release and Main lease; no wholefile transfer','professional SQL completion validator for source-qualified model selection; no append slot granted','no host/provider/admission activation']}
(out/'manifest.json').write_text(json.dumps(meta,indent=2)+'\n')
sql=root/'supabase/migrations/20261003150000_vpj80_complete_worker_authority.sql';s=sql.read_text();start=s.index('create function public.complete_planning_intake_comparison_v1(');end=s.index('\n\ncreate function public.read_completed_planning_intake_receipt_v1',start)
(out/'complete_planning_intake_comparison_v1.before.sql.txt').write_text(s[start:end]+'\n')
print(json.dumps(meta,indent=2))
