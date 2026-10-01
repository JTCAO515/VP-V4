/** Focused v5 native UI against disposable local Auth, HTTP and PostgreSQL. */
import {createNativeTextEnvironment} from './native-text-environment.mjs';
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {mkdirSync,existsSync,writeFileSync,createWriteStream} from 'node:fs';
import {isAbsolute,join} from 'node:path';

const output=process.env.VP_NATIVE_ASSISTANT_OUTPUT,device=process.env.VP_NATIVE_ASSISTANT_SIMULATOR;
if(!output||!isAbsolute(output)||existsSync(output)||!device||!/^[-0-9A-Fa-f]{36}$/.test(device))throw Error('Fresh absolute output and explicit Simulator required');
mkdirSync(output,{recursive:true});
const env={...process.env,DEVELOPER_DIR:'/Applications/Xcode.app/Contents/Developer'};
async function run(args,name){
 writeFileSync(join(output,name+'.command.json'),JSON.stringify({command:'xcodebuild',args})+'\n');
 const log=createWriteStream(join(output,name+'.log'));
 const child=spawn('xcodebuild',args,{env,stdio:['ignore','pipe','pipe']});child.stdout.pipe(log);child.stderr.pipe(log);
 const code=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});log.end();
 if(code!==0)throw Error(name+' failed: '+code+' (see '+join(output,name+'.log')+')');
}
let e,retryProxy;
const retryPosts=[];let retryReadFailures=0;
try{
 await run(['build-for-testing','-project','ios/VisePanda/VisePanda.xcodeproj','-scheme','VisePanda','-destination','platform=iOS Simulator,id='+device,'-derivedDataPath',join(output,'build'),'CODE_SIGNING_ALLOWED=YES','CODE_SIGNING_REQUIRED=YES','CODE_SIGN_IDENTITY=-'],'build');
 e=await createNativeTextEnvironment();
 const profile={VP_NATIVE_ASSISTANT_TEST:'1',VP_NATIVE_TEXT_API_URL:e.api,VP_NATIVE_TEXT_UI_EN_EMAIL:e.users[2].email};
 const retryMode=process.env.VP_NATIVE_ASSISTANT_CONVERSATION_RETRY==='1';
 const selectionMode=process.env.VP_NATIVE_ASSISTANT_CONVERSATION_SELECTION==='1'||retryMode;
 const privacyPaginationMode=process.env.VP_NATIVE_ASSISTANT_PRIVACY_PAGINATION==='1';
 const tripMode=process.env.VP_NATIVE_ASSISTANT_ONLY_TRIP_LINK==='1'||privacyPaginationMode;
 if(tripMode){
  const call=async(path,token,body)=>{const result=await fetch(e.api+path,{method:'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:JSON.stringify(body)});if(!result.ok)throw Error('Synthetic Trip fixture request failed: '+result.status);return result.json();};
  const attemptId=randomUUID(),credentials=await call('/api/auth/native/v2/credentials',null,{email:e.users[2].email,password:e.users[2].password,attemptId});
  await call('/api/auth/native/v2/login',credentials.accessToken,{attemptId});
  const first=randomUUID(),second=randomUUID();
  await call('/api/trips/native/v2',credentials.accessToken,{tripId:first,title:'Synthetic Goal Trip A'});
  await call('/api/trips/native/v2',credentials.accessToken,{tripId:second,title:'Synthetic Goal Trip B'});
  Object.assign(profile,{VP_NATIVE_ASSISTANT_TRIP_TEST:'1',VP_NATIVE_ASSISTANT_TRIP_A:first,VP_NATIVE_ASSISTANT_TRIP_B:second});
  if(privacyPaginationMode){
   const owner=e.users[2].id,conversation=randomUUID(),consent=randomUUID(),marker='ffffffff-ffff-4fff-bfff-ffffffffffff';
   e.sql(`insert into turn_private.text_consents(owner_id,policy_id,consent_id,revoked_at) values('${owner}','${e.policyId}','${consent}',now());
    insert into turn_private.assistant_conversations(id,owner_id,policy_id,consent_id) values('${conversation}','${owner}','${e.policyId}','${consent}');
    with goals as (insert into turn_private.assistant_goals(id,conversation_id,owner_id,current_text)
      select gen_random_uuid(),'${conversation}','${owner}','Synthetic privacy goal' from generate_series(1,100) returning id)
    insert into turn_private.assistant_goal_trip_links(goal_id,conversation_id,owner_id,link_version,goal_scope_version,operation_id,trip_id,trip_head_version,source_kind)
      select id,'${conversation}','${owner}',1,1,gen_random_uuid(),'${first}',0,'native_user_confirmed' from goals;
    insert into turn_private.assistant_goals(id,conversation_id,owner_id,current_text) values('${marker}','${conversation}','${owner}','Synthetic far-page privacy goal');
    insert into turn_private.assistant_goal_trip_links(goal_id,conversation_id,owner_id,link_version,goal_scope_version,operation_id,trip_id,trip_head_version,source_kind)
      values('${marker}','${conversation}','${owner}',1,1,gen_random_uuid(),'${first}',0,'native_user_confirmed');`);
   Object.assign(profile,{VP_NATIVE_ASSISTANT_PRIVACY_PAGINATION:'1',VP_NATIVE_ASSISTANT_LAST_GOAL:marker});
  }
 }
 if(selectionMode){
  const call=async(path,token,body)=>{const result=await fetch(e.api+path,{method:'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:JSON.stringify(body)});if(!result.ok)throw Error('Synthetic conversation request failed: '+result.status);return result.json();};
  const attemptId=randomUUID(),credentials=await call('/api/auth/native/v2/credentials',null,{email:e.users[2].email,password:e.users[2].password,attemptId});
  await call('/api/auth/native/v2/login',credentials.accessToken,{attemptId});
  await call('/api/chat/native/v5/consent',credentials.accessToken,{policyId:e.policyId,noticeHash:e.noticeHash});
  const first=randomUUID(),second=randomUUID();
  for(const [conversationId,text] of [[first,'Synthetic earlier conversation'],[second,'Synthetic latest conversation']]){
   await call('/api/chat/native/v5/conversation',credentials.accessToken,{conversationId,messageId:randomUUID(),idempotencyKey:randomUUID(),policyId:e.policyId,locale:'en',text,relationship:'goal_start',goalId:randomUUID(),expectedGoalVersion:null,taskId:null,parentMessageId:null,turnId:null});
  }
  Object.assign(profile,{VP_NATIVE_ASSISTANT_CONVERSATION_SELECTION:'1',VP_NATIVE_ASSISTANT_CONVERSATION_FIRST:first,VP_NATIVE_ASSISTANT_CONVERSATION_SECOND:second});
 }
 if(retryMode){
  // Faults are confined to one synthetic accepted intake and its next readback.
  // Credentials travel only through this owned loopback proxy and are never recorded.
  let failNextRead=false;
  retryProxy=createServer(async(req,res)=>{
   try{
    const parts=[];for await(const part of req)parts.push(part);
    const bytes=Buffer.concat(parts),path=new URL(req.url,'http://127.0.0.1').pathname;
    if(bytes.length>32768){res.writeHead(400);res.end();return;}
    if(req.method==='GET'&&path==='/api/chat/native/v5/conversation'&&failNextRead){
     failNextRead=false;retryReadFailures++;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'PROVIDER_UNAVAILABLE'}}));return;
    }
    const headers={...req.headers};delete headers.host;delete headers.connection;delete headers['content-length'];
    const upstream=await fetch(e.api+req.url,{method:req.method,headers,...(bytes.length?{body:bytes}:{}),redirect:'error'});
    const result=Buffer.from(await upstream.arrayBuffer());
    if(req.method==='POST'&&path==='/api/chat/native/v5/conversation'){
     const input=JSON.parse(bytes.toString());
     if(input.text==='Synthetic selected conversation continuation'){
      retryPosts.push(input);
      if(retryPosts.length===1){
       assert.equal(upstream.status,201,'the original writer must admit before its receipt is lost');
       failNextRead=true;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'PROVIDER_UNAVAILABLE'}}));return;
      }
      assert.equal(upstream.status,200,'the original idempotency key must replay');
      assert.equal(JSON.parse(result.toString()).reused,true);
     }
    }
    res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'application/json','Cache-Control':'private, no-store'});res.end(result);
   }catch{res.writeHead(500);res.end();}
  });
  await new Promise((resolve,reject)=>{retryProxy.once('error',reject);retryProxy.listen(0,'127.0.0.1',resolve);});
  Object.assign(profile,{VP_NATIVE_ASSISTANT_CONVERSATION_RETRY:'1',VP_NATIVE_TEXT_API_URL:'http://127.0.0.1:'+retryProxy.address().port});
 }
 const products=join(output,'build/Build/Products'),patched=join(products,'AssistantConversation.xctestrun');
 execFileSync('python3',['-c',`import sys,json,plistlib,pathlib
root=pathlib.Path(sys.argv[1]); sources=list(root.glob('*.xctestrun'));assert len(sources)==1
data=plistlib.loads(sources[0].read_bytes());profile=json.loads(sys.stdin.read())
data['VisePandaUITests'].setdefault('EnvironmentVariables',{}).update(profile)
path=root/'AssistantConversation.xctestrun';path.write_bytes(plistlib.dumps(data));path.chmod(0o600)
`,products],{input:JSON.stringify(profile)});
 await run(['test-without-building','-xctestrun',patched,'-destination','platform=iOS Simulator,id='+device,'-parallel-testing-enabled','NO',...(selectionMode?['-collect-test-diagnostics','never']:[]),'-resultBundlePath',join(output,'tests.xcresult'),
  '-only-testing:VisePandaUITests/NativeAskUITests/'+(selectionMode?'testEnglishAssistantConversationSelection':privacyPaginationMode?'testEnglishAssistantTripPrivacyPagination':tripMode?'testEnglishAssistantGoalTripLinkReadback':'testEnglishAssistantConversationReadback')],'tests');
 if(retryMode){
  assert.equal(retryReadFailures,1);assert.equal(retryPosts.length,2);
  assert.deepEqual(retryPosts[1],retryPosts[0],'retry must retain all IDs, scope, text and idempotency key');
  writeFileSync(join(output,'retry-summary.json'),JSON.stringify({lostAcceptedReceipt:1,failedReadback:retryReadFailures,posts:retryPosts.length,sameImmutableRequest:true},null,2)+'\n');
 }
 if(selectionMode){
  const first=profile.VP_NATIVE_ASSISTANT_CONVERSATION_FIRST,second=profile.VP_NATIVE_ASSISTANT_CONVERSATION_SECOND;
  if(e.sql(`select count(*) from turn_private.assistant_messages where conversation_id='${first}';`)!=='2'
    || e.sql(`select count(*) from turn_private.assistant_messages where conversation_id='${second}';`)!=='1')throw Error('Selected send attached to wrong conversation');
 }
 if(privacyPaginationMode){
  const marker=profile.VP_NATIVE_ASSISTANT_LAST_GOAL;
  if(e.sql(`select trip_id is null from turn_private.assistant_goal_trip_links where goal_id='${marker}';`)!=='t')
   throw Error('Far-page privacy unlink did not persist');
  if(e.sql(`select count(*) from public.trips where id in ('${profile.VP_NATIVE_ASSISTANT_TRIP_A}','${profile.VP_NATIVE_ASSISTANT_TRIP_B}') and head_version=0;`)!=='2')
   throw Error('Privacy pagination changed an existing Trip');
 }
 writeFileSync(join(output,'summary.json'),JSON.stringify({scope:'actual local native/Auth/HTTP/SQL; synthetic model only',modelCalls:e.counts.http,messages:e.sql('select count(*) from turn_private.assistant_messages;'),goals:e.sql('select count(*) from turn_private.assistant_goals;'),taskAttempts:e.sql('select count(*) from public.model_budget_attempts;'),tripLinks:e.sql('select count(*) from turn_private.assistant_goal_trip_links;'),tripLinkReceipts:e.sql('select count(*) from turn_private.assistant_goal_trip_receipts;')},null,2)+'\n');
 console.log('VPJ78_NATIVE_UI_PASS '+join(output,'summary.json'));
}finally{
 if(retryProxy){retryProxy.closeAllConnections();await new Promise(resolve=>retryProxy.close(resolve));}
 if(e){
  if(process.env.VP_NATIVE_ASSISTANT_PRIVACY_PAGINATION==='1')e.sql(`delete from turn_private.assistant_goal_trip_links where owner_id='${e.users[2].id}';
   delete from turn_private.assistant_goal_trip_receipts where owner_id='${e.users[2].id}';`);
  await e.cleanup();
 }
}
