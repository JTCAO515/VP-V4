// Native PG/Auth-claim stubs and synthetic actors; never GoTrue/target/provider proof.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtempSync,mkdirSync,chmodSync,readFileSync,readdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
const enabled=process.env.AGENT005_NATIVE_PG==='1';
const bin=process.env.AGENT005_PG_BIN??'/opt/homebrew/opt/postgresql@17/bin';
const append='20261015040456_agent005_resolved_subject_context.sql';
const artifact=join(process.cwd(),'artifacts/AGENT-005/grounded-result-20261015/subject-binding');
const require=createRequire(import.meta.url);
let Client,nonce,data,socket,started=false,admin,baseline,baselineGuards;
const sigs=['public.read_grounded_ai_assist_context_v1(uuid)','public.grounded_ai_assist_work_v1(jsonb)'];
const guards=['profile_data_private.schema_v1()','result_data_private.infrastructure_supported_v1()','result_data_private.schema_supported_v1()','turn_data_private.schema_supported_v1()','turn_data_private.runtime_supported_v1()','conversation_data_private.schema_supported_v1()','export_private.profile_hooks_valid_v1()','turn_data_private.write_hooks_valid_v1()','turn_data_private.hooks_valid_v1()'];
const query=async(sql,params=[])=>admin.query(sql,params);
const scalar=async(sql,params=[])=>(await query(sql,params)).rows[0]?.value;
const connect=async()=>{const c=new Client({host:socket,port:5432,user:'postgres',database:'postgres',statement_timeout:15000,lock_timeout:3000});await c.connect();return c;};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const catalog=async()=>({
 functions:(await query(`select n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' signature,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') source,md5((to_jsonb(p)-'prosrc')::text) metadata from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not like 'pg_%' and n.nspname<>'information_schema' order by 1`)).rows,
 tables:(await query(`select c.oid::regclass::text relation,c.relkind,c.relowner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity, (select jsonb_agg(to_jsonb(a) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0) columns from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not like 'pg_%' and n.nspname<>'information_schema' order by 1`)).rows,
 roles:(await query('select to_jsonb(r)-\'rolpassword\' vector from pg_roles r order by rolname')).rows,
 policies:(await query('select to_jsonb(p) vector from pg_policy p order by oid')).rows,
 constraints:(await query(`select to_jsonb(c) vector from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname not like 'pg_%' order by c.oid`)).rows,
 defaults:(await query('select to_jsonb(d) vector from pg_default_acl d order by oid')).rows,
 memberships:(await query('select to_jsonb(m) vector from pg_auth_members m order by roleid,member')).rows,
});
const guardValues=async()=>{const result={};for(const sig of guards)result[sig]=await scalar(`select ${sig} as value`);return result;};
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
before(async()=>{
 if(!enabled)return;
 ({Client}=require(process.env.AGENT005_PG_MODULE));
 assert.match(execFileSync(join(bin,'postgres'),['--version'],{encoding:'utf8'}),/17\.[0-9]+/);
 nonce=mkdtempSync('/private/tmp/a005-');chmodSync(nonce,0o700);data=join(nonce,'data');socket=join(nonce,'s');mkdirSync(socket,{mode:0o700});
 execFileSync(join(bin,'initdb'),['-D',data,'-U','postgres','-A','trust','--no-locale','-E','UTF8'],{stdio:'pipe'});
 execFileSync(join(bin,'pg_ctl'),['-D',data,'-l',join(nonce,'server.log'),'-o',`-c listen_addresses='' -c unix_socket_directories='${socket}' -c unix_socket_permissions=0700`,'-w','start'],{stdio:'pipe'});started=true;admin=await connect();
 assert.equal(await scalar("select current_setting('listen_addresses') as value"),'');
 await query(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await query("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$; create schema extensions; create extension pgcrypto with schema extensions;");
 const migrations=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f!==append).sort();
 const inventory=[];
 for(const file of migrations){const source=readFileSync(join('supabase/migrations',file),'utf8');try{await query('begin');await query(source);await query('commit');inventory.push({file,sha256:createHash('sha256').update(source).digest('hex')});}catch(error){
   await query('rollback');
   const diagnostics={file,error:error.message};
   try{
    diagnostics.guards=await guardValues();
    const literal=source.match(/for spec in select key signature,value expected from jsonb_each\((.*)\) loop/);
    if(literal){
     await query('begin');await query("set local search_path=''");
     const rows=(await query(`select e.key signature,e.value expected,jsonb_build_object('definition',pg_get_functiondef(p.oid),'prosrc',p.prosrc,'identity',pg_get_function_identity_arguments(p.oid),'arguments',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid),'config',p.proconfig,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'securityDefiner',p.prosecdef,'volatility',p.provolatile,'strict',p.proisstrict,'parallel',p.proparallel,'kind',p.prokind,'language',l.lanname) actual from jsonb_each(${literal[1]}) e left join pg_proc p on p.oid=to_regprocedure(e.key) left join pg_language l on l.oid=p.prolang`)).rows;
     diagnostics.pins=rows.flatMap(row=>Object.keys(row.expected).filter(k=>JSON.stringify(row.expected[k])!==JSON.stringify(row.actual[k])).map(k=>({signature:row.signature,field:k,expectedHash:hash(row.expected[k]),actualHash:hash(row.actual[k]),...(k==='acl'?{expected:row.expected[k],actual:row.actual[k]}:{})})));
     await query('rollback');
    }
   }catch(diagnosticError){await query('rollback');diagnostics.diagnosticError=diagnosticError.message;}
   writeFileSync(join(artifact,'pg-baseline-failure.json'),JSON.stringify(diagnostics,null,2)+'\n');
   throw new Error(`baseline migration ${file}: ${error.message}`);
  }}
 baseline=await catalog();baselineGuards=await guardValues();
 writeFileSync(join(artifact,'pg-baseline.json'),JSON.stringify({postgres:await scalar('select version() as value'),transport:'private Unix socket; no TCP',migrationInventory:inventory,tableCount:await scalar("select count(*)::int as value from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname not like 'pg_%' and n.nspname<>'information_schema'"),guards:baselineGuards,guideAcl:(await query("select p.oid::regprocedure::text signature,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated from pg_proc p where p.oid=any(array['public.guide_place_v1(uuid,jsonb)'::regprocedure::oid,'public.submit_guide_use_v1(jsonb)'::regprocedure::oid,'public.review_guide_use_v1(uuid,bigint,text,text)'::regprocedure::oid])")).rows},null,2)+'\n');
});
after(async()=>{
 if(!enabled)return;
 await admin?.end();
 if(started){execFileSync(join(bin,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{stdio:'pipe'});started=false;}
 if(nonce)rmSync(nonce,{recursive:true,force:true});
});
run('full QA baseline lifecycle and only declared two-function append/rollback catalog proof',async()=>{
 assert.ok(Object.values(baselineGuards).every(v=>v===true),JSON.stringify(baselineGuards));
 const source=readFileSync(join('supabase/migrations',append),'utf8');
 await query('begin');await query(source);await query('rollback');assert.deepEqual(await catalog(),baseline);
 await query('begin');await query(source);await query('commit');
 const current=await catalog();const changed=current.functions.filter((row,i)=>row.source!==baseline.functions[i].source);
 assert.deepEqual(changed.map(r=>r.signature).sort(),sigs.slice().sort());
 for(let i=0;i<current.functions.length;i++)assert.equal(current.functions[i].metadata,baseline.functions[i].metadata,current.functions[i].signature);
 for(const key of ['tables','roles','policies','constraints','defaults','memberships'])assert.deepEqual(current[key],baseline[key],key);
 assert.deepEqual(await guardValues(),baselineGuards);
 writeFileSync(join(artifact,'pg-catalog-proof.json'),JSON.stringify({baseline:hash(baseline),after:hash(current),changedFunctions:changed,metadataUnchanged:true,guards:await guardValues()},null,2)+'\n');
});

let actors;
const ownedTrips=[];
async function actorRpc(actor,name,params={},role='authenticated'){
 assert.match(name,/^[a-z_][a-z0-9_]*$/);assert.ok(Object.keys(params).every(k=>/^p_[a-z0-9_]+$/.test(k)));
 const c=await connect();try{
  await c.query('begin');
  const service=role==='service_role';
  await c.query("select set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true),set_config('request.jwt.claims',$3,true)",[service?'service_role':'authenticated',service?'':actor.id,JSON.stringify(service?{}:{session_id:actor.session,is_anonymous:false})]);
  if(role!=='postgres')await c.query(`set local role ${role}`);
  const entries=Object.entries(params),args=entries.map(([k],i)=>`${k}=>$${i+1}`).join(',');
  const result=(await c.query(`select public.${name}(${args}) value`,entries.map(([,v])=>v&&typeof v==='object'?JSON.stringify(v):v))).rows[0].value;
  await c.query('commit');return result;
 }catch(error){await c.query('rollback');throw error;}finally{await c.end();}
}
const privileged=(actor,name,params)=>actorRpc(actor,name,params,'postgres');
async function sourceFixture(actor,reviewer,subject,variant=false){
 const candidate=randomUUID();const date=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
 const statement={schemaVersion:'knowledge-statement/2',assertion:{subjectId:subject,predicate:'opens_during',objectId:'opening_hours',conditions:['current_dated_window'],exclusions:['no_holiday_guarantee']},scope:{cities:['shanghai'],scene:'attraction',audience:'international_independent_traveler'},place:{names:{en:'Fixture Gallery '+subject.slice(-8),zh:'样例展馆'+subject.slice(-8)}},value:{startsAt:date+'T01:00:00Z',endsAt:date+'T09:00:00Z',timeZone:'Asia/Shanghai'},expressions:{en:{text:variant?'A distinct synthetic opening variant.':'Synthetic Gallery opens during the published dated window.',conditions:['Current dated window only'],exclusions:['No holiday guarantee']},zh:{text:variant?'另一合成开放变体。':'样例展馆按已发布的当日时段开放。',conditions:['仅限当前日期'],exclusions:['不保证节假日时段']}},sources:[{sourceKey:'agent005-'+randomUUID(),revisionLabel:'v1',publisher:'Synthetic author',uri:'urn:vpj15:synthetic:agent005',locator:'Local controlled test',snippet:'SYNTHETIC ONLY; NO USER DATA',usageDeclaration:'Controlled test only'}]};
 assert.equal(await scalar('select knowledge_review_private.statement_valid($1::jsonb) value',[JSON.stringify(statement)]),true,'fixture must obey the original statement/source contract');
 await privileged(actor,'ops_review_workspace',{p_input:{action:'submit_statement',operationId:randomUUID(),candidateId:candidate,title:'Controlled source',statement}});
 await privileged(reviewer,'ops_review_workspace',{p_input:{action:'review',operationId:randomUUID(),candidateId:candidate,expectedVersion:1,decision:'reviewed',note:'Independent controlled review'}});
 await privileged(reviewer,'ops_review_workspace',{p_input:{action:'publish_statement',operationId:randomUUID(),candidateId:candidate,expectedVersion:2,useBasis:'original_factual_summary',useNote:'Controlled local fixture',expiresAt:new Date(Date.now()+86400000).toISOString()}});
 return {candidate,statement};
}
async function guideFixture(){
 if(!actors){
  actors=Array.from({length:2},()=>({id:randomUUID(),session:randomUUID()}));
  for(const a of actors)await query('insert into auth.users(id) values($1);',[a.id]);
  for(const a of actors){await query('insert into auth.sessions(id,user_id) values($1,$2)',[a.session,a.id]);await query('insert into identity_private.mobile_accounts(owner_id) values($1)',[a.id]);await query('insert into knowledge_review_private.members(actor_id,active) values($1,true)',[a.id]);}
  await query('update knowledge_review_private.settings set enabled=true;update knowledge_review_private.publication_settings set enabled=true');
 }
 const [owner,reviewer]=actors;
 // Retire only this runner's previous synthetic Trips before the next case,
 // respecting the real three-draft cap instead of raising a test quota.
 for(const prior of ownedTrips.splice(0)){
  await query('delete from public.trip_place_references where trip_id=$1 and owner_id=$2',[prior,owner.id]);
  await query('delete from public.trips where id=$1 and owner_id=$2',[prior,owner.id]);
 }
 const subject='fixture_'+randomUUID().replaceAll('-','');
 const source=await sourceFixture(owner,reviewer,subject);
 const st=await scalar("select jsonb_build_object('id',statement_id,'revision',revision,'hash',trip_support_private.hash(payload)) value from knowledge_review_private.statements where candidate_id=$1",[source.candidate]);
 const canonical=randomUUID(),trip=randomUUID(),reference=randomUUID();
 await query("insert into public.canonical_pois(id,primary_name_zh,primary_name_en) values($1,$2,$3)",[canonical,source.statement.place.names.zh,source.statement.place.names.en]);
 await query("insert into public.trips(id,owner_id,title,head_version) values($1,$2,'Controlled selected Trip',0)",[trip,owner.id]);
 ownedTrips.push(trip);
 await query("insert into public.trip_place_references(id,trip_id,owner_id,reference_kind,canonical_poi_id) values($1,$2,$3,'canonical',$4)",[reference,trip,owner.id,canonical]);
 const refs=await scalar("select jsonb_agg(jsonb_build_object('sourceRevisionId',r.id,'revisionLabel',r.revision_label,'snippetHash',r.snippet_hash,'submittedBy',r.submitted_by) order by r.id) value from knowledge_review_private.statement_sources ss join knowledge_review_private.source_revisions r on r.id=ss.source_revision_id where ss.candidate_id=$1",[source.candidate]);
 const digest=await scalar('select trip_support_private.hash($1::jsonb) value',[JSON.stringify(refs)]);
 const mapping=await privileged(owner,'submit_trip_support_entity_mapping_v1',{p_input:{operationId:randomUUID(),canonicalPoiId:canonical,statementId:st.id,expectedClaimRevision:st.revision,expectedPayloadHash:st.hash,expectedSourceDigest:digest,basisMetadata:{city:'shanghai',scene:'attraction',locale:'en',sourceRefs:refs}}});
 assert.equal(mapping.kind,'mapping_candidate');
 const reviewed=await privileged(reviewer,'review_trip_support_entity_mapping_v1',{p_mapping:mapping.mappingId,p_expected_version:mapping.version,p_expected_digest:mapping.digest,p_decision:'approve'});assert.equal(reviewed.kind,'mapping_reviewed');
 const proof=await scalar('select guide_private.proof_v1(guide_private.mapping_v1($1)) value',[mapping.mappingId]);
 const use=await privileged(owner,'submit_guide_use_v1',{p_input:{operationId:randomUUID(),mappingId:mapping.mappingId,expectedProof:proof,display:true,tts:false,cache:false,prompt:true,useBasis:'Explicit controlled prompt use',locator:'Synthetic decision',expiresAt:new Date(Date.now()+3600000).toISOString()}});assert.equal(use.kind,'use_candidate');
 assert.equal((await privileged(reviewer,'review_guide_use_v1',{p_id:use.id,p_revision:use.revision,p_digest:use.digest,p_decision:'approve'})).kind,'use_reviewed');
 const base={action:'read',expectedTripVersion:0,placeReferenceId:reference,locale:'en',interest:'general'};
 const view=await privileged(owner,'guide_place_v1',{p_trip:trip,p_input:base});assert.equal(view.kind,'ready',JSON.stringify(view));
 const conflict=await sourceFixture(owner,reviewer,subject,true);
 const policy=randomUUID(),notice='a'.repeat(64);
 await query("insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at,context_mode) values($1,'qwen','controlled-only','https://synthetic.invalid/inference','fixture','fixture','fixture','test-terms','test-notice',$2,'测试告知','Controlled notice','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day','knowledge_intent_v1')",[policy,notice]);
 await actorRpc(owner,'accept_text_policy',{p_policy_id:policy,p_notice_hash:notice});
 const command={...base,action:'follow_up',operationId:randomUUID(),expectedDigest:view.digest,question:'What are the '+source.statement.place.names.en+' opening hours?',threadId:randomUUID(),turnId:randomUUID(),policyId:policy,completedSegmentIds:[],serviceTask:{id:randomUUID(),scopeVersion:1,relationship:'new_goal',parentTurnId:null}};
 const submitted=await privileged(owner,'guide_place_v1',{p_trip:trip,p_input:command});assert.equal(submitted.kind,'submitted',JSON.stringify(submitted));
 const lease=await actorRpc(null,'claim_grounded_work',{p_owner_id:owner.id,p_policy_id:policy},'service_role');assert.equal(lease.turnId,command.turnId);
 const keys={p_turn_id:lease.turnId,p_lease_token:lease.leaseToken};
 const current=await actorRpc(null,'read_grounded_work',keys,'service_role');assert.equal(current.kind,'intent_input');
 assert.equal((await actorRpc(null,'authorize_grounded_dispatch',{...keys,p_policy_id:policy,p_provider:'qwen',p_context_digest:current.contextDigest},'service_role')).kind,'authorized');
 assert.equal((await actorRpc(null,'complete_grounded_place_work',{...keys,p_intent:'place_opening_hours',p_request_scope:'single',p_unanswered_needs:'[]',p_place_name:source.statement.place.names.en},'service_role')).kind,'finished');
 const original=await actorRpc(owner,'read_grounded_turn',{p_turn_id:command.turnId});assert.equal(original.result.originalOutcome,'blocked','real conflicting variants, not a forged blocked row');assert.equal(original.result.placeSubjectId,subject);
 await privileged(reviewer,'ops_review_workspace',{p_input:{action:'revoke_statement',operationId:randomUUID(),candidateId:conflict.candidate,expectedPublicationVersion:1,note:'Withdraw only the unmapped conflicting publication'}});
 assert.equal(await scalar('select invalidated value from guide_private.bindings_v1 where turn_id=$1',[command.turnId]),false);
 return {owner,reviewer,subject,source,st,canonical,trip,reference,refs,mapping,policy,command};
}
run('real original Guide producer creates resolved blocked turn; ordinary owner context and real TS job execute without fixture grants',async()=>{
 const f=await guideFixture();
 const context=await actorRpc(f.owner,'read_grounded_ai_assist_context_v1',{p_turn_id:f.command.turnId});assert.equal(context.kind,'context',JSON.stringify(context));assert.equal(context.placeSubjectId,f.subject);assert.equal(context.placeResolution,'matched');
 const {runGroundedAiAssistJob}=await import('../../../lib/server/knowledge/wiki/grounded-ai-assist-job.ts');
 let models=0;
 const provider={provider:'qwen',endpoint:'https://llm-fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions',configurationId:'11111111-1111-1111-1111-111111111111',configurationVersion:1,timeoutMs:5000};
 const read=await actorRpc(f.owner,'knowledge_read_v1',{p_input:{city:'shanghai',scene:'attraction',locale:'en'}});const fact=read.statements.find(s=>s.assertion.subjectId===f.subject);assert.ok(fact);
 const rpc=async(name,params)=>{try{return {data:await actorRpc(f.owner,name,params),error:null};}catch(error){return {data:null,error:{message:error.message}};}};
 const dependencies={rpc,contextRpc:rpc,credential:()=> 'fixture-only',qwenEndpoint:provider.endpoint,recordDestination:async()=>{},fetch:async()=>{models++;return Response.json({model:'qwen3.7-plus-2026-05-26',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({action:'answer',coverage:'answered',summary:'Unsupported guarantee.',citations:[{pageKey:fact.factId,quote:fact.text}],gaps:[],conflicts:[]})}}],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}});}};
 const input={maxRounds:2,maxOutputTokens:300,timeoutMs:5000,provider};
 const result=await runGroundedAiAssistJob(f.command.turnId,rpc,input,dependencies,new AbortController().signal);
 assert.equal(result.status,'succeeded',JSON.stringify(result));assert.equal(result.outcome.kind,'answered');assert.ok(result.outcome.summary.includes(f.source.statement.expressions.en.conditions[0]));
 const replay=await runGroundedAiAssistJob(f.command.turnId,rpc,input,dependencies,new AbortController().signal);assert.equal(replay.status,'succeeded');assert.equal(replay.outcome.kind,'answered');assert.equal(models,1);
 assert.equal(await scalar('select status value from turn_private.grounded_ai_assist_jobs where turn_id=$1',[f.command.turnId]),'succeeded');
 await assert.rejects(actorRpc(f.owner,'guide_place_v1',{p_trip:f.trip,p_input:{action:'read',expectedTripVersion:0,placeReferenceId:f.reference,locale:'en',interest:'general'}}),/permission denied/,'Guide ordinary ingress remains explicitly denied; no test GRANT');
 writeFileSync(join(artifact,'pg-role-result.json'),JSON.stringify({actors:2,bindingProducer:'existing guide_place_v1 under its existing postgres permission, synthetic claims',ordinaryContextWorkRole:'authenticated',ordinaryGuideIngress:'DENIED_UNCHANGED',model:'one controlled response, no provider network',initial:result.status,replay:replay.status},null,2)+'\n');
});

async function ordinaryTurn(f,city='shanghai'){
 const request={p_thread_id:randomUUID(),p_turn_id:randomUUID(),p_idempotency_key:randomUUID(),p_policy_id:f.policy,p_locale:'en',p_text:'What are the '+f.source.statement.place.names.en+' opening hours?',p_task_id:randomUUID(),p_scope_version:1,p_relationship:'new_goal',p_parent_turn_id:null,p_city:city};
 assert.equal((await actorRpc(f.owner,'submit_grounded_turn',request)).kind,'accepted');
 const lease=await actorRpc(null,'claim_grounded_work',{p_owner_id:f.owner.id,p_policy_id:f.policy},'service_role');assert.equal(lease.turnId,request.p_turn_id);
 const keys={p_turn_id:lease.turnId,p_lease_token:lease.leaseToken};const input=await actorRpc(null,'read_grounded_work',keys,'service_role');
 assert.equal((await actorRpc(null,'authorize_grounded_dispatch',{...keys,p_policy_id:f.policy,p_provider:'qwen',p_context_digest:input.contextDigest},'service_role')).kind,'authorized');
 assert.equal((await actorRpc(null,'complete_grounded_place_work',{...keys,p_intent:'place_opening_hours',p_request_scope:'single',p_unanswered_needs:'[]',p_place_name:f.source.statement.place.names.en},'service_role')).kind,'finished');
 return {request,read:await actorRpc(f.owner,'read_grounded_turn',{p_turn_id:request.p_turn_id})};
}
run('ordinary non-Guide submission and original resolver persist a matched subject; city mismatch does not borrow it',async()=>{
 const f=await guideFixture();const ordinary=await ordinaryTurn(f);
 assert.equal(ordinary.read.result.placeSubjectId,f.subject);assert.equal(ordinary.read.result.placeResolution,'matched');assert.equal(ordinary.read.result.originalOutcome,'answered');
 assert.equal(await scalar('select count(*)::int value from guide_private.bindings_v1 where turn_id=$1',[ordinary.request.p_turn_id]),0);
 assert.equal((await actorRpc(f.owner,'read_grounded_ai_assist_context_v1',{p_turn_id:ordinary.request.p_turn_id})).kind,'not_applicable','a complete ordinary answer is not offered a redundant model');
 assert.equal((await actorRpc(f.owner,'grounded_ai_assist_work_v1',{p_input:{action:'ensure',turnId:ordinary.request.p_turn_id}})).kind,'not_applicable','preserve the original not-blocked work contract');
 const otherCity=await ordinaryTurn(f,'beijing');assert.equal(otherCity.read.result.placeSubjectId,null);assert.equal(otherCity.read.result.placeResolution,'unavailable');assert.notEqual(otherCity.read.result.originalOutcome,'answered');
 writeFileSync(join(artifact,'pg-ordinary-result.json'),JSON.stringify({role:'authenticated',producer:'submit_grounded_turn + original service-role worker resolver',matched:true,persistedSubject:true,guideBindingRows:0,ordinaryOutcome:ordinary.read.result.originalOutcome,otherCityResolution:otherCity.read.result.placeResolution,sourceScope:'shanghai only',GoTrue:'UNRUN'},null,2)+'\n');
});
run('wrong actor, old turn, injected subject and duplicate completion cannot mutate another current binding/job',async()=>{
 const f=await guideFixture(),tid=f.command.turnId;
 const before=await scalar('select to_jsonb(b) value from guide_private.bindings_v1 b where turn_id=$1',[tid]);
 assert.equal((await actorRpc(f.reviewer,'read_grounded_ai_assist_context_v1',{p_turn_id:tid})).kind,'unavailable');
 assert.equal((await actorRpc(f.reviewer,'grounded_ai_assist_work_v1',{p_input:{action:'ensure',turnId:tid}})).kind,'unavailable');
 assert.deepEqual(await scalar('select to_jsonb(b) value from guide_private.bindings_v1 b where turn_id=$1',[tid]),before);
 assert.equal((await actorRpc(f.owner,'read_grounded_ai_assist_context_v1',{p_turn_id:randomUUID()})).kind,'unavailable');
 await assert.rejects(actorRpc(f.owner,'grounded_ai_assist_work_v1',{p_input:{action:'ensure',turnId:tid,placeSubjectId:f.subject}}),/INVALID_INPUT/);
 const claimed=await actorRpc(f.owner,'grounded_ai_assist_work_v1',{p_input:{action:'ensure',turnId:tid}});assert.equal(claimed.kind,'claimed');
 const complete={action:'complete',jobId:claimed.jobId,claimToken:claimed.claimToken,outcome:{kind:'succeeded',result:{kind:'unavailable',reason:'retrieval_miss'}}};
 await assert.rejects(actorRpc(f.reviewer,'grounded_ai_assist_work_v1',{p_input:complete}),/UNAUTHENTICATED/);
 assert.equal((await actorRpc(f.owner,'grounded_ai_assist_work_v1',{p_input:complete})).kind,'succeeded');
 await assert.rejects(actorRpc(f.owner,'grounded_ai_assist_work_v1',{p_input:complete}),/OPS_CONFLICT/);
 for(const role of ['anon','service_role'])await assert.rejects(actorRpc(f.owner,'read_grounded_ai_assist_context_v1',{p_turn_id:tid},role),/permission denied/);
});
run('concurrent ordinary ensure and complete keep one original job/claim and no duplicated successful write',async()=>{
 const f=await guideFixture(),tid=f.command.turnId;
 const pair=await Promise.all([1,2].map(()=>actorRpc(f.owner,'grounded_ai_assist_work_v1',{p_input:{action:'ensure',turnId:tid}})));
 assert.equal(pair.filter(p=>p.kind==='claimed').length,1,JSON.stringify(pair));assert.equal(await scalar('select count(*)::int value from turn_private.grounded_ai_assist_jobs where turn_id=$1',[tid]),1);
 const claim=pair.find(p=>p.kind==='claimed'),command={action:'complete',jobId:claim.jobId,claimToken:claim.claimToken,outcome:{kind:'succeeded',result:{kind:'unavailable',reason:'retrieval_miss'}}};
 const replies=await Promise.allSettled([1,2].map(()=>actorRpc(f.owner,'grounded_ai_assist_work_v1',{p_input:command})));
 assert.equal(replies.filter(r=>r.status==='fulfilled'&&r.value.kind==='succeeded').length,1,JSON.stringify(replies));
 assert.equal(await scalar('select status value from turn_private.grounded_ai_assist_jobs where turn_id=$1',[tid]),'succeeded');
});
for(const mode of ['source-withdrawal','canonical-change','trip-head-change','reference-deletion','trip-deletion'])run(`current ${mode} fences context, ensure and late completion`,async()=>{
 const f=await guideFixture(),tid=f.command.turnId,claimed=await actorRpc(f.owner,'grounded_ai_assist_work_v1',{p_input:{action:'ensure',turnId:tid}});assert.equal(claimed.kind,'claimed');
 if(mode==='source-withdrawal')await privileged(f.owner,'ops_source_revision_withdraw_v1',{p_input:{operationId:randomUUID(),sourceRevisionId:f.refs[0].sourceRevisionId,reason:'Controlled source withdrawal'}});
 if(mode==='canonical-change')await query("update public.canonical_pois set primary_name_en='Controlled changed identity' where id=$1",[f.canonical]);
 if(mode==='trip-head-change')await query('update public.trips set head_version=head_version+1 where id=$1',[f.trip]);
 if(mode==='reference-deletion'||mode==='trip-deletion')await query('delete from public.trip_place_references where id=$1',[f.reference]);
 if(mode==='trip-deletion')await query('delete from public.trips where id=$1',[f.trip]);
 assert.notEqual((await actorRpc(f.owner,'read_grounded_ai_assist_context_v1',{p_turn_id:tid})).kind,'context');
 assert.equal((await actorRpc(f.owner,'grounded_ai_assist_work_v1',{p_input:{action:'ensure',turnId:tid}})).kind,'unavailable');
 assert.equal((await actorRpc(f.owner,'grounded_ai_assist_work_v1',{p_input:{action:'complete',jobId:claimed.jobId,claimToken:claimed.claimToken,outcome:{kind:'succeeded',result:{kind:'unavailable',reason:'retrieval_miss'}}}})).kind,'unavailable');
 assert.equal(await scalar('select status value from turn_private.grounded_ai_assist_jobs where turn_id=$1',[tid]),'running','rejected late completion never records success');
});

async function jobHarness(f,{dropAck=false,controller=null}={}){
 const {runGroundedAiAssistJob}=await import('../../../lib/server/knowledge/wiki/grounded-ai-assist-job.ts');
 const provider={provider:'qwen',endpoint:'https://llm-fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions',configurationId:'11111111-1111-1111-1111-111111111111',configurationVersion:1,timeoutMs:5000};
 const read=await actorRpc(f.owner,'knowledge_read_v1',{p_input:{city:'shanghai',scene:'attraction',locale:'en'}}),fact=read.statements.find(s=>s.assertion.subjectId===f.subject);assert.ok(fact);
 const counters={models:0,completes:0};
 const rpc=async(name,params)=>{
  try{const value=await actorRpc(f.owner,name,params);
   if(name==='grounded_ai_assist_work_v1'&&params.p_input.action==='complete'){counters.completes++;if(dropAck)return {data:null,error:null};}
   return {data:value,error:null};
  }catch(error){return {data:null,error:{message:error.message}};}
 };
 const dependencies={rpc,contextRpc:rpc,credential:()=> 'fixture-only',qwenEndpoint:provider.endpoint,recordDestination:async()=>{},fetch:async()=>{
  counters.models++;controller?.abort();return Response.json({model:'qwen3.7-plus-2026-05-26',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({action:'answer',coverage:'answered',summary:'Controlled proposal only.',citations:[{pageKey:fact.factId,quote:fact.text}],gaps:[],conflicts:[]})}}],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}});
 }};
 return {counters,run:(signal=new AbortController().signal)=>runGroundedAiAssistJob(f.command.turnId,rpc,{maxRounds:2,maxOutputTokens:300,timeoutMs:5000,provider},dependencies,signal)};
}
run('unknown completion ACK reconciles by the original done poll without another model or write',async()=>{
 const f=await guideFixture(),h=await jobHarness(f,{dropAck:true});
 assert.deepEqual(await h.run(),{status:'pending'});assert.equal(await scalar('select status value from turn_private.grounded_ai_assist_jobs where turn_id=$1',[f.command.turnId]),'succeeded');
 const reconciled=await h.run();assert.equal(reconciled.status,'succeeded');assert.equal(reconciled.outcome.kind,'answered');assert.deepEqual(h.counters,{models:1,completes:1});
});
run('done read after actual source withdrawal cannot display stored success or run another model',async()=>{
 const f=await guideFixture(),h=await jobHarness(f);assert.equal((await h.run()).outcome.kind,'answered');
 await privileged(f.owner,'ops_source_revision_withdraw_v1',{p_input:{operationId:randomUUID(),sourceRevisionId:f.refs[0].sourceRevisionId,reason:'Withdraw after persisted controlled answer'}});
 const replay=await h.run();assert.equal(replay.status,'not_offered');assert.deepEqual(h.counters,{models:1,completes:1});
 assert.equal(await scalar('select status value from turn_private.grounded_ai_assist_jobs where turn_id=$1',[f.command.turnId]),'succeeded','immutable historical receipt is not rewritten as current authority');
});
run('client cancellation during the controlled model call never completes successfully or reruns on a fresh pending poll',async()=>{
 const f=await guideFixture(),controller=new AbortController(),h=await jobHarness(f,{controller});
 assert.deepEqual(await h.run(controller.signal),{status:'cancelled'});assert.deepEqual(h.counters,{models:1,completes:0});
 assert.deepEqual(await h.run(),{status:'pending'});assert.deepEqual(h.counters,{models:1,completes:0});
});
run('deleted original session and a fresh same-owner session cannot revive the old selected binding',async()=>{
 const f=await guideFixture(),tid=f.command.turnId,claim=await actorRpc(f.owner,'grounded_ai_assist_work_v1',{p_input:{action:'ensure',turnId:tid}});
 assert.equal(claim.kind,'claimed');
 await query('delete from auth.sessions where id=$1',[f.owner.session]);
 await assert.rejects(actorRpc(f.owner,'read_grounded_ai_assist_context_v1',{p_turn_id:tid}),/UNAUTHENTICATED/);
 const fresh={id:f.owner.id,session:randomUUID()};await query('insert into auth.sessions(id,user_id) values($1,$2)',[fresh.session,fresh.id]);
 assert.equal((await actorRpc(fresh,'read_grounded_ai_assist_context_v1',{p_turn_id:tid})).kind,'unavailable');
 assert.equal((await actorRpc(fresh,'grounded_ai_assist_work_v1',{p_input:{action:'ensure',turnId:tid}})).kind,'unavailable');
 assert.equal((await actorRpc(fresh,'grounded_ai_assist_work_v1',{p_input:{action:'complete',jobId:claim.jobId,claimToken:claim.claimToken,outcome:{kind:'succeeded',result:{kind:'unavailable',reason:'retrieval_miss'}}}})).kind,'unavailable');
 assert.equal(await scalar('select status value from turn_private.grounded_ai_assist_jobs where turn_id=$1',[tid]),'running');
});
run('all declared lifecycle guards and original Guide/context/work ACL vectors remain intact after role/race/lifecycle cases',async()=>{
 assert.deepEqual(await guardValues(),baselineGuards);assert.ok(Object.values(await guardValues()).every(v=>v===true));
 const vector=(await query("select p.oid::regprocedure::text signature,r.role,has_function_privilege(r.role,p.oid,'EXECUTE') execute from pg_proc p cross join (values('anon'),('authenticated'),('service_role')) r(role) where p.oid=any(array['public.read_grounded_ai_assist_context_v1(uuid)'::regprocedure::oid,'public.grounded_ai_assist_work_v1(jsonb)'::regprocedure::oid,'public.guide_place_v1(uuid,jsonb)'::regprocedure::oid]) order by 1,2")).rows;
 assert.ok(vector.every(row=>row.execute===(row.role==='authenticated'&&!row.signature.startsWith('guide_place_v1'))));
 writeFileSync(join(artifact,'pg-final-role-vectors.json'),JSON.stringify({guards:await guardValues(),vector,noFixtureGrants:true,subjects:2,transport:'private Unix socket',GoTrue:'UNRUN',target:'UNRUN'},null,2)+'\n');
});
