import {randomUUID} from 'node:crypto';
import {connect} from './db.mjs';
const admin=await connect();
export const query=(sql,params=[])=>admin.query(sql,params);
export const scalar=async(sql,params=[])=>(await query(sql,params)).rows[0]?.value;
import assert from 'node:assert/strict';
async function actorRpc(actor,name,params={},role='authenticated'){
 assert.match(name,/^[a-z_][a-z0-9_]*$/);assert.ok(Object.keys(params).every(k=>/^p_[a-z0-9_]+$/.test(k)));
 const c=await connect();try{
  await c.query('begin');
  const service=role==='service_role'||role==='postgres_service';
  await c.query("select set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true),set_config('request.jwt.claims',$3,true)",[service?'service_role':'authenticated',service?'':actor.id,JSON.stringify(service?{}:{role:'authenticated',session_id:actor.session,is_anonymous:false})]);
  if(role!=='postgres'&&role!=='postgres_service')await c.query(`set local role ${role}`);
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

export {actorRpc,privileged,sourceFixture};
export async function close(){await admin.end();}
export async function fixture(contextMode='current_input_v1'){
 const [owner,reviewer]=Array.from({length:2},()=>({id:randomUUID(),session:randomUUID()}));
 for(const a of [owner,reviewer]){
  await query('insert into auth.users(id) values($1)',[a.id]);await query('insert into auth.sessions(id,user_id) values($1,$2)',[a.session,a.id]);
  await query('insert into identity_private.mobile_accounts(owner_id) values($1)',[a.id]);await query('insert into knowledge_review_private.members(actor_id,active) values($1,true)',[a.id]);
 }
 await query('update knowledge_review_private.settings set enabled=true;update knowledge_review_private.publication_settings set enabled=true');
 const subject='fixture_'+randomUUID().replaceAll('-','');const source=await sourceFixture(owner,reviewer,subject);
 const st=await scalar("select jsonb_build_object('id',statement_id,'revision',revision,'hash',trip_support_private.hash(payload)) value from knowledge_review_private.statements where candidate_id=$1",[source.candidate]);
 const canonical=randomUUID(),trip=randomUUID(),reference=randomUUID(),providerPoiId='self-only-'+randomUUID();
 await query('insert into public.canonical_pois(id,primary_name_zh,primary_name_en) values($1,$2,$3)',[canonical,source.statement.place.names.zh,source.statement.place.names.en]);
 await query("insert into public.provider_poi_mappings(id,canonical_poi_id,provider,provider_poi_id,raw_name) values($1,$2,'amap',$3,'Synthetic observed alias')",[randomUUID(),canonical,providerPoiId]);
 await query("insert into public.trips(id,owner_id,title,head_version) values($1,$2,'Controlled selected Trip',0)",[trip,owner.id]);
 await query("insert into public.trip_place_references(id,trip_id,owner_id,reference_kind,canonical_poi_id) values($1,$2,$3,'canonical',$4)",[reference,trip,owner.id,canonical]);
 const refs=await scalar("select jsonb_agg(jsonb_build_object('sourceRevisionId',r.id,'revisionLabel',r.revision_label,'snippetHash',r.snippet_hash,'submittedBy',r.submitted_by) order by r.id) value from knowledge_review_private.statement_sources ss join knowledge_review_private.source_revisions r on r.id=ss.source_revision_id where ss.candidate_id=$1",[source.candidate]);
 const sourceDigest=await scalar('select trip_support_private.hash($1::jsonb) value',[JSON.stringify(refs)]);
 const mapping=await privileged(owner,'submit_trip_support_entity_mapping_v1',{p_input:{operationId:randomUUID(),canonicalPoiId:canonical,statementId:st.id,expectedClaimRevision:st.revision,expectedPayloadHash:st.hash,expectedSourceDigest:sourceDigest,basisMetadata:{city:'shanghai',scene:'attraction',locale:'en',sourceRefs:refs}}});
 assert.equal(mapping.kind,'mapping_candidate');assert.equal((await privileged(reviewer,'review_trip_support_entity_mapping_v1',{p_mapping:mapping.mappingId,p_expected_version:mapping.version,p_expected_digest:mapping.digest,p_decision:'approve'})).kind,'mapping_reviewed');
 const policy=randomUUID(),notice='a'.repeat(64);
 await query("insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at,context_mode) values($1,'qwen','controlled-only','https://synthetic.invalid/inference','fixture','fixture','fixture','test-terms','test-notice',$2,'测试告知','Controlled notice','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day',$3)",[policy,notice,contextMode]);
 await actorRpc(owner,'accept_text_policy',{p_policy_id:policy,p_notice_hash:notice});
 const selection={canonicalPoiId:canonical,provider:'amap',providerPoiId};
 // Existing ordinary read stays denied; use its existing owner-only internal body
 // as postgres for a synthetic navigation fixture, never grant it to the actor.
 const context=await privileged(owner,'read_place_action_context_v1',{p_trip:trip,p_input:{action:'context',expectedTripVersion:0,selection,locale:'en'}});
 assert.equal(context.kind,'place_action_context',JSON.stringify(context));

 const submission={threadId:randomUUID(),turnId:randomUUID(),idempotencyKey:randomUUID(),policyId:policy,locale:'en',text:'What time does it open?',serviceTask:{id:randomUUID(),scopeVersion:1,relationship:'new_goal',parentTurnId:null}};
 const expectation={tripId:trip,headVersion:0,...selection,mappingDigest:context.mappingDigest,contextDigest:context.contextDigest,referenceId:reference,locale:'en'};
 const request={schemaVersion:'canonical-place-ask/1',submission,expectation};
 return {owner,reviewer,subject,source,st,canonical,trip,reference,refs,mapping,policy,submission,expectation,request,context};
}
