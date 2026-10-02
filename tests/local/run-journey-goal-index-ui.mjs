// Scoped local UI runner; reuses existing disposable Auth/server helper unchanged.
import {createNativeTextEnvironment} from '../integration/turn/native-text-environment.mjs';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,existsSync,writeFileSync,createWriteStream,unlinkSync,mkdtempSync,readFileSync,cpSync,rmSync} from 'node:fs';
import {isAbsolute,join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {nativeHTTPPorts,nativeHTTPSupabaseConfig,nativeHTTPChildEnv,assertNativeHTTPPortsFree} from '../integration/turn/native-http-ports.mjs';
import {createServer as httpServer} from 'node:http';
const output=process.env.VP_JOURNEY_INDEX_OUTPUT,device=process.env.VP_JOURNEY_INDEX_SIMULATOR;
if(device!=='7ACEC42A-E6A1-4574-AB0B-50B7A0029A10')throw Error('Dedicated Journey index device required');
process.env.VP_NATIVE_HTTP_PORT_BASE ??= '64020';
await assertNativeHTTPPortsFree(nativeHTTPPorts(process.env.VP_NATIVE_HTTP_PORT_BASE));
const goalIds={a:'10000000-0000-4000-8000-000000000001',b:'f0000000-0000-4000-8000-000000000002',ag:'10000000-0000-4000-8000-000000000001',bg:'f0000000-0000-4000-8000-000000000002'};
let conversationPosts=0;
const goalRoutes=[];
if(!output||!isAbsolute(output)||existsSync(output)||!device||!/^[-0-9A-Fa-f]{36}$/.test(device))throw Error('Fresh absolute output and explicit simulator required');
mkdirSync(output,{recursive:true});
async function run(args,name){
 writeFileSync(join(output,name+'.command.json'),JSON.stringify({command:'xcodebuild',args})+'\n');
 const log=createWriteStream(join(output,name+'.log'));
 const child=spawn('xcodebuild',args,{env:{...process.env,DEVELOPER_DIR:'/Applications/Xcode.app/Contents/Developer'},stdio:['ignore','pipe','pipe']});child.stdout.pipe(log);child.stderr.pipe(log);
 const code=await new Promise((r,j)=>{child.once('exit',r);child.once('error',j);});log.end();
 if(code!==0)throw Error(name+' failed: '+code+'; see local log');
}
let e,patched,stack,proxy;
async function quiet(command,args){
 const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});child.stdout.resume();child.stderr.resume();
 return new Promise((r,j)=>{child.once('exit',code=>code===0?r():j(Error('Owned local stack command failed; credential output suppressed')));child.once('error',j);});
}
async function startStack(){
 if(process.env.DOCKER_HOST||process.env.DOCKER_CONTEXT)throw Error('Docker overrides refused');
 const context=execFileSync('docker',['context','show'],{encoding:'utf8'}).trim();
 const inspected=JSON.parse(execFileSync('docker',['context','inspect',context],{encoding:'utf8'}))[0];
 if(!inspected.Endpoints.docker.Host.startsWith('unix:///'))throw Error('Local Docker required');
 const ports=nativeHTTPPorts(process.env.VP_NATIVE_HTTP_PORT_BASE);
 await assertNativeHTTPPortsFree(ports);
 writeFileSync(join(output,'ports.json'),JSON.stringify({base:ports.base,supabaseAPI:ports.supabaseAPI,api:ports.api,ports:ports.ports})+'\n');
 stack=mkdtempSync(join(tmpdir(),'vp-journey-index-'));
 mkdirSync(join(stack,'supabase'));const project='vp-native-ask-'+randomUUID().slice(0,8);
 const config=nativeHTTPSupabaseConfig(readFileSync('supabase/config.toml','utf8'),project,ports);
 writeFileSync(join(stack,'supabase/config.toml'),config);cpSync('supabase/migrations',join(stack,'supabase/migrations'),{recursive:true});
 await quiet('supabase',['start','--workdir',stack,'-x','realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor']);
 Object.assign(process.env,nativeHTTPChildEnv(ports,stack));
}
try{
 await run(['build-for-testing','-project','ios/VisePanda/VisePanda.xcodeproj','-scheme','VisePanda','-destination','platform=iOS Simulator,id='+device,'-derivedDataPath','/tmp/vpj83-native-goal-index-20261002','CODE_SIGNING_ALLOWED=YES','CODE_SIGN_IDENTITY=-'],'build');
 await startStack();
 e=await createNativeTextEnvironment();
 e.sql(`insert into turn_private.text_consents(owner_id,policy_id,consent_id) values('${e.users[2].id}','${e.policyId}','${randomUUID()}');`);
 {
  const owner=e.users[2].id,consent=e.sql(`select consent_id from turn_private.text_consents where owner_id='${owner}' and policy_id='${e.policyId}' and revoked_at is null;`);
  e.sql(`insert into turn_private.assistant_conversations(id,owner_id,policy_id,consent_id,created_at,next_sequence) values('${goalIds.a}','${owner}','${e.policyId}','${consent}',now()-interval '1 hour',2),('${goalIds.b}','${owner}','${e.policyId}','${consent}',now(),2);
  insert into turn_private.assistant_goals(id,conversation_id,owner_id,scope_version,current_text) values('${goalIds.ag}','${goalIds.a}','${owner}',7,'Older conversation goal'),('${goalIds.bg}','${goalIds.b}','${owner}',3,'Newer conversation goal');
  insert into turn_private.assistant_goals(id,conversation_id,owner_id,current_text) select ('20000000-0000-4000-8000-'||lpad(to_hex(i),12,'0'))::uuid,'${goalIds.a}','${owner}','Older additional goal '||i from generate_series(1,25) i;
  insert into turn_private.assistant_messages(id,conversation_id,owner_id,sequence,idempotency_key,request_digest,policy_id,consent_id,locale,input_text,relationship,goal_id,scope_version) values(gen_random_uuid(),'${goalIds.a}','${owner}',1,gen_random_uuid(),'${'a'.repeat(64)}','${e.policyId}','${consent}','en','Older conversation goal','goal_start','${goalIds.ag}',7),(gen_random_uuid(),'${goalIds.b}','${owner}',1,gen_random_uuid(),'${'a'.repeat(64)}','${e.policyId}','${consent}','en','Newer conversation goal','goal_start','${goalIds.bg}',3);`);
 }
 proxy=httpServer(async(req,res)=>{
  try{
   const parts=[];for await(const part of req)parts.push(part);const bytes=Buffer.concat(parts);
   if(bytes.length>32768){res.writeHead(400);res.end();return;}
   const path=new URL(req.url,'http://127.0.0.1').pathname;
   if(path==='/__goal/control'){
    const action=JSON.parse(bytes.toString()).action;
    if(action==='amend')e.sql(`update turn_private.assistant_goals set scope_version=8 where id='${goalIds.ag}';`);
    else if(action==='withdraw')e.sql(`update turn_private.text_consents set revoked_at=clock_timestamp() where owner_id='${e.users[2].id}' and policy_id='${e.policyId}';`);
    else throw Error('Unknown control');
    res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');return;
   }
   if(req.method==='POST'&&path==='/api/chat/native/v5/conversation')conversationPosts++;
   const upstream=await fetch(e.api+req.url,{method:req.method,headers:req.headers,body:bytes.length?bytes:undefined});const data=Buffer.from(await upstream.arrayBuffer());
   goalRoutes.push({method:req.method,path,status:upstream.status,exactConversation:new URL(req.url,'http://127.0.0.1').searchParams.has('conversationId')});
   res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'application/json','Cache-Control':'private, no-store'});res.end(data);
  }catch{res.writeHead(500);res.end();}
 });
 await new Promise((r,j)=>{proxy.once('error',j);proxy.listen(0,'127.0.0.1',r);});
 const api='http://127.0.0.1:'+proxy.address().port;
 const profile={VP_JOURNEY_INDEX_TEST:'1',VP_JOURNEY_INDEX_OLD_GOAL:goalIds.ag,VP_JOURNEY_INDEX_NEW_GOAL:goalIds.bg,VP_JOURNEY_INDEX_CONTROL:api+'/__goal/control',VP_NATIVE_TEXT_API_URL:api,VP_NATIVE_TEXT_UI_EN_EMAIL:e.users[2].email};
 const products='/tmp/vpj83-native-goal-index-20261002/Build/Products';patched=join(products,'JourneyIndex.xctestrun');
 execFileSync('python3',['-c',`import sys,json,plistlib,pathlib
root=pathlib.Path(sys.argv[1]);sources=list(root.glob('*.xctestrun'));assert len(sources)==1
data=plistlib.loads(sources[0].read_bytes());data['VisePandaUITests'].setdefault('EnvironmentVariables',{}).update(json.loads(sys.stdin.read()))
p=root/'JourneyIndex.xctestrun';p.write_bytes(plistlib.dumps(data));p.chmod(0o600)`,products],{input:JSON.stringify(profile)});
 await run(['test-without-building','-xctestrun',patched,'-destination','platform=iOS Simulator,id='+device,'-parallel-testing-enabled','NO','-collect-test-diagnostics','never','-resultBundlePath',join(output,'tests.xcresult'),'-only-testing:VisePandaUITests/NativeJourneysUITests/'+'testAuthenticatedCrossConversationIndexAndUnavailableRestart'],'tests');
 assert.equal(conversationPosts,0,'Read-only goal entry cannot submit a message');
 assert.equal(e.counts.http,0,'Read-only flow cannot call a model');
 assert.ok(goalRoutes.some(r=>r.path==='/api/chat/native/v5/journeys-goals'&&r.status===200));
 assert.ok(goalRoutes.some(r=>r.path.startsWith('/api/chat/native/v5/journeys-goals/')&&r.status===403));
 assert.ok(goalRoutes.some(r=>r.exactConversation&&r.status===200));
 writeFileSync(join(output,'goal-index-summary.json'),JSON.stringify({scope:'disposable local Auth + seeded goal facts',conversationPosts,providerCalls:e.counts.http,oldAndNewExactEntry:true,stalePageRejected:true,withdrawalRejected:true})+'\n');
}finally{writeFileSync(join(output,'goal-routes.json'),JSON.stringify(goalRoutes));if(patched&&existsSync(patched))unlinkSync(patched);if(proxy){proxy.closeAllConnections();await new Promise(r=>proxy.close(r));}await e?.cleanup();if(stack){await quiet('supabase',['stop','--workdir',stack,'--no-backup']);rmSync(stack,{recursive:true});}}
