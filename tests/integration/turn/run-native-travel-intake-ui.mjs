/** Owned native UI consumer. Run only after Main freezes/integrates the real backend. */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,existsSync,writeFileSync,createWriteStream} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {randomUUID as uuid} from 'node:crypto';
import {createNativeTextEnvironment} from './native-text-environment.mjs';
const output=process.env.VP_NATIVE_INTAKE_OUTPUT,device=process.env.VP_NATIVE_ASSISTANT_SIMULATOR,freeze=process.env.VP_NATIVE_INTAKE_BACKEND_FREEZE;
assert(output&&isAbsolute(output)&&!existsSync(output),'Fresh absolute evidence directory required');
assert.equal(device,'5DB8E4CE-76AA-48A7-8F9C-861AF1A25E6E','Only the registered owned Simulator is allowed');
assert.equal(process.env.VP_NATIVE_HTTP_PORT_BASE,'63220','Only the owned disposable base is allowed');
assert(freeze&&/^[a-f0-9]{40}$/.test(freeze),'Exact Main-frozen backend commit required');
execFileSync('git',['merge-base','--is-ancestor',freeze,'HEAD']);
assert(existsSync('lib/server/turn/native-travel-intake-http.ts'),'Real backend must be integrated before this test');
mkdirSync(output,{recursive:true});
const dd='/tmp/vpj81-native-task-activity-20261002';
async function run(args,name){
 const log=createWriteStream(join(output,name+'.log'));
 writeFileSync(join(output,name+'.command.json'),JSON.stringify({command:'xcodebuild',args})+'\n');
 const child=spawn('xcodebuild',args,{stdio:['ignore','pipe','pipe']});child.stdout.pipe(log);child.stderr.pipe(log);
 const code=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});log.end();
 assert.equal(code,0,name+' failed; see owned evidence log');
}
let e;
try{
 await run(['build-for-testing','-project','ios/VisePanda/VisePanda.xcodeproj','-scheme','VisePanda','-destination','platform=iOS Simulator,id='+device,'-derivedDataPath',dd,'CODE_SIGNING_ALLOWED=YES','CODE_SIGNING_REQUIRED=YES','CODE_SIGN_IDENTITY=-'],'build');
 e=await createNativeTextEnvironment();const user=e.users[2];
 async function call(path,token,body){
  const response=await fetch(e.api+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
  assert(response.ok,'Synthetic fixture admission failed');return response.json();
 }
 const attemptId=uuid(),credential=await call('/api/auth/native/v2/credentials',null,{email:user.email,password:user.password,attemptId});
 await call('/api/auth/native/v2/login',credential.accessToken,{attemptId});
 await call('/api/chat/native/v5/consent',credential.accessToken,{policyId:e.policyId,noticeHash:e.noticeHash});
 const conversation=uuid(),goal=uuid();
 await call('/api/chat/native/v5/conversation',credential.accessToken,{conversationId:conversation,goalId:goal,messageId:uuid(),idempotencyKey:uuid(),policyId:e.policyId,locale:'en',text:'Explicit travel requirements fixture',relationship:'goal_start',expectedGoalVersion:null,taskId:null,parentMessageId:null,turnId:null});
 const profile={VP_NATIVE_TRAVEL_INTAKE:'1',VP_NATIVE_TEXT_API_URL:e.api,VP_NATIVE_TEXT_UI_EN_EMAIL:user.email};
 const patched=join(output,'Intake.xctestrun');
 execFileSync('python3',['-c',`import sys,pathlib,plistlib,json
sources=[p for p in pathlib.Path(sys.argv[1]).glob('*.xctestrun') if p.name!='AssistantConversation.xctestrun'];assert len(sources)==1
data=plistlib.loads(sources[0].read_bytes());data['VisePandaUITests'].setdefault('EnvironmentVariables',{}).update(json.loads(sys.stdin.read()))
path=pathlib.Path(sys.argv[2]);path.write_bytes(plistlib.dumps(data));path.chmod(0o600)
`,join(dd,'Build/Products'),patched],{input:JSON.stringify(profile)});
 await run(['test-without-building','-xctestrun',patched,'-destination','platform=iOS Simulator,id='+device,'-parallel-testing-enabled','NO','-resultBundlePath',join(output,'tests.xcresult'),'-only-testing:VisePandaUITests/NativeTravelIntakeUITests/testExplicitInputCorrectionClearAndCurrentStatus'],'tests');
 const rows=JSON.parse(e.sql(`select coalesce(json_agg(json_build_object('revision',intake_revision,'intake',intake) order by intake_revision),'[]') from turn_private.assistant_travel_intakes where owner_id='${user.id}' and goal_id='${goal}';`));
 assert.equal(rows.length,3);assert.deepEqual(rows.map(r=>r.revision),[1,2,3]);assert.deepEqual(rows.map(r=>r.intake.city),['shanghai','beijing',null]);
 const original={...rows[0].intake};delete original.city;
 for(const row of rows){const untouched={...row.intake};delete untouched.city;assert.deepEqual(untouched,original);}
 assert.equal(e.counts.http,0);assert.equal(e.sql('select count(*) from public.model_budget_attempts;'),'0');
 assert.equal(e.sql(`select count(*) from public.trips where owner_id='${user.id}';`),'0');
 writeFileSync(join(output,'summary.json'),JSON.stringify({result:'PASS',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),backendFreeze:freeze,
  scope:'actual disposable Auth/HTTP/SQL and native UI; explicit synthetic inputs; no provider',inputRevisions:3,fullReplacementUntouchedFields:true,explicitNullClear:true,modelCalls:0,taskAttempts:0,tripWrites:0,
  unrun:['stale correction CAS seam','physical device/VoiceOver','Staging/Production','real user acceptance','full #562/#559 acceptance']},null,2)+'\n');
}finally{if(e)await e.cleanup();}
