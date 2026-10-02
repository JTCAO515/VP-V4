// Own disposable synthetic rows only; the activity route/Auth/session checks are real.
import {randomUUID as uuid} from 'node:crypto';
import {createServer} from 'node:http';
export async function createNativeActivityFixture(e,user){
 let setupStatement=0;const db=q=>{setupStatement++;try{return e.sql(q);}catch{throw Error('Synthetic activity SQL check failed at statement '+setupStatement);}};
 const call=async(path,token,body)=>{const r=await fetch(e.api+path,{method:'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('Synthetic activity setup request failed');return r.json();};
 const attemptId=uuid(),credentials=await call('/api/auth/native/v2/credentials',null,{email:user.email,password:user.password,attemptId});
 await call('/api/auth/native/v2/login',credentials.accessToken,{attemptId});
 const sessionID=JSON.parse(Buffer.from(credentials.accessToken.split('.')[1],'base64url').toString()).session_id;
 await call('/api/chat/native/v5/consent',credentials.accessToken,{policyId:e.policyId,noticeHash:e.noticeHash});
 const conversation=uuid(),goal=uuid(),root=uuid(),policy=uuid();
 await call('/api/chat/native/v5/conversation',credentials.accessToken,{conversationId:conversation,goalId:goal,messageId:root,idempotencyKey:uuid(),policyId:e.policyId,locale:'en',text:'Synthetic activity selection',relationship:'goal_start',expectedGoalVersion:null,taskId:null,parentMessageId:null,turnId:null});
 db(`insert into turn_private.planning_policies(id,text_policy_id,environment,notice_version,notice_hash,notice_zh,notice_en,effective_at,expires_at)
 values('${policy}','${e.policyId}','local_synthetic','activity-ui','${'a'.repeat(64)}','合成测试','Synthetic UI',now()-interval '1 hour',now()+interval '1 day');
 insert into turn_private.planning_consents(owner_id,policy_id) values('${user.id}','${policy}');`);
 const tasks=[];
 for(const [index,status] of ['cancelled','accepted'].entries()){
  const task=uuid(),turn=uuid(),thread=uuid(),message=uuid();tasks.push({task,turn,message,index});
  db(`insert into public.chat_threads(id,owner_id) values('${thread}','${user.id}');
   insert into public.turns(id,owner_id,thread_id,status) values('${turn}','${user.id}','${thread}','${status}');
   insert into turn_private.text_content(turn_id,owner_id,thread_id,policy_id,consent_id,locale,input_text)
    select '${turn}',owner_id,'${thread}',policy_id,consent_id,'en','Synthetic activity ${index}' from turn_private.assistant_conversations where id='${conversation}';
   insert into turn_private.service_tasks(id,owner_id,thread_id,goal_turn_id,last_turn_id,policy_id,consent_id,scope_version,goal_digest)
    select '${task}',owner_id,'${thread}','${turn}','${turn}',policy_id,consent_id,1,'${'a'.repeat(64)}' from turn_private.assistant_conversations where id='${conversation}';
   insert into turn_private.service_task_turns(turn_id,task_id,owner_id,relationship,idempotency_key,request_digest)
    values('${turn}','${task}','${user.id}','new_goal','${uuid()}','${'a'.repeat(64)}');
   insert into turn_private.assistant_messages(id,conversation_id,owner_id,sequence,idempotency_key,request_digest,policy_id,consent_id,locale,input_text,relationship,goal_id,scope_version,task_id,parent_message_id)
    select '${message}',id,owner_id,next_sequence,'${uuid()}','${'a'.repeat(64)}',policy_id,consent_id,'en','Synthetic activity Task ${index===0?'A':'B'}','follow_up','${goal}',1,'${task}','${root}' from turn_private.assistant_conversations where id='${conversation}';
   update turn_private.assistant_conversations set next_sequence=next_sequence+1 where id='${conversation}';
   insert into turn_private.work(turn_id,owner_id,session_id,state,max_attempts,lease_ms) values('${turn}','${user.id}','${sessionID}','cancelled',3,1000);
   insert into turn_private.planning_comparisons(turn_id,owner_id,task_id,goal_id,message_id,goal_version,planning_policy_id,planning_consent_id,memory_basis,artifact_id,publication_key)
    select '${turn}','${user.id}','${task}','${goal}','${message}',1,'${policy}',consent_id,'[]','${uuid()}','${uuid()}' from turn_private.planning_consents where owner_id='${user.id}' and policy_id='${policy}';`);
  if(index===0)db(`insert into turn_private.planning_action_receipts(turn_id,action_key,owner_id,task_id,message_id,lease_token,tool_id,input_digest,basis_digest,memory_basis,state)
   values('${turn}','${'1'.repeat(64)}','${user.id}','${task}','${message}','${uuid()}','place.read','${'b'.repeat(64)}',turn_private.planning_action_basis('${turn}','${user.id}','${message}','[]'),'[]','unknown');`);
 }
 let armed=false,reads=0;const events=[];const held=new Set();
 const proxy=createServer(async(req,res)=>{try{
  const parts=[];for await(const part of req)parts.push(part);const body=Buffer.concat(parts);
  const path=new URL(req.url,'http://127.0.0.1').pathname;
  if(path==='/__activity/control'){
   if(req.method==='POST'){
    const action=JSON.parse(body.toString());
    if(action.arm)armed=true;
    if(action.release){for(const release of held)release();held.clear();}
    if(action.revoke)db(`update turn_private.planning_consents set revoked_at=now() where owner_id='${user.id}' and policy_id='${policy}';`);
    if(action.goal)db(`update turn_private.assistant_goals set scope_version=scope_version+1 where id='${goal}';`);
    if(action.resetGoal)db(`update turn_private.assistant_goals set scope_version=1 where id='${goal}';`);
    if(action.replace){const attemptId=uuid(),next=await call('/api/auth/native/v2/credentials',null,{email:user.email,password:user.password,attemptId});await call('/api/auth/native/v2/login',next.accessToken,{attemptId});}
   }
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({held:held.size,reads}));return;
  }
  const headers={...req.headers};delete headers.host;delete headers.connection;delete headers['content-length'];
  const upstream=await fetch(e.api+req.url,{method:req.method,headers,...(body.length?{body}:{}),redirect:'error'});
  const bytes=Buffer.from(await upstream.arrayBuffer());
  if(path.endsWith('/activity')){
   reads++;if(events.length<16)events.push({phase:'response',task:path.includes(tasks[0].task)?'A':'B',status:upstream.status});
   if(armed&&path.includes(tasks[0].task)){armed=false;await new Promise(resolve=>{const release=()=>{held.delete(release);resolve();};held.add(release);});}
  }
  res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'application/json','Cache-Control':'private, no-store'});res.end(bytes);
 }catch{res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'SYNTHETIC_CONTROL_OR_TRANSPORT_FAILURE'}));}});
 await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',resolve);});
 const api='http://127.0.0.1:'+proxy.address().port;
 return {proxy,profile:{VP_NATIVE_ASSISTANT_ACTIVITY:'1',VP_NATIVE_TEXT_API_URL:api,VP_NATIVE_ACTIVITY_CONTROL:api+'/__activity/control',VP_NATIVE_ACTIVITY_TASK_A:tasks[0].task,VP_NATIVE_ACTIVITY_TASK_B:tasks[1].task},
  summary:()=>({activityReads:reads,syntheticReceipts:1,actualModelCalls:e.counts.http,events})};
}
