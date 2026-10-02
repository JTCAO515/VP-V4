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
const output=process.env.VP_SHELL_SWITCH_OUTPUT,device=process.env.VP_SHELL_SWITCH_SIMULATOR;
const goalMode=process.env.VP_GOAL_ENTRY_TEST==='1';
const goalIds={a:randomUUID(),b:randomUUID(),ag:randomUUID(),bg:"10000000-0000-4000-8000-000000000001",last:"f0000000-0000-4000-8000-000000000002"};
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
let fault = false, receiptLost = false, intakePosts = 0;
const intakeBodies = [];
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
 stack=mkdtempSync(join(tmpdir(),'vp-shell-switch-'));
 mkdirSync(join(stack,'supabase'));const project='vp-native-ask-'+randomUUID().slice(0,8);
 const config=nativeHTTPSupabaseConfig(readFileSync('supabase/config.toml','utf8'),project,ports);
 writeFileSync(join(stack,'supabase/config.toml'),config);cpSync('supabase/migrations',join(stack,'supabase/migrations'),{recursive:true});
 await quiet('supabase',['start','--workdir',stack,'-x','realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor']);
 Object.assign(process.env,nativeHTTPChildEnv(ports,stack));
}
try{
 await run(['build-for-testing','-project','ios/VisePanda/VisePanda.xcodeproj','-scheme','VisePanda','-destination','platform=iOS Simulator,id='+device,'-derivedDataPath',join(output,'build'),'CODE_SIGNING_ALLOWED=YES','CODE_SIGN_IDENTITY=-'],'build');
 await startStack();
 e=await createNativeTextEnvironment();
 e.sql(`insert into turn_private.text_consents(owner_id,policy_id,consent_id) values('${e.users[2].id}','${e.policyId}','${randomUUID()}');`);
 if(goalMode){
  const owner=e.users[2].id,consent=e.sql(`select consent_id from turn_private.text_consents where owner_id='${owner}' and policy_id='${e.policyId}' and revoked_at is null;`);
  e.sql(`insert into turn_private.assistant_conversations(id,owner_id,policy_id,consent_id,created_at,next_sequence) values('${goalIds.a}','${owner}','${e.policyId}','${consent}',now()-interval '1 hour',2),('${goalIds.b}','${owner}','${e.policyId}','${consent}',now(),3);
  insert into turn_private.assistant_goals(id,conversation_id,owner_id,scope_version,current_text) values('${goalIds.ag}','${goalIds.a}','${owner}',1,'Goal A original'),('${goalIds.bg}','${goalIds.b}','${owner}',7,'Goal B selected'),('${goalIds.last}','${goalIds.b}','${owner}',1,'Goal B last');
  insert into turn_private.assistant_messages(id,conversation_id,owner_id,sequence,idempotency_key,request_digest,policy_id,consent_id,locale,input_text,relationship,goal_id,scope_version) values(gen_random_uuid(),'${goalIds.a}','${owner}',1,gen_random_uuid(),'${'a'.repeat(64)}','${e.policyId}','${consent}','en','Goal A original','goal_start','${goalIds.ag}',1),(gen_random_uuid(),'${goalIds.b}','${owner}',1,gen_random_uuid(),'${'a'.repeat(64)}','${e.policyId}','${consent}','en','Goal B selected','goal_start','${goalIds.bg}',7),(gen_random_uuid(),'${goalIds.b}','${owner}',2,gen_random_uuid(),'${'a'.repeat(64)}','${e.policyId}','${consent}','en','Goal B last','goal_start','${goalIds.last}',1);`);
 }
 proxy=httpServer(async(req,res)=>{
  try{
   const parts=[];for await(const part of req)parts.push(part);const bytes=Buffer.concat(parts);
   if(bytes.length>32768){res.writeHead(400);res.end();return;}
   const path=new URL(req.url,'http://127.0.0.1').pathname;
   if(goalMode&&path==='/__goal/control'){
    e.sql(`update turn_private.assistant_goals set scope_version=8 where id='${goalIds.bg}';`);
    res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');return;
   }
   if(req.method==='POST'&&path==='/api/chat/native/v5/conversation')conversationPosts++;
   if(path==='/__shell/control'){
    const action=JSON.parse(bytes.toString());fault=action.arm===true;res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');return;
   }
   if(fault&&receiptLost&&req.method==='GET'&&path==='/api/chat/native/v5/conversation'){
    res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":{"code":"PROVIDER_UNAVAILABLE"}}');return;
   }
   const upstream=await fetch(e.api+req.url,{method:req.method,headers:req.headers,body:bytes.length?bytes:undefined});const data=Buffer.from(await upstream.arrayBuffer());
   if(goalMode) goalRoutes.push({method:req.method,path,status:upstream.status,exactConversation:new URL(req.url,'http://127.0.0.1').searchParams.has('conversationId')});
   if(req.method==='POST'&&path==='/api/chat/native/v5/conversation'){
    intakePosts++; intakeBodies.push(JSON.parse(bytes.toString()));
    if(fault&&!receiptLost){if(upstream.status!==201)throw Error('Synthetic intake did not admit');receiptLost=true;res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":{"code":"PROVIDER_UNAVAILABLE"}}');return;}
   }
   res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'application/json','Cache-Control':'private, no-store'});res.end(data);
  }catch{res.writeHead(500);res.end();}
 });
 await new Promise((r,j)=>{proxy.once('error',j);proxy.listen(0,'127.0.0.1',r);});
 const api='http://127.0.0.1:'+proxy.address().port;
 const profile={VP_SHELL_SWITCH_TEST:'1',...(goalMode?{VP_GOAL_ENTRY_TEST:'1',VP_GOAL_ENTRY_A:goalIds.a,VP_GOAL_ENTRY_B:goalIds.b,VP_GOAL_ENTRY_TARGET:goalIds.bg,VP_GOAL_ENTRY_CONTROL:api+'/__goal/control'}:{}),VP_NATIVE_TEXT_API_URL:api,VP_SHELL_SWITCH_CONTROL:api+'/__shell/control',VP_NATIVE_TEXT_UI_EN_EMAIL:e.users[2].email};
 const products=join(output,'build/Build/Products');patched=join(products,'ShellSwitch.xctestrun');
 execFileSync('python3',['-c',`import sys,json,plistlib,pathlib
root=pathlib.Path(sys.argv[1]);sources=list(root.glob('*.xctestrun'));assert len(sources)==1
data=plistlib.loads(sources[0].read_bytes());data['VisePandaUITests'].setdefault('EnvironmentVariables',{}).update(json.loads(sys.stdin.read()))
p=root/'ShellSwitch.xctestrun';p.write_bytes(plistlib.dumps(data));p.chmod(0o600)`,products],{input:JSON.stringify(profile)});
 await run(['test-without-building','-xctestrun',patched,'-destination','platform=iOS Simulator,id='+device,'-parallel-testing-enabled','NO','-collect-test-diagnostics','never','-resultBundlePath',join(output,'tests.xcresult'),'-only-testing:VisePandaUITests/NativeJourneysUITests/'+(goalMode?'testAuthenticatedGoalEntryDraftAndVersionBoundaries':'testAuthenticatedShellSwitchPreservesSessionAndModeLocalPaths')],'tests');
 if(goalMode){assert.equal(conversationPosts,0,'Readonly goal entry must never submit');writeFileSync(join(output,'goal-entry-summary.json'),JSON.stringify({scope:'local synthetic Auth',conversationPosts,automaticSend:false})+'\n');}
 else {
 if(!receiptLost||intakePosts!==2)throw Error('Pending/retry proof did not preserve the expected single intake and retry');
 assert.deepEqual(intakeBodies[1],intakeBodies[0],'Explicit retry must preserve immutable intake and idempotency identity');
 writeFileSync(join(output,'pending-summary.json'),JSON.stringify({scope:'disposable local synthetic',receiptLost,intakePosts,sameImmutableRequest:true,automaticResend:false})+'\n');
 }
}finally{if(goalMode)writeFileSync(join(output,'goal-routes.json'),JSON.stringify(goalRoutes));if(patched&&existsSync(patched))unlinkSync(patched);if(proxy){proxy.closeAllConnections();await new Promise(r=>proxy.close(r));}await e?.cleanup();if(stack){await quiet('supabase',['stop','--workdir',stack,'--no-backup']);rmSync(stack,{recursive:true});}}
