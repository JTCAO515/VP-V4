from pathlib import Path
import re,subprocess,shutil,json,hashlib
root=Path.cwd();out=root/'artifacts/VPJ-13/idea-result-server-20261012';meta=json.loads((out/'shared-candidates/manifest.json').read_text());w2=Path(meta['beforeSourceWorktree'])
assert hashlib.sha256((w2/meta['path']).read_bytes()).hexdigest()==meta['before']
stage=Path('/private/tmp/vpj13-e1-w2-source-check-2c8136');stage.mkdir(exist_ok=True)
shutil.copytree(w2/'lib',stage/'lib',dirs_exist_ok=True)
shutil.copytree(root/'lib/server/journey-entry/idea-result',stage/'lib/server/journey-entry/idea-result',dirs_exist_ok=True)
(stage/meta['path']).write_bytes((out/'shared-candidates/planning-v2-bounded-worker.after.ts.txt').read_bytes())
if not (stage/'node_modules').exists():(stage/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
args=['node','node_modules/typescript/bin/tsc','--noEmit','--strict','--target','es2017','--lib','esnext,dom,dom.iterable','--module','esnext','--moduleResolution','bundler','--allowImportingTsExtensions','--skipLibCheck','--esModuleInterop','--typeRoots',str(root/'node_modules/@types'),str(stage/meta['path'])]
with (out/'w2-candidate-typecheck.log').open('w') as log:subprocess.run(args,stdout=log,stderr=subprocess.STDOUT,check=True)
s=(root/'tests/contract/turn/planning-v2-bounded-worker.test.ts').read_text()
s=re.sub(r"from '([^']+)'",lambda m:"from '"+(str(stage/'lib'/m[1].split('/lib/')[1]) if '/lib/' in m[1] else m[1])+"'",s)
s="import {projectQualifiedIntakeComparison} from '"+str(stage/'lib/server/artifacts/qualified-intake-comparison.ts')+"';\n"+s
s=re.sub(r"case 'project_planning_intake_comparison_v1':return .*?;\n","case 'project_planning_intake_comparison_v1':return projectQualifiedIntakeComparison(qualified,{...lease.source,contextDigest:lease.intakeContextDigest},place,lease.locale,Date.now(),lease.environment);\n",s)
s=s.replace("profileMismatch?:boolean;completedPlace?:boolean", "profileMismatch?:boolean;completedPlace?:boolean;opsRefuse?:'model_reserve'|'model_dispatch'")
s=s.replace("events.push(effect);return options.revokeDispatch", "events.push(effect);if(options.opsRefuse===effect)return {kind:'blocked',code:'OPS_CONTROL_DISABLED'};return options.revokeDispatch")
s=s.replace("case 'pause_planning_intake_work_v1':return {kind:'paused',taskId:lease.taskId,turnId:lease.turnId};", "case 'pause_planning_intake_work_v1':return options.opsRefuse?{kind:'ops_paused',taskId:lease.taskId,turnId:lease.turnId,code:'OPS_CONTROL_DISABLED',accounting:'not_dispatched'}:{kind:'paused',taskId:lease.taskId,turnId:lease.turnId};")
s+="""\ntest('E1 adapter preserves W2 operational reserve and dispatch refusal with original pause accounting',async()=>{\n for(const opsRefuse of ['model_reserve','model_dispatch'] as const){const f=fixture({completedPlace:true,opsRefuse});assert.equal(await runPlanningV2BoundedWorker(f.config,f.ports,new AbortController().signal),'paused');assert.equal(f.sends,0);assert.ok(!f.events.includes('complete_planning_intake_comparison_v1'));assert.ok(f.events.includes('pause_planning_intake_work_v1'));}\n});\n"""
(stage/'worker.test.ts').write_text(s)
with (out/'w2-candidate-behavior.log').open('w') as log:subprocess.run(['node','--test','--test-name-pattern','full mocked|lost output|unknown tool|caller reservation|E1 adapter preserves',str(stage/'worker.test.ts')],stdout=log,stderr=subprocess.STDOUT,check=True)
print('W2 actual dependency graph + E1 candidate strict typecheck and 5 mocked-worker cases PASS; shared source untouched')
