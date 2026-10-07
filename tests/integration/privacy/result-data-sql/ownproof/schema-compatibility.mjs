// Source-only managed-schema simulations, not signed GoTrue acceptance. The
// sole TS integrator reruns the preserved original signed Auth chain separately.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {randomUUID as uuid} from 'node:crypto';
import {db,fixture,call,selected,eraseFor,actor,json,lit,container} from './runtime.mjs';import {decodeResultPreview,decodeResultList} from './wire.mjs';import {sql} from '../../../cost/fixtures/postgres-rpc.mjs';
const supported=()=>db('select result_data_private.schema_supported_v1();');const observations=[];
assert.equal(await supported(),'t');
for(const name of ['storage','realtime','_realtime','vault','supabase_functions','supabase_migrations'])await db(`create schema ${name};create table ${name}.ownproof_operational(id uuid primary key default gen_random_uuid(),metadata jsonb);insert into ${name}.ownproof_operational(metadata) values('{"ordinarySystemMetadata":true}');`);
const oldQuery=readFileSync('tests/integration/privacy/result-data-sql/ownproof/catalog-query.sql','utf8').trim().replace(/;$/,'');
assert.notEqual(await db(`set search_path='';select result_data_private.digest_v1((${oldQuery})::text);`),'6c2371cd4338f681af77de8fe888a4ae3692bd0abcf1736c14eaf0935314020d');
assert.equal(await supported(),'t');observations.push('six real observed operational namespaces change former hash but unrelated shapes remain supported');
assert.equal(await db("select has_function_privilege('authenticated','public.privacy_result_data_v1(text,text,bigint)','EXECUTE');"),'f');
await db('grant execute on function public.privacy_result_data_v1(text,text,bigint) to authenticated;');
const a=await fixture(),list={action:'list',scope:'result-sensitive-data/1',rootKind:'artifact',cursor:null,limit:20};assert.ok(decodeResultList(await call(a,list),list,actor(a),Date.now()));
await db('create table storage.ownproof_incoming(id uuid primary key,artifact_id uuid references turn_private.result_artifacts(id) on delete cascade);');assert.equal(await supported(),'f');await db('drop table storage.ownproof_incoming;');
observations.push('incoming system-schema CASCADE FK to application rejects, even empty');
await db('create table realtime.ownproof_unregistered(id uuid primary key,source_result_id uuid);');assert.equal(await supported(),'f');await db('drop table realtime.ownproof_unregistered;');observations.push('system namespace alone cannot hide an unregistered typed application column');
await db(`update storage.ownproof_operational set metadata=${json({artifactIds:[a.artifact]})};`);assert.equal(await supported(),'f');await db(`update storage.ownproof_operational set metadata=${json({title:a.artifact,ordinarySystemMetadata:true})};`);assert.equal(await supported(),'t');observations.push('typed JSON link to actual result rejects; arbitrary UUID title does not become authority');
await db('create table realtime.ownproof_subscription(id uuid primary key default gen_random_uuid(),entity regclass);insert into realtime.ownproof_subscription(entity) values(\'turn_private.result_artifacts\'::regclass);');assert.equal(await supported(),'f');await db('drop table realtime.ownproof_subscription;');observations.push('actual application regclass consumer rejects without a declared FK');
await db('create table supabase_functions.hooks(id uuid primary key default gen_random_uuid(),hook_table_id oid);insert into supabase_functions.hooks(hook_table_id) values(\'turn_private.result_revisions\'::regclass::oid);');assert.equal(await supported(),'f');await db('drop table supabase_functions.hooks;');observations.push('actual webhook application table OID rejects');
await db('create schema ownproof_application;create table ownproof_application.references(id uuid primary key,payload jsonb);');assert.equal(await supported(),'f');await db('drop schema ownproof_application cascade;');
await db('create table public.ownproof_application(id uuid primary key,artifact_id uuid references turn_private.result_artifacts(id));');assert.equal(await supported(),'f');await db('drop table public.ownproof_application;');
await db('alter table turn_private.result_events add column ownproof_unknown text;');assert.equal(await supported(),'f');await db('alter table turn_private.result_events drop column ownproof_unknown;');
// A drop/add repair creates a dropped-column catalog entry; the audited visible
// columns, types, PKs/FKs/checks must still match exactly after rollback.
assert.equal(await supported(),'t');observations.push('unknown application namespaces/tables/incoming FK and mapped-column drift still reject; original private schema remains hashed');
for(const mutation of ['alter table turn_private.result_events drop constraint result_events_pkey;',
 'alter table turn_private.result_revisions drop constraint result_revisions_artifact_id_fkey;alter table turn_private.result_revisions add constraint result_revisions_artifact_id_fkey foreign key(artifact_id) references turn_private.result_artifacts(id) on delete restrict;',
 'alter table private.audit_events add column ownproof_unknown text;']){
 assert.equal(await supported(),'t');assert.equal(await db('begin;'+mutation+'select result_data_private.schema_supported_v1();rollback;'),'f');assert.equal(await supported(),'t');
}
observations.push('mapped PK/FK and original private.audit_events visible-column changes independently fail under otherwise supported system state');
const s=selected(a),p=await call(a,{action:'preview',...s});assert.equal(p.eligible,true);assert.ok(decodeResultPreview(p,s,actor(a),Date.now()));const receipt=await call(a,eraseFor(s,p));assert.equal(receipt.decision.sourceResult,'erased');
await db(`update storage.ownproof_operational set metadata=${json({artifactId:a.artifact})};`);assert.equal(await supported(),'f');observations.push('typed JSON reference to erased permanent application identity also rejects');
assert.equal(await db('select count(*) from result_data_private.transaction_proofs_v1;'),'0');
for(const name of ['storage','realtime','_realtime','vault','supabase_functions','supabase_migrations'])await db(`drop schema ${name} cascade;`);
await db('revoke execute on function public.privacy_result_data_v1(text,text,bigint) from authenticated;');
assert.equal(await supported(),'t');
writeFileSync('tests/integration/privacy/result-data-sql/ownproof/schema-compatibility.json',JSON.stringify({kind:'owned no-network PG schema simulations; actual signed Auth remains TS-owned',pass:observations},null,2)+'\n');console.log('schema compatibility and all fail-closed negatives PASS',observations.length);
