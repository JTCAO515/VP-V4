/** Owned disposable Auth → Library UI; no existing fixture or producer is modified. */
import { createNativeTextEnvironment } from '../turn/native-text-environment.mjs';
import {createClient} from '@supabase/supabase-js';
import {identityLocalEnv} from '../identity/local-supabase.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { randomUUID as uuid } from 'node:crypto';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync, existsSync, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import assert from 'node:assert/strict';
import {nativeHTTPPorts,nativeHTTPChildEnv,nativeHTTPSupabaseConfig,assertNativeHTTPPortsFree} from '../turn/native-http-ports.mjs';

const output=process.env.VP_PROPOSAL_OUTPUT,device=process.env.VP_PROPOSAL_SIMULATOR;
if(!output||!isAbsolute(output)||existsSync(output)||!device||!/^[-0-9a-f]{36}$/i.test(device))throw Error('Fresh absolute output and Simulator required');
if(process.env.DOCKER_HOST||process.env.DOCKER_CONTEXT)throw Error('Docker overrides refused');
const context=execFileSync('docker',['context','show'],{encoding:'utf8'}).trim();
if(!JSON.parse(execFileSync('docker',['context','inspect',context],{encoding:'utf8'}))[0].Endpoints.docker.Host.startsWith('unix:///'))throw Error('Local Docker required');
const ports=nativeHTTPPorts(process.env.VP_NATIVE_HTTP_PORT_BASE||64220),proxyPort=ports.base+32;
await assertNativeHTTPPortsFree(ports);
for(const port of [proxyPort])await new Promise((ok,fail)=>{const s=createServer();s.once('error',()=>fail(Error('Disposable port busy')));s.listen(port,'127.0.0.1',()=>s.close(ok));});
mkdirSync(output,{recursive:true});
const target=mkdtempSync(join(tmpdir(),'vp-proposal-native-')),project='vp-native-ask-'+uuid().slice(0,8);
mkdirSync(join(target,'supabase'));
writeFileSync(join(target,'supabase/config.toml'),nativeHTTPSupabaseConfig(readFileSync('supabase/config.toml','utf8'),project,ports));
cpSync('supabase/migrations',join(target,'supabase/migrations'),{recursive:true});
const env={...process.env,DOCKER_CONTEXT:context,...nativeHTTPChildEnv(ports,target),VISEPANDA_TRIP_PROTOCOL_V2:'true'};
Object.assign(process.env,env);
async function run(command,args,name){
 const log=name?createWriteStream(join(output,name+'.log'),{mode:0o600}):null;
 const child=spawn(command,args,{env,stdio:['ignore','pipe','pipe']});
 if(log){child.stdout.pipe(log);child.stderr.pipe(log);}else{child.stdout.resume();child.stderr.resume();}
 const deadline=setTimeout(()=>child.kill('SIGTERM'),name==='tests'?300000:600000);
 const code=await new Promise((ok,fail)=>{child.once('exit',ok);child.once('error',fail);});clearTimeout(deadline);log?.end();
 if(code!==0)throw Error((name||command)+' failed; inspect private test log');
}
let e,proxy; const routes=[];
try{
 await run('supabase',['start','--workdir',target,'-x','realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor']);
 e=await createNativeTextEnvironment();
 const call=async(path,token,method='GET',body)=>{const r=await fetch(e.api+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.ok(r.ok,'synthetic request status '+r.status);return r.json();};
 const local=identityLocalEnv();
 const service=createClient(local.API_URL,local.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const ok=call;
 const login=async user=>{const attemptId=uuid(),r=await ok('/api/auth/native/v2/credentials',null,'POST',{email:user.email,password:user.password,attemptId});await ok('/api/auth/native/v2/login',r.accessToken,'POST',{attemptId});return r.accessToken;};
 const owner=await login(e.users[0]);
 await ok('/api/chat/native/v5/consent',owner,'POST',{policyId:e.policyId,noticeHash:e.noticeHash});
 const fixture=async({baseVersion=0,title="Synthetic unchanged Trip"}={})=>{
  const a={trip:uuid(),goal:uuid(),conversation:uuid(),root:uuid(),input:uuid(),task:uuid(),turn:uuid(),artifact:uuid(),baseVersion};
  await ok('/api/trips/native/v2',owner,'POST',{tripId:a.trip,title});
  if(baseVersion===1){
   // Legal versioned synthetic baseline only; no fake applied Proposal/event/receipt.
   // Archive metadata is injected below to isolate its eligibility guard.
   e.sql(`update public.trips set head_version=1 where id='${a.trip}';insert into public.trip_version_snapshots(trip_id,owner_id,version,title,content) select id,owner_id,1,title,public.trip_content_snapshot(id,title) from public.trips where id='${a.trip}';`);
  }
  const root={conversationId:a.conversation,messageId:a.root,idempotencyKey:uuid(),policyId:e.policyId,locale:'en',text:'Synthetic reference task context',relationship:'goal_start',goalId:a.goal,expectedGoalVersion:null,taskId:null,parentMessageId:null,turnId:null};
  await ok('/api/chat/native/v5/conversation',owner,'POST',root);
  await ok('/api/chat/native/v5/goals/'+a.goal+'/trip',owner,'POST',{operationId:uuid(),conversationId:a.conversation,sourceMessageId:a.root,expectedGoalScopeVersion:1,expectedLinkVersion:0,action:'link',tripId:a.trip,expectedTripVersion:baseVersion,confirmed:true});
  await ok('/api/chat/native/v2/turns',owner,'POST',{threadId:uuid(),turnId:a.turn,idempotencyKey:uuid(),policyId:e.policyId,locale:'en',text:'Synthetic already-completed source task',serviceTask:{id:a.task,scopeVersion:1,relationship:'new_goal',parentTurnId:null}});
  await ok('/api/chat/native/v5/conversation',owner,'POST',{...root,messageId:a.input,idempotencyKey:uuid(),relationship:'follow_up',expectedGoalVersion:2,parentMessageId:a.root,taskId:a.task});
  for(let n=0;n<160 && e.sql(`select status from public.turns where id='${a.turn}';`)!=='completed';n++)await new Promise(r=>setTimeout(r,100));
  assert.equal(e.sql(`select status from public.turns where id='${a.turn}';`),'completed','actual disposable synthetic source worker completed before artifact publication');
  const patch={expectedVersion:baseVersion,operations:[{kind:'set_title',title:'Synthetic proposed title, never applied'}]};
  const p=await ok('/api/trips/native/v2/'+a.trip+'/proposal',owner,'POST',{patch});
  a.proposal=p.proposalId;a.proposalRevision=p.revision;
  const canonical=await ok('/api/trips/native/v2/'+a.trip+'/proposal?proposalId='+a.proposal,owner);
  assert.equal(canonical.proposal.id,a.proposal);assert.equal(canonical.proposal.revision,a.proposalRevision);
  return a;
 };
 const params=(a,overrides={})=>({p_owner_id:e.users[0].id,p_artifact_id:a.artifact,p_expected_revision:0,p_idempotency_key:uuid(),p_task_id:a.task,p_goal_id:a.goal,p_input_message_id:a.input,p_trip_id:a.trip,p_trip_version:a.baseVersion,p_goal_version:2,p_memory_basis:[],p_content:{schemaVersion:'change-proposal-reference/1',proposalId:a.proposal,proposalRevision:a.proposalRevision,actions:[]},...overrides});
 const pub=async(a,overrides={})=>{const r=await service.rpc('publish_change_proposal_reference_v1',params(a,overrides));assert.ifError(r.error);return r.data;};
 const a=await fixture({title:'Reference available Trip'}),race=await fixture({title:'Revision race Trip'});await pub(a);await pub(race);
 const emptyTrip=uuid();await ok('/api/trips/native/v2',owner,'POST',{tripId:emptyTrip,title:'No saved reference Trip'});
 const other=await login(e.users[1]),otherTrip=uuid();await ok('/api/trips/native/v2',other,'POST',{tripId:otherTrip,title:'Other actor owned Trip'});
 const state=()=>e.sql(`select jsonb_agg(jsonb_build_array(t.id,t.title,t.head_version,(select count(*) from public.trip_events where trip_id=t.id)) order by t.id) from public.trips t where t.id in('${a.trip}','${race.trip}','${emptyTrip}','${otherTrip}');`);
 const before=state(),providerBefore=e.requests.length;
 let bearer,raced=false,revoked=false;
 proxy=createServer(async(req,res)=>{
  try {
   if(req.url==='/__proposal/revoke'&&req.method==='POST'){
    assert.ok(bearer);await ok('/api/chat/native/v5/consent',bearer,'DELETE',{policyId:e.policyId});revoked=true;
    res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');return;
   }
   const parts=[];for await(const part of req)parts.push(part);const bytes=Buffer.concat(parts);
   const headers={...req.headers};delete headers.host;delete headers.connection;delete headers['content-length'];
   const response=await fetch(e.api+req.url,{method:req.method,headers,...(bytes.length?{body:bytes}:{}),redirect:'error'});
   const body=Buffer.from(await response.arrayBuffer());
   if(response.ok&&headers.authorization?.startsWith('Bearer ')&&req.url.startsWith('/api/results/native/v1/change-proposal-reference'))bearer=headers.authorization.slice(7);
   let kind;try {kind=JSON.parse(body).data?.kind;}catch{}
   routes.push({method:req.method,path:new URL(req.url,'http://127.0.0.1').pathname,status:response.status,kind});
   if(!raced&&req.url==='/api/results/native/v1/change-proposal-reference/trip?tripId='+race.trip&&kind==='result_reference'){
    await ok('/api/trips/native/v2/'+race.trip+'/proposal/revision',bearer,'POST',{proposalId:race.proposal,patch:{expectedVersion:0,operations:[{kind:'set_title',title:'Synthetic revision race, never applied'}]}});
    raced=true;
   }
   res.writeHead(response.status,{'Content-Type':'application/json','Cache-Control':'private, no-store'});res.end(body);
  }catch {res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":{"code":"SYNTHETIC_CONTROL_UNAVAILABLE"}}');}
 });await new Promise(ok=>proxy.listen(proxyPort,'127.0.0.1',ok));
 await run('xcodebuild',['build-for-testing','-project','ios/VisePanda/VisePanda.xcodeproj','-scheme','VisePanda','-destination','platform=iOS Simulator,id='+device,'-derivedDataPath','/tmp/vpj79-proposal-native-20261002','CODE_SIGNING_ALLOWED=YES','CODE_SIGN_IDENTITY=-'],'build');
 const products='/tmp/vpj79-proposal-native-20261002/Build/Products',runfile=join(products,'ProposalReferenceEntry.xctestrun');
 const profile={VP_PROPOSAL_ENTRY_TEST:'1',VP_PROPOSAL_API:'http://127.0.0.1:'+proxyPort,VP_PROPOSAL_TRIP:a.trip,VP_PROPOSAL_RACE_TRIP:race.trip,VP_PROPOSAL_EMPTY_TRIP:emptyTrip,VP_PROPOSAL_OTHER_TRIP:otherTrip,VP_PROPOSAL_EMAIL:e.users[0].email,VP_PROPOSAL_PASSWORD:e.users[0].password,VP_PROPOSAL_OTHER_EMAIL:e.users[1].email,VP_PROPOSAL_OTHER_PASSWORD:e.users[1].password,VP_PROPOSAL_REVOKE:'http://127.0.0.1:'+proxyPort+'/__proposal/revoke'};
 try {
  execFileSync('python3',['-c',`import sys,json,plistlib,pathlib
p=pathlib.Path(sys.argv[1]);files=[x for x in p.glob('*.xctestrun') if x.name not in ('ProposalReference.xctestrun','ProposalReferenceEntry.xctestrun')];assert len(files)==1
d=plistlib.loads(files[0].read_bytes());d['VisePandaUITests'].setdefault('EnvironmentVariables',{}).update(json.loads(sys.stdin.read()))
q=p/'ProposalReferenceEntry.xctestrun';q.write_bytes(plistlib.dumps(d));q.chmod(0o600)`,products],{input:JSON.stringify(profile)});
  await run('xcodebuild',['test-without-building','-xctestrun',runfile,'-destination','platform=iOS Simulator,id='+device,'-parallel-testing-enabled','NO','-collect-test-diagnostics','never','-only-testing:VisePandaUITests/NativeProposalReferenceUITests/'+(process.env.VP_PROPOSAL_SAME_TRIP_ONLY==='1'?'testLibrarySameTripSelectionKeepsCurrentCard':'testLibraryOwnedTripDiscoveryExactAndInvalidation'),...(process.env.VP_PROPOSAL_UI_ONLY==='1'?[]:['-only-testing:VisePandaTests/NativeProposalReferenceTests/testFrozenTripDiscoveryIsClosedAndBindsSelectedTrip','-only-testing:VisePandaTests/NativeProposalReferenceTests/testTripDiscoveryExactUsesSharedDeadlineAndSource','-only-testing:VisePandaTests/NativeProposalReferenceTests/testTripDiscoveryCannotOpenAfterSelectionOrAuthorityChanges']),'-resultBundlePath',join(output,'tests.xcresult')],'tests');
 }finally {rmSync(runfile,{force:true});}
 const result=JSON.parse(execFileSync('xcrun',['xcresulttool','get','test-results','summary','--path',join(output,'tests.xcresult')],{encoding:'utf8'}));
 assert.equal(result.passedTests,process.env.VP_PROPOSAL_UI_ONLY==='1'?1:4);assert.equal(result.failedTests,0);assert.equal(result.skippedTests,0);
 if(process.env.VP_PROPOSAL_SAME_TRIP_ONLY==='1') {
  assert.equal(routes.filter(r=>r.path==='/api/results/native/v1/change-proposal-reference/trip').length,1,'reselect does not clear or refetch the current reference');
  assert.equal(routes.filter(r=>r.path==='/api/results/native/v1/change-proposal-reference').length,1,'exact read remains pinned after same-Trip selection');
 }else {assert.ok(raced,'actual Proposal revision between discovery and exact');assert.ok(revoked,'actual owned consent withdrawal');}
 assert.ok(routes.some(r=>r.path==='/api/results/native/v1/change-proposal-reference/trip'&&r.kind==='result_reference'));
 assert.ok(routes.some(r=>r.path==='/api/results/native/v1/change-proposal-reference'&&r.kind==='result_artifact'));
 if(process.env.VP_PROPOSAL_SAME_TRIP_ONLY!=='1')assert.ok(routes.some(r=>r.path==='/api/results/native/v1/change-proposal-reference'&&r.kind==='unavailable'));
 assert.equal(state(),before,'reader and revision never apply Trip changes');assert.equal(e.requests.length,providerBefore);
 writeFileSync(join(output,'summary.json'),JSON.stringify({scope:'owned disposable real Auth/HTTP/SQL full Library Trip→discovery→exact→card',passed:result.passedTests,failed:0,skipped:0,tripUnchanged:true,providerCallsDuringUI:0,revisionBetweenDiscoveryAndExact:raced,consentWithdrawal:revoked,crossActorOwnedTripList:process.env.VP_PROPOSAL_SAME_TRIP_ONLY!=='1',sameTripReselection:process.env.VP_PROPOSAL_SAME_TRIP_ONLY==='1'},null,2)+'\n');
 console.log('PROPOSAL_ENTRY_PASS '+join(output,'summary.json'));
}finally{
 writeFileSync(join(output,'routes-status.json'),JSON.stringify(routes,null,2)+'\n');
 if(proxy){proxy.closeAllConnections();await new Promise(ok=>proxy.close(ok));}
 try {await e?.cleanup();}finally {await run('supabase',['stop','--workdir',target,'--no-backup']);rmSync(target,{recursive:true,force:true});}
}
