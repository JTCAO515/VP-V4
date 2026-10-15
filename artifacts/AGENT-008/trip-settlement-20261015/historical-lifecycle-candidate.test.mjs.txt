import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {nativeDatabase} from './native-db.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const catalogSQL="select coalesce(jsonb_agg(jsonb_build_object('relation',n.nspname||'.'||c.relname,'columns',(select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),'constraints',(select jsonb_agg(pg_get_constraintdef(k.oid) order by k.conname) from pg_constraint k where k.conrelid=c.oid)) order by n.nspname,c.relname),'[]'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname not in('pg_catalog','information_schema','extensions','auth','result_data_private','storage','realtime','_realtime','vault','supabase_functions','supabase_migrations')";
test('audited lifecycle candidate: exact baseline source hashes, only declared column/constraint delta', {skip:!process.env.VP_TRIP_PG_BIN,timeout:180000},async t=>{
 const {db,upgrade}=await nativeDatabase(t);
 assert.deepEqual((await db('select conversation_data_private.schema_supported_v1() c,turn_data_private.schema_supported_v1() t'))[0],{c:true,t:true});
 const before=(await db(catalogSQL))[0].coalesce;
 const signatures=['conversation_data_private.sources_v1()','conversation_data_private.schema_supported_v1()','turn_data_private.sources_v1()','turn_data_private.schema_supported_v1()'];
 const defs=await db(`select oid::regprocedure::text signature,prosrc,pg_get_functiondef(oid) definition from pg_proc where oid in(${signatures.map(s=>"'"+s+"'::regprocedure").join(',')}) order by signature`);
 await db('begin;'+upgrade+'commit;');
 const after=(await db(catalogSQL))[0].coalesce;
 const differences=[];
 for(let i=0;i<before.length;i++){
  assert.equal(after[i].relation,before[i].relation);
  if(JSON.stringify(before[i])===JSON.stringify(after[i]))continue;
  const a=after[i],b=before[i];differences.push(b.relation);
  if(b.relation==='turn_private.service_task_capacity_settings'){
   assert.deepEqual(a.columns,[...b.columns,['trip_enabled','boolean',true]]);assert.deepEqual(a.constraints,b.constraints);
  }else{
   assert.equal(b.relation,'turn_private.service_tasks');assert.deepEqual(a.columns,[...b.columns,['trip_objective','jsonb',false]]);
   const extra=a.constraints.filter(x=>!b.constraints.includes(x)),removed=b.constraints.filter(x=>!a.constraints.includes(x));
   assert.equal(removed.length,1);assert.match(removed[0],/expected_result/);assert.equal(extra.length,2);
   assert.ok(extra.some(x=>x==="CHECK (((expected_result = 'trip_modification'::text) = (trip_objective IS NOT NULL)))"));
   assert.ok(extra.some(x=>x==="CHECK ((expected_result = ANY (ARRAY['text_answer'::text, 'reviewed_answer'::text, 'trip_modification'::text])))"));
  }
 }
 assert.deepEqual(differences,['turn_private.service_task_capacity_settings','turn_private.service_tasks']);
 const digest=(await db(`select encode(sha256(convert_to((${catalogSQL})::text,'UTF8')),'hex') hash`))[0].hash;
 const lit=s=>"'"+s.replaceAll("'","''")+"'";
 const sql=[];
 for(const d of defs){
  let updated=d.definition;
  if(d.signature.endsWith('.sources_v1()')){
   const anchor="'capacity_enforced']::text[]";assert.equal(updated.split(anchor).length,2);
   updated=updated.replace(anchor,"'capacity_enforced','trip_objective']::text[]");
  }else{
   const re=/\{"name":\s*"capacity_enforced",\s*"type":\s*"boolean",\s*"notNull":\s*true\}/g;
   assert.equal([...updated.matchAll(re)].length,1);
   updated=updated.replace(re,m=>m+',{"name":"trip_objective","type":"jsonb","notNull":false}');
   if(d.signature.startsWith('turn_data_private.')){
    const hashes=[...updated.matchAll(/='([a-f0-9]{64})'/g)];assert.equal(hashes.length,1);updated=updated.replace(hashes[0][0],"='"+digest+"'");
   }
  }
  sql.push(`do $guard$begin if encode(sha256(convert_to((select prosrc from pg_proc where oid=${lit(d.signature)}::regprocedure),'UTF8')),'hex')<>${lit(sha(d.prosrc))} then raise exception 'TRIP_LIFECYCLE_SOURCE_DRIFT';end if;end $guard$;\n${updated};`);
 }
 writeFileSync('artifacts/AGENT-008/trip-settlement-20261015/lifecycle-registration.candidate.sql',sql.join('\n'));
 writeFileSync('artifacts/AGENT-008/trip-settlement-20261015/lifecycle-registration.audit.json',JSON.stringify({baselineFunctions:defs.map(d=>({signature:d.signature,sourceHash:sha(d.prosrc)})),catalogDelta:differences,newAuditedCatalogHash:digest},null,2)+'\n');
 // Candidate is applied only in this disposable fixture, not shipped/adopted.
 await db('begin;'+sql.join('\n')+'commit;');
 // Existing infrastructure fingerprints still reject changed completion/admission
 // writers. Registration remains a candidate for Main; do not weaken that guard.
 assert.equal((await db('select conversation_data_private.schema_supported_v1() c'))[0].c,true);
 console.log('lifecycle remainder',await db('select result_data_private.infrastructure_supported_v1() infrastructure,turn_data_private.schema_supported_v1() turn'));
 await db('alter table turn_private.service_tasks add column unexpected_future_column text');
 assert.deepEqual((await db('select conversation_data_private.schema_supported_v1() c,turn_data_private.schema_supported_v1() t'))[0],{c:false,t:false});
});
