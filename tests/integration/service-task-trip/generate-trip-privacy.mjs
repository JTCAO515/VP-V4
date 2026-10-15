// Reviewable development generator: copy only fixed original authority bodies,
// bind the Trip-specific projection and preserve legacy v1 source/DTO functions.
import {nativeDatabase} from './native-db.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const sha=s=>createHash('sha256').update(s).digest('hex'),lit=s=>"'"+s.replaceAll("'","''")+"'";
const file='supabase/migrations/20261015034446_agent008_trip_service_task_settlement_current.sql',pins='-- AGENT008_LIFECYCLE_PINS_BEGIN',start='-- AGENT008_TRIP_PRIVACY_VERSION_BEGIN';
const cleanups=[];
try{
 const {db:raw,upgrade}=await nativeDatabase({after:f=>cleanups.push(f)});const db=q=>raw("set search_path='';"+q);
 const specs=await db("select n.nspname schema,p.proname name,p.oid::regprocedure::text signature,p.prosrc,pg_get_functiondef(p.oid) definition,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname in('conversation_data_private','turn_data_private') and p.proname in('zero_counts_v1','source_v1','lock_source_v1','erase_source_v1','binding_v1','receipt_v1','preview_v1','input_v1','graph_source_v1','export_source_v1')) or n.nspname='public' and p.proname in('privacy_turn_data_v1','privacy_conversation_data_v1') order by p.oid");
 const corePage=(await db("select oid::regprocedure::text signature,prosrc,pg_get_functiondef(oid) definition,proacl::text acl from pg_proc where oid='export_private.core_turn_page_v1(jsonb)'::regprocedure"))[0];
 const tables=['contexts_v1','work_v1','requests_v1','operations_v1','lineage_v1'];
 const extra=[];for(const table of tables){const columns=await db(`select a.attname name,format_type(a.atttypid,a.atttypmod) type,a.attnotnull "notNull" from pg_attribute a where a.attrelid='scoped_edit_private.${table}'::regclass and a.attnum>0 and not a.attisdropped order by a.attnum`);const pk=(await db(`select array_agg(a.attname::text order by k.ordinality) pk from pg_constraint c cross join lateral unnest(c.conkey) with ordinality k(attnum,ordinality) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum where c.conrelid='scoped_edit_private.${table}'::regclass and c.contype='p'`))[0].pk;extra.push({relation:'scoped_edit_private.'+table,countKey:'trip'+table.replace('_v1','').split('_').map(w=>w[0].toUpperCase()+w.slice(1)).join(''),effect:'erase',pk,columns,hasOwner:true,tripOnly:true});}
 const newNames=new Map();for(const s of specs){const k=s.schema==='conversation_data_private'?'c':s.schema==='turn_data_private'?'t':s.name.includes('conversation')?'c':'t';newNames.set(s.schema+'.'+s.name,'turn_private.trip_privacy_'+k+'_'+(s.schema==='public'?'api_v1':s.name));}
 const common={ 'conversation_data_private.sources_v1':'turn_private.trip_privacy_c_sources_v1','turn_data_private.sources_v1':'turn_private.trip_privacy_t_sources_v1','conversation_data_private.related_v1':'turn_private.trip_privacy_c_related_v1','turn_data_private.related_v1':'turn_private.trip_privacy_t_related_v1','conversation_data_private.documents_v1':'turn_private.trip_privacy_documents_v1','conversation_data_private.erase_order_v1':'turn_private.trip_privacy_erase_order_v1','conversation_data_private.boundaries_v1':'turn_private.trip_privacy_c_boundaries_v1','turn_data_private.boundaries_v1':'turn_private.trip_privacy_t_boundaries_v1','turn_data_private.export_predicate_v1':'turn_private.trip_privacy_export_predicate_v1'};
 const output=[start,readFileSync('tests/integration/service-task-trip/trip-privacy-helpers.sql','utf8')];
 for(const kind of ['c','t']){
 const original=kind==='c'?'conversation_data_private':'turn_data_private';
 output.push(`create function turn_private.trip_privacy_${kind}_sources_v1() returns table(relation_name text,count_key text,effect text,pk text[],columns_n text[],has_owner boolean) language sql stable set search_path='' as $$ select * from ${original}.sources_v1() union all values\n`+extra.map(s=>`(${lit(s.relation)},${lit(s.countKey)},'erase',array[${s.pk.map(lit).join(',')}]::text[],array[${s.columns.map(c=>lit(c.name)).join(',')}]::text[],true)`).join(',\n')+'\n$$;');
 }
 const audit=[];
 for(const s of specs){
 const kind=s.schema==='conversation_data_private'?'c':s.schema==='turn_data_private'?'t':s.name.includes('conversation')?'c':'t';
 let body=s.prosrc;
 const mapping={...common};for(const [a,b] of newNames)if(a.startsWith((kind==='c'?'conversation_data_private':'turn_data_private')+'.'))mapping[a]=b;
 if(s.schema==='public')mapping[s.schema+'.'+s.name]=newNames.get(s.schema+'.'+s.name);
 for(const [a,b] of Object.entries(mapping))body=body.replaceAll(a,b);
 if(s.name==='export_source_v1'){
 body=body.replaceAll("'turn-core-export/1'","'turn-trip-core-export/1'");
 body=body.replace('where m.turn_id=any(roots) or exists(',"where m.turn_id=any(roots) or exists(select 1 from turn_private.service_tasks st where st.goal_turn_id=any(roots) and st.owner_id=u and st.expected_result='trip_modification' and st.id=m.task_id) or exists(");
 body=body.replace("g:=jsonb_build_object('turnIds',roots,'messageIds',msgs,'artifactIds',arts);refs:=jsonb_build_object('taskIds',tasks);","g:=jsonb_build_object('turnIds',roots,'messageIds',msgs,'artifactIds',arts,'tripTaskIds',(select coalesce(jsonb_agg(id order by id),'[]'::jsonb) from turn_private.service_tasks where id=any(tasks) and expected_result='trip_modification'));refs:=jsonb_build_object('taskIds',tasks);if not turn_private.trip_privacy_exclusive_v1(u,g) then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;");
 body=body.replace("if s.has_owner and v->>'owner_id'","if s.relation_name='turn_private.service_tasks' and v->>'expected_result'='trip_modification' and v->'trip_objective'->>'outcome'<>'erased' and not exists(select 1 from turn_private.assistant_messages m join turn_private.assistant_goals goal on goal.id=m.goal_id and goal.owner_id=m.owner_id and goal.conversation_id=m.conversation_id join turn_private.assistant_conversations conversation on conversation.id=m.conversation_id and conversation.owner_id=m.owner_id where m.id=(v->'trip_objective'->>'messageId')::uuid and m.owner_id=u and m.task_id=(v->>'id')::uuid and m.goal_id=(v->'trip_objective'->>'goalId')::uuid and m.conversation_id=(v->'trip_objective'->>'conversationId')::uuid and m.scope_version=(v->'trip_objective'->>'goalVersion')::integer and goal.scope_version>=m.scope_version and m.sequence=(v->'trip_objective'->>'messageSequence')::bigint) then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;\n   if s.has_owner and v->>'owner_id'");
 body=body.replace(/order by array_position\(array\[([^\]]+)\]::text\[\],relation_name\)/,(_m,inside)=>"order by array_position(array["+inside+","+extra.map(s=>lit(s.relation)).join(',')+"]::text[],relation_name)");
 }

 if(s.name==='zero_counts_v1')body=` select ${s.schema}.zero_counts_v1(effect_n)||case effect_n when 'erase' then '{"tripContexts":0,"tripWork":0,"tripRequests":0,"tripOperations":0,"tripLineage":0}'::jsonb when 'redact' then '{"tripObjectives":0}'::jsonb else '{}'::jsonb end `;
 if(s.name==='input_v1')body=body.replace('begin',`begin\n if v->>'schemaVersion' is distinct from '${kind==='c'?'conversation-trip-data/1':'turn-trip-data/1'}' or v->>'scope' is distinct from '${kind==='c'?'conversation-sensitive-data/1':'turn-sensitive-data/1'}' or a not in('preview','erase','recover') then return false;end if;\n v:=v-'schemaVersion';`);
 if(s.name==='graph_source_v1')body=body.replace('where m.turn_id=t or exists(',"where m.turn_id=t or exists(select 1 from turn_private.service_tasks st where st.goal_turn_id=t and st.owner_id=u and st.expected_result='trip_modification' and st.trip_objective->>'messageId'=m.id::text) or exists(");
 if(s.name==='graph_source_v1')body=body.replace("and w.relationship in('goal_start','amendment'))<>1))","and w.relationship in('goal_start','amendment'))<>1 and not turn_private.trip_privacy_goal_writer_v1(g.id,u,g.scope_version,g.current_text)))");
 if(s.name==='source_v1'){
  if(kind==='c')body=body.replace("g:=closure_n->'graph';", "g:=turn_private.trip_privacy_graph_v1(u,closure_n->'graph','{}'::jsonb);");
  else body=body.replace("g:=b->'graph';refs:=b->'retainedReferences';", "g:=turn_private.trip_privacy_graph_v1(u,b->'graph',b->'retainedReferences');refs:=b->'retainedReferences';");
  const conflict=kind==='c'?"if not conversation_data_private.schema_supported_v1()":"if not turn_private.trip_privacy_exclusive_v1(u,g) then bad:=array_append(bad,'SCOPED_EDIT_REFERENCE');end if;\n if not conversation_data_private.schema_supported_v1()";
  if(kind==='c')body=body.replace(' if conflicts_n @>'," if not turn_private.trip_privacy_exclusive_v1(u,g) then conflicts_n:=conflicts_n||array['SCOPED_EDIT_REFERENCE'];end if;\n if conflicts_n @>");
  else body=body.replace("select coalesce(array_agg(id order by id),array[]::uuid[]) into ex", "if not turn_private.trip_privacy_exclusive_v1(u,g) then bad:=array_append(bad,'SCOPED_EDIT_REFERENCE');end if;\n select coalesce(array_agg(id order by id),array[]::uuid[]) into ex");
  const inc=kind==='c'?"if spec.count_key='tasks' and actual_n->'trip_objective'->>'outcome' is distinct from 'erased' then redact_n:=jsonb_set(redact_n,'{tripObjectives}',to_jsonb((redact_n->>'tripObjectives')::integer+1));end if;":"if spec.count_key='tasks' and v->'trip_objective'->>'outcome' is distinct from 'erased' then redact_n:=jsonb_set(redact_n,'{tripObjectives}',to_jsonb((redact_n->>'tripObjectives')::integer+1));end if;";
  body=body.replace(kind==='c'?"   if actual_n->>'policy_id'":"   if v->>'policy_id'",'   '+inc+'\n'+(kind==='c'?"   if actual_n->>'policy_id'":"   if v->>'policy_id'"));
  if(kind==='t')body=body.replace('turn_data_private.json_references_v1(v)',"turn_data_private.json_references_v1(case when spec.relation_name='turn_private.service_tasks' then v-'trip_objective' else v end)");
 }
 if(s.name==='lock_source_v1')body=body.replace(kind==='c'?"select pk into pk_n from turn_private.trip_privacy_c_sources_v1()":"select * into spec from turn_private.trip_privacy_t_sources_v1()",kind==='c'?"select pk into pk_n from turn_private.trip_privacy_c_sources_v1()":"select * into spec from turn_private.trip_privacy_t_sources_v1()");
 if(s.name==='erase_source_v1'){
  body=body.replace('begin',`begin\n perform turn_private.trip_privacy_assert_redacted_v1(u,${kind==='c'?"source_n":"src"}->'graph');`);
  // Compute the declared count before the original hide invokes the actual erasure trigger.
  body=body.replace('declare ', 'declare objectives_n integer;');
  body=body.replace('begin\n perform',`begin\n select count(*) into objectives_n from turn_private.service_tasks where id=any(privacy_private.linked_delete_array_v1(${kind==='c'?"source_n":"src"}->'graph'->'tripTaskIds')) and owner_id=u and trip_objective->>'outcome'<>'erased';\n perform`);
  body=body.replace(kind==='c'?" if actual_erase is distinct":" if ec is distinct",(kind==='c'?" actual_redact:=jsonb_set(actual_redact,'{tripObjectives}',to_jsonb(objectives_n));\n if actual_erase is distinct":" rc:=jsonb_set(rc,'{tripObjectives}',to_jsonb(objectives_n));\n if ec is distinct"));
 }
 if(s.schema==='public')body=body.replace('from jsonb_each(r.graph);',"from jsonb_each(r.graph) where key not in('tripTaskIds','tripPrivacyTripIds');");
 if(s.name==='binding_v1'||s.schema==='public')body=body.replaceAll(kind==='c'?"'conversation-data/1'":"'turn-data/1'",kind==='c'?"'conversation-trip-data/1'":"'turn-trip-data/1'");
 let def=s.definition.replace(s.schema+'.'+s.name,newNames.get(s.schema+'.'+s.name));
 def=def.replace(s.prosrc,()=>body);
 output.push(`do $original$begin if encode(sha256(convert_to((select prosrc from pg_proc where oid=${lit(s.signature)}::regprocedure),'UTF8')),'hex')<>${lit(sha(s.prosrc))} then raise exception 'TRIP_PRIVACY_ORIGINAL_DRIFT';end if;end $original$;\n`+def+';');
 audit.push({original:s.signature,before:sha(s.prosrc),newFunction:newNames.get(s.schema+'.'+s.name),after:sha(body)});
 }
 for(const s of specs.filter(s=>s.schema==='public')){
  const kind=s.name.includes('conversation')?'conversation_data_private':'turn_data_private';
  const hook=` if exists(select 1 from ${kind}.operations_v1 versioned where versioned.owner_id=u and (p_action='list' or versioned.request_id=nullif(v->>'requestId','')::uuid) and coalesce(versioned.graph,versioned.decision->'graph') ? 'tripTaskIds') then raise exception 'TRIP_PRIVACY_VERSION_REQUIRED';end if;\n`;
  assert.ok(s.prosrc.includes(' scope_n:='));const patched=s.prosrc.replace(' scope_n:=',()=>hook+' scope_n:=');
  output.push(`do $legacy$declare f record;begin select prosrc,proacl,pg_get_functiondef(oid) definition into f from pg_proc where oid=${lit(s.signature)}::regprocedure; if encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')<>${lit(sha(s.prosrc))} then raise exception 'TRIP_PRIVACY_LEGACY_DRIFT';end if;execute replace(f.definition,${lit(' scope_n:=')},${lit(hook+' scope_n:=')});if(select proacl from pg_proc where oid=${lit(s.signature)}::regprocedure) is distinct from f.proacl then raise exception 'TRIP_PRIVACY_LEGACY_ACL_DRIFT';end if;end $legacy$;`);
  audit.push({original:s.signature,before:sha(s.prosrc),after:sha(patched),legacyOnlyTripRecordRefusal:true});
 }
 const originalExport=specs.find(s=>s.schema==='turn_data_private'&&s.name==='export_source_v1');
 const exportHook="begin\n if exists(select 1 from turn_private.service_tasks where owner_id=u and expected_result='trip_modification') then perform turn_private.require_trip_runtime_v1();return turn_private.trip_privacy_t_export_source_v1(u);end if;";
 const exportAfter=originalExport.prosrc.replace('begin',()=>exportHook);
 output.push(`do $dispatch$declare f record;begin select prosrc,proacl,pg_get_functiondef(oid) definition into f from pg_proc where oid=${lit(originalExport.signature)}::regprocedure;if encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')<>${lit(sha(originalExport.prosrc))} then raise exception 'TRIP_EXPORT_DISPATCH_DRIFT';end if;execute overlay(f.definition placing ${lit(exportHook)} from position('begin' in f.definition) for 5);if(select proacl from pg_proc where oid=${lit(originalExport.signature)}::regprocedure) is distinct from f.proacl then raise exception 'TRIP_EXPORT_DISPATCH_ACL_DRIFT';end if;end $dispatch$;`);
 audit.push({original:originalExport.signature,before:sha(originalExport.prosrc),after:sha(exportAfter),legacyOnlyTripRecordRefusal:true,tripOnlyExportDispatch:true});
 const pageAnchor="'schemaVersion','turn-core-export/1'",pageReplacement="'schemaVersion',case when (select count(distinct group_n.value->>'relation') from jsonb_array_elements(src->'snapshot'->'sources') as group_n(value) where group_n.value->>'relation'=any(array['scoped_edit_private.contexts_v1','scoped_edit_private.work_v1','scoped_edit_private.requests_v1','scoped_edit_private.operations_v1','scoped_edit_private.lineage_v1']))=5 then 'turn-trip-core-export/1' else 'turn-core-export/1' end";
 assert.equal(corePage.prosrc.split(pageAnchor).length,2);const pageAfter=corePage.prosrc.replace(pageAnchor,()=>pageReplacement);
 output.push(`do $page$declare f record;begin select prosrc,proacl,pg_get_functiondef(oid) definition into f from pg_proc where oid=${lit(corePage.signature)}::regprocedure;if encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')<>${lit(sha(corePage.prosrc))} then raise exception 'TRIP_EXPORT_PAGE_DRIFT';end if;execute replace(f.definition,${lit(pageAnchor)},${lit(pageReplacement)});if(select proacl from pg_proc where oid=${lit(corePage.signature)}::regprocedure) is distinct from f.proacl then raise exception 'TRIP_EXPORT_PAGE_ACL_DRIFT';end if;end $page$;`);
 audit.push({original:corePage.signature,before:sha(corePage.prosrc),after:sha(pageAfter),legacyOnlyTripRecordRefusal:true,tripOnlyExportPageVersion:true});
 output.push(readFileSync('tests/integration/service-task-trip/trip-privacy-front.sql','utf8'));
 output.push("do $$declare f record;begin for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='turn_private' and proname like 'trip_privacy_%' loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);end loop;end $$;");
 const prefix=upgrade.split(pins)[0].split(start)[0];
 writeFileSync(file,prefix+output.join('\n')+'\n'+upgrade.slice(upgrade.indexOf(pins)));
 writeFileSync('artifacts/AGENT-008/trip-settlement-20261015/trip-privacy-source.audit.json',JSON.stringify({functions:audit,extraSources:extra},null,2)+'\n');
 const schema=JSON.parse(readFileSync('lib/server/privacy/turn-data/source-schema.json','utf8')).filter(s=>!s.tripOnly);writeFileSync('lib/server/privacy/turn-data/source-schema.json',JSON.stringify([...schema,...extra],null,2)+'\n');
 console.log('Explicit Trip privacy copies generated from fixed original sources; legacy v1 unchanged.');
}finally{for(const f of cleanups)await f();}
