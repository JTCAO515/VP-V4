import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {sql} from '../../../cost/fixtures/postgres-rpc.mjs';
import {writeFileSync} from 'node:fs';
import {decodeResultPreview,decodeResultReceipt,decodeResultList} from './wire.mjs';
export const container=process.env.VP_RESULT_DATA_SQL_CONTAINER??'vpj58-result-data-sql-20261007';
export const lit=v=>"'"+String(v).replaceAll("'","''")+"'",json=v=>lit(JSON.stringify(v))+'::jsonb';
export async function db(q){const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();}
export const claims=a=>`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims=${lit(JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session}))};`;
export const query=(a,c,bytes=JSON.stringify(c),epoch=1)=>`begin;${claims(a)}set role authenticated;select public.privacy_result_data_v1(${lit(c.action)},${lit(bytes)},${epoch});commit;`;
export const call=async(a,c,bytes)=>JSON.parse(await db(query(a,c,bytes)));
export const comparison={schemaVersion:'comparison/1',title:'Areas',summary:'Source-owned result content',options:[{id:'a',title:'A',tradeoff:'First'},{id:'b',title:'B',tradeoff:'Second'}],actions:[]};
export async function fixture(options={}){
 const a=Object.fromEntries(['owner','session','policy','consent','conversation','goal','rootMessage','message','task','thread','turn','artifact','publication','trip'].map(k=>[k,uuid()]));
 await db(`insert into auth.users values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');
 insert into identity_private.mobile_accounts(owner_id,session_id,epoch) values('${a.owner}','${a.session}',1);
 insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch) values('${a.owner}','${uuid()}','${a.session}',1);
 insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at)
 values('${a.policy}','qwen','fixture','https://fixture.invalid/v1','local','local','local','fixture','fixture','${'a'.repeat(64)}','合成','Synthetic','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day');
 insert into turn_private.text_consents(owner_id,policy_id,consent_id) values('${a.owner}','${a.policy}','${a.consent}');`);
 await db(`${claims(a)}insert into public.trips(id,owner_id,title) values('${a.trip}','${a.owner}','Original unchanged Trip');`);
 a.goalVersion=options.linked?2:1;a.tripHead=0;
 if(options.linked){const proposal=JSON.parse(await db(`${claims(a)}select row_to_json(x) from public.create_trip_proposal_patch('${a.trip}',${json({expectedVersion:0,operations:[{kind:'set_title',title:'Confirmed original Trip'}]})}) x;`));
  const digest=await db(`${claims(a)}select digest from public.read_trip_proposal_v2('${proposal.proposal_id}');`);await db(`${claims(a)}select * from public.confirm_and_apply_trip_proposal('${proposal.proposal_id}','${uuid()}','${digest}');`);a.tripHead=1;a.tripBinding=a.trip;
 }
 await db(`begin;${claims(a)}select public.submit_assistant_message_v1('${a.conversation}','${a.rootMessage}','${uuid()}','${a.policy}','en','Original retained goal','goal_start','${a.goal}',null,null,null,null);
 ${options.linked?`select public.set_assistant_goal_trip_link_v1('${uuid()}','${a.conversation}','${a.goal}',null,1,0,'link','${a.trip}',1,true);`:''}
 select public.submit_service_task_turn('${a.thread}','${a.turn}','${uuid()}','${a.policy}','en','Original retained input','${a.task}',1,'new_goal',null);
 select public.submit_assistant_message_v1('${a.conversation}','${a.message}','${uuid()}','${a.policy}','en','Original retained followup','follow_up','${a.goal}',${a.goalVersion},'${a.task}','${a.rootMessage}',null);commit;
 update turn_private.text_content set output_kind='answered',output_text='Source answer' where turn_id='${a.turn}';select turn_private.terminal('${a.turn}','completed',1);`);
 a.basis=[];
 if(options.memory){a.memory=uuid();const consent=JSON.parse(await db(`${claims(a)}select public.native_memory_command_v1(${json({action:'consentCreate',operationId:uuid()})});`));a.memoryConsent=consent.consentId;
  await db(`${claims(a)}select public.native_memory_command_v1(${json({action:'create',operationId:uuid(),memoryId:a.memory,receiptId:uuid(),consentId:a.memoryConsent,constraintKind:'preference',summary:'Original explicit Memory',saveLongTerm:true})});`);a.basis=[{id:a.memory,revision:1}];
 }
 await publish(a,a.artifact,0,a.publication,comparison);return a;
}
export const publish=(a,id,expected,key,content)=>db(`set request.jwt.claim.role='service_role';select public.publish_result_artifact_v2('${a.owner}','${id}',${expected},'${key}','${a.task}','${a.goal}','${a.message}',${a.tripBinding?lit(a.tripBinding):'null'},${a.tripBinding?a.tripHead:'null'},${a.goalVersion??1},${json(a.basis??[])},${json(content)},'[]');`).then(JSON.parse);
export const selected=(a,request=uuid())=>({scope:'result-sensitive-data/1',requestId:request,rootKind:'artifact',rootId:a.artifact,objectIds:[]});
export const actor=a=>({ownerId:a.owner,sessionId:a.session,mobileEpoch:1});
export const eraseFor=(selection,p)=>({action:'erase',...selection,sourceDigest:p.sourceDigest,previewDigest:p.previewDigest,confirmed:true});
if(process.argv[1]?.endsWith('/runtime.mjs')){
 assert.equal(await db("select result_data_private.schema_supported_v1();"),'t');
 for(const role of ['public','anon','authenticated','service_role']){if(role==='public')continue;assert.equal(await db(`select has_function_privilege('${role}','public.privacy_result_data_v1(text,text,bigint)','EXECUTE');`),'f');}
 await db('grant execute on function public.privacy_result_data_v1(text,text,bigint) to authenticated;');
 const a=await fixture(),sel=selected(a);const p=await call(a,{action:'preview',...sel});
 console.log('preview eligible',p.eligible,p.conflicts,p.eraseCounts,p.retainCounts);
 assert.ok(decodeResultPreview(p,sel,actor(a),Date.now()),'sole TS accepts actual SQL preview');assert.equal(p.eligible,true);
 const command=eraseFor(sel,p),bytes=' \n'+JSON.stringify(command)+'  ';
 const r=await call(a,command,bytes);console.log('receipt',r.decision);
 const digest=(await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
 assert.ok(decodeResultReceipt(r,sel,actor(a),digest,Date.now()));
 assert.deepEqual(await call(a,{action:'recover',...sel,mutationBytes:bytes}),r);
 writeFileSync('tests/integration/privacy/result-data-sql/ownproof/smoke.json',JSON.stringify({kind:'local actual PG SQL-claims fixture; not signed Auth or provider',preview:p,receipt:r},null,2)+'\n');
}
