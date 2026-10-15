import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {ownedPg} from './owned-pg.mjs';
import {scopedCases} from './scoped-cases.mjs';
import {isUserAddressText} from '../../../lib/trip-user-address.ts';
import {lifecycleCases} from './lifecycle-cases.mjs';
import {resourceCases} from './resource-cases.mjs';
import {readerCases} from './reader-cases.ts';
import {authorityCases} from './authority-cases.mjs';
if(process.env.IOS004_RESOURCE_TEST==='1')await resourceCases();
const pg=await ownedPg(),c=pg.client;
try {
 await c.query(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await c.query("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;grant usage on schema auth to authenticated,anon,service_role;");
 for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f<'20261015161024').sort()){
  try {await c.query('begin');await c.query(readFileSync('supabase/migrations/'+file,'utf8'));await c.query('commit');}
  catch(e){await c.query('rollback');throw Error(file+': '+e.message);}
 }
 const signatures=['public.apply_trip_content_patch(jsonb,jsonb)','public.trip_content_snapshot(uuid,text)','public.confirm_and_apply_trip_proposal(uuid,text,text)','export_private.trip_content_v1(jsonb)','public.record_scoped_trip_edit_destination_v1(jsonb,jsonb,text,text,text,text)','scoped_edit_private.manual_patch_v1(scoped_edit_private.contexts_v1,jsonb)','scoped_edit_private.candidate_patch_v1(scoped_edit_private.contexts_v1,uuid,uuid,jsonb)'];
 const rows=(await c.query('select oid::regprocedure::text signature,prosrc,pg_get_functiondef(oid) definition,proacl::text acl from pg_proc where oid=any($1::regprocedure[])',[signatures])).rows;
 writeFileSync('artifacts/IOS-004/address-authority-20261016/original-functions.json',JSON.stringify(rows,null,2)+'\n');
 console.log('PASS chronological base replay; original functions captured for source comparison',rows.map(r=>r.signature));
 const guardSignatures=['conversation_data_private.schema_supported_v1()','profile_data_private.schema_v1()','result_data_private.schema_supported_v1()','result_data_private.infrastructure_supported_v1()','turn_data_private.runtime_supported_v1()','turn_data_private.schema_supported_v1()','turn_private.trip_service_task_runtime_v1()','place_actions_private.ask_schema_v1()'];
 const guardBefore=(await c.query("select oid::regprocedure::text signature,prosrc,pg_get_functiondef(oid) definition from pg_proc where oid=any($1::regprocedure[])",[guardSignatures])).rows;
 writeFileSync('artifacts/IOS-004/address-authority-20261016/guard-candidates-before.json',JSON.stringify(guardBefore,null,2)+'\n');
 if(process.env.IOS004_APPLY==='1'){
  const migration=readFileSync('supabase/migrations/20261015161024_ios004_online_user_address.sql','utf8');
  const legacyOwner=randomUUID(),legacyTrip=randomUUID();
  await c.query('insert into auth.users(id) values($1)',[legacyOwner]);
  await c.query("insert into public.trips(id,owner_id,title) values($1,$2,'Untouched old row')",[legacyTrip,legacyOwner]);
  const legacyBefore=(await c.query('select row_to_json(s) value from public.trip_version_snapshots s where trip_id=$1',[legacyTrip])).rows;
  await c.query('begin');
  await c.query("create or replace function public.trip_content_snapshot(p_trip_id uuid,p_title text) returns jsonb language sql stable security invoker set search_path='' set timezone='UTC' as $$select '{}'::jsonb$$");
  await assert.rejects(()=>c.query(migration),/IOS004_SOURCE_DRIFT/);await c.query('rollback');
  for(const mutation of [
   'grant execute on function public.apply_trip_content_patch(jsonb,jsonb) to authenticated',
   "alter function public.trip_content_snapshot(uuid,text) set search_path=public",
   'grant execute on function export_private.trip_content_v1(jsonb) to authenticated',
   "alter function turn_private.trip_service_task_runtime_v1() set search_path=public",
  ]){await c.query('begin');await c.query(mutation);await assert.rejects(()=>c.query(migration),/IOS004_.*DRIFT/);await c.query('rollback');}
  await c.query('begin');await c.query(migration);await c.query('rollback');
  assert.equal((await c.query("select to_regnamespace('ios004_address_private') value")).rows[0].value,null);
  assert.equal((await c.query("select turn_private.trip_service_task_runtime_v1() value")).rows[0].value,true);
  await c.query('begin');await c.query(migration);await c.query('commit');
  assert.deepEqual((await c.query('select row_to_json(s) value from public.trip_version_snapshots s where trip_id=$1',[legacyTrip])).rows,legacyBefore);
  console.log('PASS known-source drift rejection, transaction rollback, no rewrite of old snapshot rows');
  for(const text of ['', '　\n ', '\t地址\n', '\u0085地址', '\u0001地址', '中'.repeat(500), '中'.repeat(501), '😀'.repeat(375), '😀'.repeat(376), 'a'.repeat(500), 'a'.repeat(501)]){
   assert.equal((await c.query('select ios004_address_private.valid_text_v1($1::jsonb) value',[JSON.stringify(text)])).rows[0].value,isUserAddressText(text));
  }
  console.log('PASS SQL/shared codec scalar500/UTF8-1500/control/blank exact parity');
  const fixture=await authorityCases(c);
  await readerCases(c,fixture);
  await scopedCases(c,fixture);
  const exported=(await c.query('select export_private.trip_content_v1($1) value',[fixture.current])).rows[0].value;
  assert.equal(exported.days[0].items[0].chineseAddress.text,fixture.current.days[0].items[0].chineseAddress.text);
  for(const bad of [{text:'地址',source:'user_provided',verification:'verified'},{text:'地址',source:'user_provided',verification:'unverified',extra:true},{text:'　',source:'user_provided',verification:'unverified'}]){
   const copy=structuredClone(fixture.current);copy.days[0].items[0].chineseAddress=bad;
   await assert.rejects(()=>c.query('select export_private.trip_content_v1($1)',[copy]),/SOURCE_UNAVAILABLE/);
  }
  console.log('PASS original export projection includes exact manual text; malformed values fail closed');
  const authored=(await c.query('select oid::regprocedure::text signature,prosrc,pg_get_functiondef(oid) definition,proacl::text acl from pg_proc where oid=any($1::regprocedure[])',[signatures])).rows;
  writeFileSync('artifacts/IOS-004/address-authority-20261016/authored-functions.json',JSON.stringify(authored,null,2)+'\n');
  const oldBySig=new Map(rows.map(row=>[row.signature,row]));
  const afterGuard=(await c.query("select prosrc from pg_proc where oid='turn_private.trip_service_task_runtime_v1()'::regprocedure")).rows[0].prosrc;
  let expectedGuard=guardBefore.find(row=>row.signature==='turn_private.trip_service_task_runtime_v1()').prosrc;
  for(const signature of ['trip_content_snapshot(uuid,text)','apply_trip_content_patch(jsonb,jsonb)','record_scoped_trip_edit_destination_v1(jsonb,jsonb,text,text,text,text)','scoped_edit_private.manual_patch_v1(scoped_edit_private.contexts_v1,jsonb)','scoped_edit_private.candidate_patch_v1(scoped_edit_private.contexts_v1,uuid,uuid,jsonb)']){
   const old=oldBySig.get(signature),current=authored.find(row=>row.signature===signature);
   for(const key of ['prosrc','definition']){
    const beforeHash=createHash('sha256').update(old[key]).digest('hex'),afterHash=createHash('sha256').update(current[key]).digest('hex');
    assert.equal(expectedGuard.split(beforeHash).length,2);expectedGuard=expectedGuard.replace(beforeHash,afterHash);
   }
   assert.equal(current.acl,old.acl);
  }
  assert.equal(afterGuard,expectedGuard,'guard body differs by exactly ten authored hashes');
  assert.deepEqual(authored.find(row=>row.signature==='confirm_and_apply_trip_proposal(uuid,text,text)'),oldBySig.get('confirm_and_apply_trip_proposal(uuid,text,text)'),'original sole writer remains byte-identical');
  const safeTrip=(await c.query('select ios004_address_private.omit_online_addresses_v1($1) value',[fixture.current])).rows[0].value;
  const expected=structuredClone(fixture.current);for(const day of expected.days)for(const item of day.items)delete item.chineseAddress;
  assert.deepEqual(safeTrip,expected);assert.equal(JSON.stringify(safeTrip).includes('chineseAddress'),false);
  console.log('PASS guard exactly ten pin replacements, original writer byte-identical, SQL model omission preserves old fields');

  const guards=['conversation_data_private.schema_supported_v1()','profile_data_private.schema_v1()','result_data_private.schema_supported_v1()','result_data_private.infrastructure_supported_v1()','turn_data_private.runtime_supported_v1()','turn_data_private.schema_supported_v1()','turn_private.trip_service_task_runtime_v1()','place_actions_private.ask_schema_v1()'];
  const states=[];for(const signature of guards)states.push({signature,value:(await c.query('select '+signature+' value')).rows[0].value});
  console.log('GUARDS',JSON.stringify(states));
  assert.ok(states.every(state=>state.value===true),'all existing supported-layout/runtime guards must remain true');
  await lifecycleCases(c,fixture);


 }

} finally {await pg.cleanup();}
