/** Actual NativeSession/URLSession -> closed local HTTP -> ordinary authenticated v2. No worker execution. */
import {createNativeTextEnvironment} from './native-text-environment.mjs';
import {createServer} from 'node:http';
import {randomUUID as uuid,createHash} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {mkdirSync,existsSync,readFileSync,writeFileSync,createWriteStream} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import assert from 'node:assert/strict';
const output=process.env.VP_NATIVE_QUALIFIED_OUTPUT,device='5DB8E4CE-76AA-48A7-8F9C-861AF1A25E6E',dd='/tmp/vpj81-native-task-activity-20261002';
assert(output&&isAbsolute(output)&&!existsSync(output));assert.equal(process.env.VP_NATIVE_HTTP_PORT_BASE,'63220');mkdirSync(output,{recursive:true});
async function run(args,name){const log=createWriteStream(join(output,name+'.log'));writeFileSync(join(output,name+'.command.json'),JSON.stringify({command:'xcodebuild',args})+'\n');const child=spawn('xcodebuild',args,{stdio:['ignore','pipe','pipe']});child.stdout.pipe(log);child.stderr.pipe(log);const code=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject)});log.end();assert.equal(code,0,name+' failed');}
let e,proxy,bearer,armed=false;const held=new Set(),events=[];const counts={admissions:0,posts:0,unauthorized401:0,blocked403:0};
try{
 await run(['build-for-testing','-project','ios/VisePanda/VisePanda.xcodeproj','-scheme','VisePanda','-destination','platform=iOS Simulator,id='+device,'-derivedDataPath',dd,'CODE_SIGNING_ALLOWED=YES','CODE_SIGNING_REQUIRED=YES','CODE_SIGN_IDENTITY=-'],'build');
 e=await createNativeTextEnvironment();const user=e.users[2],planning=uuid(),notice='a'.repeat(64);
 const call=async(path,authorization,method='GET',body)=>{const response=await fetch(e.api+path,{method,headers:{'Content-Type':'application/json',...(authorization?{Authorization:authorization}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};};
 const login=async()=>{const attemptId=uuid(),credentials=await call('/api/auth/native/v2/credentials',null,'POST',{email:user.email,password:user.password,attemptId});assert.equal(credentials.status,200);const header='Bearer '+credentials.body.accessToken;assert.equal((await call('/api/auth/native/v2/login',header,'POST',{attemptId})).status,200);return header;};
 const initial=await login();assert.equal((await call('/api/chat/native/v5/consent',initial,'POST',{policyId:e.policyId,noticeHash:e.noticeHash})).status,200);
 e.sql(`insert into turn_private.planning_policies(id,text_policy_id,environment,notice_version,notice_hash,notice_zh,notice_en,effective_at,expires_at) values('${planning}','${e.policyId}','local_synthetic','qualified-native','${notice}','合成本地','Local synthetic',now()-interval '1 minute',now()+interval '1 day');`);
 assert.equal((await call('/api/chat/native/v5/planning/policy',initial,'POST',{policyId:planning,noticeHash:notice})).status,201);
 const conversation=uuid(),goal=uuid(),projection={schemaVersion:'stay-area-intake/1',city:'shanghai',comparisonTarget:'area_transport',durationDays:10,partySize:2,interests:['food','photography'],pace:'relaxed',lodgingBudget:null,dates:null,mobilityConstraints:null};
 assert.equal((await call('/api/chat/native/v5/travel-intake',initial,'POST',{conversationId:conversation,goalId:goal,messageId:uuid(),idempotencyKey:uuid(),policyId:e.policyId,locale:'en',text:'Explicit synthetic requirements',relationship:'goal_start',parentMessageId:null,expectedGoalVersion:null,expectedIntakeRevision:0,intake:projection,memoryBasis:[]})).status,201);
 const path='/api/chat/native/v5/planning/intake-tasks',query='?conversationId='+conversation+'&goalId='+goal;
 proxy=createServer(async(req,res)=>{try{
  const chunks=[];for await(const c of req)chunks.push(c);const bytes=Buffer.concat(chunks),name=new URL(req.url,'http://127.0.0.1').pathname;
  if(name==='/__qualified/control'){
   if(req.method==='POST'){
    const op=Object.keys(JSON.parse(bytes))[0];
    if(op==='arm')armed=true;
    else if(op==='release'){for(const release of held)release();}
    else if(op==='replace'){await login();}
    else if(op==='withdraw'){assert.equal((await call('/api/chat/native/v5/planning/policy',bearer,'DELETE',{policyId:planning})).status,200);}
    else if(op==='correct'){
     const old=await call('/api/chat/native/v5/travel-intake'+query,bearer);assert.equal(old.status,200);const b=old.body;
     assert.equal((await call('/api/chat/native/v5/travel-intake',bearer,'POST',{conversationId:conversation,goalId:goal,messageId:uuid(),idempotencyKey:uuid(),policyId:e.policyId,locale:'en',text:'Explicit synthetic correction',relationship:'amendment',parentMessageId:b.messageId,expectedGoalVersion:b.goalVersion,expectedIntakeRevision:b.intakeRevision,intake:b.intake,memoryBasis:b.memoryBasis})).status,201);
    }else throw Error('Unsupported local operation');
   }
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({...counts,held:held.size}));return;
  }
  if(req.headers.authorization)bearer=req.headers.authorization;
  const headers={...req.headers};delete headers.host;delete headers.connection;delete headers['content-length'];
  const upstream=await fetch(e.api+req.url,{method:req.method,headers,...(bytes.length?{body:bytes}:{}),redirect:'error'}),reply=Buffer.from(await upstream.arrayBuffer());
  if(name===path){counts.posts++;if(upstream.status===201)counts.admissions++;if(upstream.status===401)counts.unauthorized401++;if(upstream.status===403)counts.blocked403++;
   events.push({status:upstream.status,request:JSON.parse(bytes),receipt:JSON.parse(reply)});
   if(armed&&upstream.status===200){armed=false;await new Promise(resolve=>{const release=()=>{held.delete(release);resolve();};held.add(release);});}
  }
  res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'application/json','Cache-Control':'private, no-store'});res.end(reply);
 }catch{res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'OWNED_FIXTURE_FAILED'}}));}});
 await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(63252,'127.0.0.1',resolve);});
 const profile={VP_NATIVE_QUALIFIED_DELEGATION_TRANSPORT:'1',VP_NATIVE_QUALIFIED_DELEGATION_API:'http://127.0.0.1:63252',VP_NATIVE_QUALIFIED_DELEGATION_EMAIL:user.email,VP_NATIVE_QUALIFIED_DELEGATION_CONVERSATION:conversation,VP_NATIVE_QUALIFIED_DELEGATION_GOAL:goal,VP_NATIVE_QUALIFIED_DELEGATION_TEXT_POLICY:e.policyId,VP_NATIVE_QUALIFIED_DELEGATION_PLANNING_POLICY:planning};
 const patched=join(output,'Qualified.xctestrun');execFileSync('python3',['-c',`import sys,pathlib,plistlib,json
p=list(pathlib.Path(sys.argv[1]).glob('*.xctestrun'));assert len(p)==1
data=plistlib.loads(p[0].read_bytes());data['VisePandaTests'].setdefault('EnvironmentVariables',{}).update(json.loads(sys.stdin.read()))
def fix(v):
 if isinstance(v,str):return v.replace('__TESTROOT__',sys.argv[1])
 if isinstance(v,dict):return {k:fix(x) for k,x in v.items()}
 if isinstance(v,list):return [fix(x) for x in v]
 return v
out=pathlib.Path(sys.argv[2]);out.write_bytes(plistlib.dumps(fix(data)));out.chmod(0o600)
`,join(dd,'Build/Products'),patched],{input:JSON.stringify(profile)});
 const files=['ios/VisePanda/VisePanda/Features/Ask/NativeQualifiedDelegationModels.swift','ios/VisePanda/VisePanda/Features/Ask/NativeQualifiedDelegationStore.swift','ios/VisePanda/VisePandaTests/NativeQualifiedDelegationTransportTests.swift','lib/server/turn/native-planning-intake-http.ts'];
 writeFileSync(join(output,'source.json'),JSON.stringify({head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),backend:'f9cea1735b42cbb7f9cec76503116e9e256cc86e',kind:'LOCAL_TESTPROCESS_NATIVE_SESSION_HTTP_RPC_NO_EXECUTION',device,dd,base:63220,files:Object.fromEntries(files.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]))},null,2)+'\n');
 await run(['test-without-building','-xctestrun',patched,'-destination','platform=iOS Simulator,id='+device,'-parallel-testing-enabled','NO','-only-testing:VisePandaTests/NativeQualifiedDelegationTransportTests','-resultBundlePath',join(output,'tests.xcresult')],'tests');
 assert.deepEqual(events.map(x=>x.status),[201,200,200,200,401,403]);assert.equal(counts.admissions,1);
 for(const r of events.slice(0,4)){assert.equal(r.request.messageKey,events[0].request.messageKey);assert.equal(r.receipt.artifactId,events[0].receipt.artifactId);assert.equal(r.receipt.readyForProvider,false);assert.equal(r.receipt.executionAvailable,false);}
 assert.equal(events[2].receipt.current,false);assert(!Object.hasOwn(events[2].receipt,'intakeContextDigest')&&!Object.hasOwn(events[2].receipt,'planningContextDigest'));
 assert.equal(e.sql(`select count(*) from turn_private.planning_intake_bindings where owner_id='${user.id}';`),'1');assert.equal(e.sql(`select count(*) from turn_private.service_tasks where owner_id='${user.id}';`),'1');
 assert.equal(e.sql(`select count(*) from turn_private.assistant_travel_intakes where owner_id='${user.id}';`),'3');assert.equal(e.counts.http,0);assert.equal(e.sql('select count(*) from public.model_budget_attempts;'),'0');assert.equal(e.sql(`select count(*) from public.trips where owner_id='${user.id}';`),'0');
 writeFileSync(join(output,'summary.json'),JSON.stringify({result:'PASS',scope:'actual NativeSession URLSession/local Auth HTTP RPC; in-memory test vault, not Keychain or product activation',admissions:1,retryNewAdmissions:0,providerCalls:0,modelAttempts:0,tripWrites:0,executionAvailable:false,readyForProvider:false,productEntry:'disabled',unrun:['worker/claimer/completion','provider/target/device/human/full acceptance']},null,2)+'\n');
}finally{writeFileSync(join(output,'network.json'),JSON.stringify({counts,events},null,2)+'\n');bearer=null;for(const release of held)release();if(proxy){proxy.closeAllConnections();await new Promise(r=>proxy.close(r));}if(e)await e.cleanup();}
