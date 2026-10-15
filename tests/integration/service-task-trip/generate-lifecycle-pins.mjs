// Developer generator only. Produces fixed reviewed SQL, never run by production
// migration discovery. Unknown catalog changes fail the declared-delta assertions.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {nativeDatabase} from './native-db.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex'),md5=s=>createHash('md5').update(s).digest('hex');
const migration='supabase/migrations/20261015034446_agent008_trip_service_task_settlement_current.sql';
const marker='-- AGENT008_LIFECYCLE_PINS_BEGIN';
const cleanups=[];
try{
 const {db:rawdb,upgrade}=await nativeDatabase({after:f=>cleanups.push(f)});
 const db=q=>rawdb("set search_path='';"+q);
 const signatures=['conversation_data_private.sources_v1()','conversation_data_private.schema_supported_v1()','turn_data_private.sources_v1()','turn_data_private.schema_supported_v1()','profile_data_private.schema_v1()','result_data_private.schema_supported_v1()','turn_data_private.runtime_supported_v1()'];
 const defs=await db(`select oid::regprocedure::text signature,prosrc,proacl::text acl,pg_get_functiondef(oid) definition from pg_proc where oid in(${signatures.map(s=>"'"+s+"'::regprocedure").join(',')})`);
 const catalog="select coalesce(jsonb_agg(jsonb_build_object('relation',n.nspname||'.'||c.relname,'columns',(select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),'constraints',(select jsonb_agg(pg_get_constraintdef(k.oid) order by k.conname) from pg_constraint k where k.conrelid=c.oid)) order by n.nspname,c.relname),'[]'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname not in('pg_catalog','information_schema','extensions','auth','result_data_private','storage','realtime','_realtime','vault','supabase_functions','supabase_migrations')";
 const before=(await db(catalog))[0].coalesce;
 const originalAPIs=await db("select oid::regprocedure::text signature,prosrc,proacl::text acl,pg_get_functiondef(oid) definition from pg_proc where oid in('public.privacy_turn_data_v1(text,text,bigint)'::regprocedure,'public.privacy_conversation_data_v1(text,text,bigint)'::regprocedure,'turn_data_private.export_source_v1(uuid)'::regprocedure,'export_private.core_turn_page_v1(jsonb)'::regprocedure)");
 for(const sig of signatures.filter(s=>/supported|schema_v1/.test(s)))assert.equal((await db('select '+sig+' v'))[0].v,true,sig);
 await db('begin;'+upgrade.split(marker)[0]+'commit;');
 const after=(await db(catalog))[0].coalesce;
 const changedAPIs=[];
 if(upgrade.includes('-- AGENT008_TRIP_PRIVACY_VERSION_BEGIN')){const audited=JSON.parse(readFileSync('artifacts/AGENT-008/trip-settlement-20261015/trip-privacy-source.audit.json','utf8')).functions;
 for(const old of originalAPIs){const actual=(await db("select prosrc,proacl::text acl,pg_get_functiondef(oid) definition from pg_proc where oid='"+old.signature+"'::regprocedure"))[0];const a=audited.find(a=>a.legacyOnlyTripRecordRefusal&&a.original===old.signature);assert.ok(a);assert.equal(sha(old.prosrc),a.before);assert.equal(sha(actual.prosrc),a.after);assert.equal(actual.acl,old.acl);assert.equal(actual.definition,old.definition.replace(old.prosrc,()=>actual.prosrc));changedAPIs.push({d:old,src:actual.prosrc,replacements:[[old.prosrc,actual.prosrc]]});}}assert.equal(before.length,after.length);
 const delta=[];
 for(let i=0;i<before.length;i++){
  const b=before[i],a=after[i];assert.equal(a.relation,b.relation);
  if(JSON.stringify(a)===JSON.stringify(b))continue;delta.push(b.relation);
  if(b.relation==='turn_private.service_task_capacity_settings'){assert.deepEqual(a.columns,[...b.columns,['trip_enabled','boolean',true]]);assert.deepEqual(a.constraints,b.constraints);}
  else{assert.equal(b.relation,'turn_private.service_tasks');assert.deepEqual(a.columns,[...b.columns,['trip_objective','jsonb',false]]);
   const added=a.constraints.filter(x=>!b.constraints.includes(x)),removed=b.constraints.filter(x=>!a.constraints.includes(x));
   assert.equal(removed.length,1);assert.equal(added.length,2);assert.ok(added.includes("CHECK (((expected_result = 'trip_modification'::text) = (trip_objective IS NOT NULL)))"));assert.ok(added.includes("CHECK ((expected_result = ANY (ARRAY['text_answer'::text, 'reviewed_answer'::text, 'trip_modification'::text])))"));
  }
 }
 assert.deepEqual(delta,['turn_private.service_task_capacity_settings','turn_private.service_tasks']);
 const changes=new Map();
 for(const d of defs.filter(d=>!d.signature.includes('runtime_supported'))){
  let src=d.prosrc;const replacements=[];
  const replace=(old,n)=>{assert.equal(src.split(old).length,2,d.signature+' exact anchor');src=src.replace(old,()=>n);replacements.push([old,n]);};
  if(d.signature.endsWith('.sources_v1()'))replace("'capacity_enforced']::text[]","'capacity_enforced','trip_objective']::text[]");
  if(d.signature.startsWith('conversation_data_private.schema_')||d.signature.startsWith('turn_data_private.schema_')){
   const matches=[...src.matchAll(/\{"name":\s*"capacity_enforced",\s*"type":\s*"boolean",\s*"notNull":\s*true\}/g)];assert.equal(matches.length,1);replace(matches[0][0],matches[0][0]+',{"name":"trip_objective","type":"jsonb","notNull":false}');
  }
  if(d.signature==='profile_data_private.schema_v1()'){
   const tableMatch=/expected:='((?:[^']|'')*)'::jsonb/.exec(src);assert.ok(tableMatch);const expected=JSON.parse(tableMatch[1].replaceAll("''","'"));
   const oldTable=JSON.stringify(expected['turn_private.service_tasks']).replaceAll("'","''");const actual=after.find(x=>x.relation==='turn_private.service_tasks');
   replace(oldTable,JSON.stringify({columns:actual.columns,constraints:actual.constraints}).replaceAll("'","''"));
   const triggers=/if actual is distinct from '((?:[^']|'')*)'::jsonb/.exec(src);assert.ok(triggers);const oldTriggers=JSON.parse(triggers[1].replaceAll("''","'"));
   const names=/names text\[\]:=(array\[[^\]]+\])/.exec(src);assert.ok(names);
   const triggerSQL="select coalesce(jsonb_agg(jsonb_build_array(tgrelid::regclass::text,tgname,pg_get_triggerdef(oid),tgfoid::regprocedure::text) order by tgrelid::regclass::text,tgname),'[]') v from pg_trigger where not tgisinternal and tgrelid=any("+"("+names[1]+"||array(select relation_name from profile_data_private.sources_v1()))::regclass[])";
   const current=(await db(triggerSQL))[0].v;const added=current.filter(t=>!oldTriggers.some(b=>JSON.stringify(t)===JSON.stringify(b)));const removed=oldTriggers.filter(b=>!current.some(t=>JSON.stringify(t)===JSON.stringify(b)));
   if(removed.length)console.log('trigger comparison',JSON.stringify(oldTriggers[0]),JSON.stringify(current[0]));assert.equal(removed.length,0);assert.ok(added.length>0);for(const t of added)assert.ok(['settle_trip_service_task','trip_proposal_terminal','trip_worker_terminal','trip_objective_text_erased','trip_objective_message_erased','trip_objective_trip_erased','trip_objective_account_erased'].includes(t[1]),'only authored new deletion hooks');
   replace(triggers[0],"if actual is distinct from '"+JSON.stringify(current).replaceAll("'","''")+"'::jsonb");
  }
  if(!d.signature.startsWith('conversation_data_private.')&&!d.signature.endsWith('.sources_v1()')){
   const hash=[...src.matchAll(/(?:=|<>|distinct from)\s*'([a-f0-9]{64})'/g)];assert.equal(hash.length,1,d.signature+' catalog hash');
   const start=src.indexOf('(select coalesce(jsonb_agg(');const end=src.indexOf(')::text)',start);assert.ok(start>=0&&end>start);
   const query=src.slice(start+1,end);const computed=(await db("select encode(sha256(convert_to(("+query+")::text,'UTF8')),'hex') h"))[0].h;
   replace(hash[0][1],computed);
  }
  changes.set(d.signature,{d,src,replacements});
 }
 const d=defs.find(d=>d.signature.includes('runtime_supported'));let src=d.prosrc;const replacements=[];
 for(const [sig,c] of [...changes,...changedAPIs.map(c=>[c.d.signature,c])]){const old=JSON.stringify(sig)+':'+JSON.stringify(md5(c.d.definition));if(src.includes(old)){assert.equal(src.split(old).length,2);const n=JSON.stringify(sig)+':'+JSON.stringify(md5(c.replacements.reduce((definition,[a,b])=>definition.replace(a,()=>b),c.d.definition)));src=src.replace(old,()=>n);replacements.push([old,n]);}}
 changes.set(d.signature,{d,src,replacements});
 const lit=s=>"'"+s.replaceAll("'","''")+"'";
 const sql=[marker,'-- Fixed original source hashes and declared two-table delta only. No catalog adoption.'];
 for(const [sig,c] of changes){
  sql.push(`do $pin$declare f record;changed text;begin\n select prosrc,proacl,pg_get_functiondef(oid) definition into f from pg_proc where oid=${lit(sig)}::regprocedure;\n if encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')<>${lit(sha(c.d.prosrc))} then raise exception 'TRIP_LIFECYCLE_SOURCE_DRIFT';end if;\n changed:=f.definition;`);
  for(const [old,n] of c.replacements)sql.push(` if (length(changed)-length(replace(changed,${lit(old)},'')))/length(${lit(old)})<>1 then raise exception 'TRIP_LIFECYCLE_ANCHOR_DRIFT';end if;\n changed:=replace(changed,${lit(old)},${lit(n)});`);
  sql.push(` execute changed;\n if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex')<>${lit(sha(c.src))} or proacl is distinct from f.proacl from pg_proc where oid=${lit(sig)}::regprocedure) then raise exception 'TRIP_LIFECYCLE_AFTER_DRIFT';end if;\n end $pin$;`);
 }
 await db('begin;'+sql.join('\n')+'commit;');
 for(const sig of signatures.filter(s=>/supported|schema_v1/.test(s)))assert.equal((await db('select '+sig+' v'))[0].v,true,sig+' after exact registration');
 console.log('runtime',await db('select turn_data_private.runtime_supported_v1() runtime'));
 writeFileSync(migration,upgrade.split(marker)[0]+sql.join('\n')+'\n');
 writeFileSync('artifacts/AGENT-008/trip-settlement-20261015/lifecycle-current.audit.json',JSON.stringify({delta,functions:[...changes].map(([signature,c])=>({signature,before:sha(c.d.prosrc),after:sha(c.src),acl:c.d.acl,replacements:c.replacements}))},null,2)+'\n');
 console.log('Seven fixed lifecycle registrations PASS; infrastructure/write-hooks unchanged.');
}finally{for(const f of cleanups)await f();}
