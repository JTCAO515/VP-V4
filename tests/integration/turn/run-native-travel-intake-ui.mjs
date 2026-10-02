/** Owned native UI consumer. Run only after Main freezes/integrates the real backend. */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,existsSync,writeFileSync,createWriteStream,readFileSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {randomUUID as uuid,createHash} from 'node:crypto';
import {createNativeTravelIntakeAuthFixture} from './native-travel-intake-auth-fixture.mjs';
import {createNativeTextEnvironment} from './native-text-environment.mjs';
const output=process.env.VP_NATIVE_INTAKE_OUTPUT,device=process.env.VP_NATIVE_ASSISTANT_SIMULATOR,freeze=process.env.VP_NATIVE_INTAKE_BACKEND_FREEZE;
assert(output&&isAbsolute(output)&&!existsSync(output),'Fresh absolute evidence directory required');
assert.equal(device,'5DB8E4CE-76AA-48A7-8F9C-861AF1A25E6E','Only the registered owned Simulator is allowed');
assert.equal(process.env.VP_NATIVE_HTTP_PORT_BASE,'63220','Only the owned disposable base is allowed');
assert(freeze&&/^[a-f0-9]{40}$/.test(freeze),'Exact Main-frozen backend commit required');
execFileSync('git',['merge-base','--is-ancestor',freeze,'HEAD']);
assert(existsSync('lib/server/turn/native-travel-intake-http.ts'),'Real backend must be integrated before this test');
mkdirSync(output,{recursive:true});
const guardOnly=process.env.VP_NATIVE_INTAKE_GUARD_ONLY==='1';
const dd='/tmp/vpj81-native-task-activity-20261002';
async function run(args,name){
 const log=createWriteStream(join(output,name+'.log'));
 writeFileSync(join(output,name+'.command.json'),JSON.stringify({command:'xcodebuild',args})+'\n');
 const child=spawn('xcodebuild',args,{stdio:['ignore','pipe','pipe']});child.stdout.pipe(log);child.stderr.pipe(log);
 const code=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});log.end();
 assert.equal(code,0,name+' failed; see owned evidence log');
}
let e,fixture;
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
 const conversation=uuid(),goal=uuid(),rootMessage=uuid();
 await call('/api/chat/native/v5/conversation',credential.accessToken,{conversationId:conversation,goalId:goal,messageId:rootMessage,idempotencyKey:uuid(),policyId:e.policyId,locale:'en',text:'Explicit travel requirements fixture',relationship:'goal_start',expectedGoalVersion:null,taskId:null,parentMessageId:null,turnId:null});
 if(guardOnly)await call('/api/chat/native/v5/travel-intake',credential.accessToken,{conversationId:conversation,goalId:goal,messageId:uuid(),idempotencyKey:uuid(),policyId:e.policyId,locale:'en',text:'Explicit synthetic input for request-boundary guards',relationship:'follow_up',parentMessageId:rootMessage,expectedGoalVersion:1,expectedIntakeRevision:0,
  intake:{schemaVersion:'stay-area-intake/1',city:'shanghai',comparisonTarget:'area_transport',durationDays:10,partySize:2,interests:['food','photography'],pace:'relaxed',lodgingBudget:null,dates:null,mobilityConstraints:null},memoryBasis:[]});
 fixture=await createNativeTravelIntakeAuthFixture(e,user,conversation,goal);
 const profile={...(guardOnly?{VP_NATIVE_TRAVEL_INTAKE_GUARDS:'1'}:{VP_NATIVE_TRAVEL_INTAKE:'1'}),VP_NATIVE_TEXT_API_URL:fixture.api,VP_NATIVE_INTAKE_CONTROL:fixture.control,VP_NATIVE_TEXT_UI_EN_EMAIL:user.email};
 const paths=['ios/VisePanda/VisePanda/Features/Ask/NativeAssistantConversationView.swift','ios/VisePanda/VisePanda/Features/Ask/NativeTravelIntakeView.swift','ios/VisePanda/VisePanda/Features/Ask/NativeTravelIntakeStore.swift','ios/VisePanda/VisePanda/Features/Ask/NativeTravelIntakeModels.swift','ios/VisePanda/VisePanda/App/NativeSession.swift','ios/VisePanda/VisePandaUITests/NativeTravelIntakeUITests.swift','lib/server/turn/native-travel-intake-http.ts','supabase/migrations/20261002200000_vpj78_explicit_travel_intake.sql'];
 writeFileSync(join(output,'source.json'),JSON.stringify({kind:'REAL_DISPOSABLE_AUTH_NATIVE_UI',mode:guardOnly?'request_guard_only':'full_edit_cas',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),backendUnion:freeze,originalBackendSnapshots:['05c0042c590b79ce41b6f8141799e64b34334e84','4728c18f96d60138cbc6718fc31f5f10ae3ad20b'],device,dd,base:63220,proxy:63252,files:Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]))},null,2)+'\n');
 const patched=join(output,'Intake.xctestrun');
 execFileSync('python3',['-c',`import sys,pathlib,plistlib,json
sources=[p for p in pathlib.Path(sys.argv[1]).glob('*.xctestrun') if p.name!='AssistantConversation.xctestrun'];assert len(sources)==1
data=plistlib.loads(sources[0].read_bytes());data['VisePandaUITests'].setdefault('EnvironmentVariables',{}).update(json.loads(sys.stdin.read()))
def absolutize(v):
 if isinstance(v,str):return v.replace('__TESTROOT__',sys.argv[1])
 if isinstance(v,dict):return {k:absolutize(x) for k,x in v.items()}
 if isinstance(v,list):return [absolutize(x) for x in v]
 return v
data=absolutize(data)
path=pathlib.Path(sys.argv[2]);path.write_bytes(plistlib.dumps(data));path.chmod(0o600)
`,join(dd,'Build/Products'),patched],{input:JSON.stringify(profile)});
 await run(['test-without-building','-xctestrun',patched,'-destination','platform=iOS Simulator,id='+device,'-parallel-testing-enabled','NO','-resultBundlePath',join(output,'tests.xcresult'),'-only-testing:VisePandaUITests/NativeTravelIntakeUITests/'+(guardOnly?'testRealRequestBoundaryGuardsOnly':'testExplicitInputCorrectionClearAndCurrentStatus')],'tests');
 const rows=JSON.parse(e.sql(`select coalesce(json_agg(json_build_object('revision',intake_revision,'intake',intake) order by intake_revision),'[]') from turn_private.assistant_travel_intakes where owner_id='${user.id}' and goal_id='${goal}';`));
 const network=fixture.summary();
 if(guardOnly){assert.equal(rows.length,1);assert.equal(network.nativePosts,0);assert.equal(network.rivalWrites,0);}
 else {
 assert.equal(rows.length,5);assert.deepEqual(rows.map(r=>r.revision),[1,2,3,4,5]);assert.deepEqual(rows.map(r=>r.intake.city),['shanghai','beijing',null,null,'shanghai']);
 assert.equal(rows[0].intake.durationDays,10);assert.equal(rows[0].intake.partySize,2);assert.equal(rows[0].intake.lodgingBudget,null);
 assert(rows.slice(1).every(r=>r.intake.durationDays===12&&r.intake.partySize===3));
 assert.equal(rows[1].intake.lodgingBudget.perNightMinorUnits,45000);assert(rows.slice(2).every(r=>r.intake.lodgingBudget===null));
 for(const row of rows){for(const key of ['interests','pace','dates','mobilityConstraints'])assert.deepEqual(row.intake[key],rows[0].intake[key]);}
 const posts=network.events.filter(x=>x.method==='POST');
 assert.deepEqual(posts.map(p=>p.status),[201,201,201,409,201]);
 assert.equal(posts[4].request.expectedIntakeRevision,4);assert.deepEqual(posts[4].request.memoryBasis,[]);
 assert(posts.filter(p=>p.status===201).every(p=>p.receipt.current&&p.receipt.readyForProvider===false));
 }
 assert(network.sessionProof.sameOwner&&network.sessionProof.changedSession&&network.sessionProof.heldSessionMatchesOld);
 const phases=network.timeline.map(x=>x.kind);assert(phases.indexOf('held_read200')<phases.indexOf('replacement_login200'));
 assert(phases.indexOf('old_session_probe401')<phases.indexOf('release_old_response'));
 assert(network.timeline.some((x,i)=>x.kind==='native401'&&i>phases.indexOf('old_session_probe401')&&i<phases.indexOf('release_old_response')));
 assert(network.sessionReads.some(x=>x.kind==='intake'&&x.sessionHash!==network.sessionProof.oldSessionHash&&x.expectedOwner));
 if(!guardOnly)assert.equal(network.rivalWrites,1);assert.equal(network.sessionReplacements,1);assert.equal(network.withdrawals,1);assert(network.denied401>=1&&network.nativeDenied401>=1&&network.denied403>=1);
 if(guardOnly){
  const trace=execFileSync('xcrun',['simctl','spawn',device,'log','show','--last','10m','--style','compact','--info','--predicate','subsystem == "space.go2china.intake-auth"'],{encoding:'utf8',maxBuffer:4*1024*1024});
  writeFileSync(join(output,'native-safe-trace.log'),trace);
  assert(trace.includes('phase=intake_read_failed_session_unavailable')&&trace.includes('phase=intake_read_failed_policy_blocked'));
  assert(trace.includes('selected=false basis=false writeBasis=false draftCleared=true'));
  const allowed=network.nativeRequests.filter(x=>x.path==='travel_intake'&&x.phase==='received');
  assert(allowed.some(x=>x.status===401)&&allowed.some(x=>x.status===403));
 }
 writeFileSync(join(output,'network-summary.json'),JSON.stringify(network,null,2)+'\n');
 assert.equal(e.counts.http,0);assert.equal(e.sql('select count(*) from public.model_budget_attempts;'),'0');
 assert.equal(e.sql(`select count(*) from public.trips where owner_id='${user.id}';`),'0');
 assert.equal(e.sql(`select count(*) from turn_private.service_tasks where owner_id='${user.id}';`),'0');
 assert.equal(e.sql(`select count(*) from turn_private.assistant_messages where owner_id='${user.id}' and (task_id is not null or turn_id is not null);`),'0');
 writeFileSync(join(output,'summary.json'),JSON.stringify({result:'PASS',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),backendFreeze:freeze,
  scope:'actual disposable Auth/HTTP/SQL and native UI; explicit synthetic inputs; no provider',inputRevisions:rows.length,serviceTasks:0,casConflict:guardOnly?'reused Auth5 actual409':409,sessionGuard:401,withdrawGuard:403,fullReplacementUntouchedFields:guardOnly?'UNRUN in guard case; reused Auth5 prior read cancellation':true,explicitNullClear:guardOnly?'UNRUN in guard case; reused Auth5 prior read cancellation':true,modelCalls:0,taskAttempts:0,tripWrites:0,
  unrun:['physical device/VoiceOver','Staging/Production','real user acceptance','full #562/#559 acceptance']},null,2)+'\n');
}finally{if(fixture){writeFileSync(join(output,'network-final-summary.json'),JSON.stringify(fixture.summary(),null,2)+'\n');await fixture.cleanup();}if(e)await e.cleanup();}
