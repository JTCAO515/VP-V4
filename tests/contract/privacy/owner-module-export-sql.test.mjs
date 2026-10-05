import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const path='supabase/migrations/20261006010000_owner_module_export.sql';
const sql=readFileSync(path,'utf8');
const old=readFileSync('supabase/migrations/20261005030000_reminder_delivery.sql','utf8');

test('owner SQL preserves the existing closed notification projection, without credentials or core export',()=>{
 const start=old.indexOf("  select 'reminder:'",old.indexOf('create function notification_private.export_metadata_v1'));
 const original=old.slice(start,old.indexOf('  order by key limit 10001',start)).trim();
 const newStart=sql.indexOf("  select 'reminder:'");
 const projection=sql.slice(newStart,sql.indexOf(' ) candidates order by key',newStart)).trim();
 assert.equal(projection,original.replaceAll('j.owner_id','u').replaceAll('clock_timestamp()','at_time'));
 assert.doesNotMatch(projection,/\btoken\b|\btopic\b|request_bytes/);
 assert.doesNotMatch(sql,/create or replace|grant\s+|alter table\s+(public|auth|identity_private|export_private|trip_lifecycle_private|notification_private)\.|set_config|core_jobs_v1|privacy_core_export_v1\(/i);
 assert.match(sql,/from trip_lifecycle_private\.trips_v1\(u,null,10001\)/);
});

test('direct SQL contract derives authority before request lookup/effects, exact DTO and fixed clock',()=>{
 const rpc=sql.slice(sql.indexOf('create function public.privacy_coverage_module_export_v1'));
 const guard=rpc.indexOf('perform identity_private.guard_mobile_rpc_v2();');
 const reauth=rpc.indexOf("raise exception 'REAUTHENTICATION_REQUIRED'");
 const firstLookup=rpc.indexOf('select * into f from coverage_export_private.request_fences_v1');
 const firstWrite=rpc.indexOf('insert into coverage_export_private.request_fences_v1');
 assert.ok(guard>0&&reauth>guard&&firstLookup>reauth&&firstWrite>firstLookup);
 assert.equal((rpc.match(/clock_timestamp\(\)/g)||[]).length,1);
 assert.match(rpc,/notification_private\.exact\(p_input,keys\) is not true/);
 assert.match(rpc,/mobile_access_v2\(\) is not true/);
 assert.match(rpc,/created_at between at_time-interval '5 minutes' and at_time/);
 assert.match(rpc,/now_ms,now_ms\+30000/);
 assert.match(rpc,/if f\.expires_at<=now_ms then raise exception 'COVERAGE_EXPIRED'/);
 assert.match(rpc,/source_digest is distinct from digest_n/);
 assert.match(rpc,/count\(\*\)=cardinality\(section_names\)/);
});

test('new state default-deny, metadata-only FK lifecycle, bounded source before digest and exact retry',()=>{
 assert.match(sql,/revoke all on schema coverage_export_private from public,anon,authenticated,service_role/);
 assert.match(sql,/revoke all on function public\.privacy_coverage_module_export_v1\(jsonb\) from public,anon,authenticated,service_role/);
 for(const name of ['requests_v1','sections_v1','request_fences_v1'])assert.match(sql,new RegExp(`alter table coverage_export_private\\.${name} enable row level security`));
 assert.match(sql,/session_id uuid not null references auth\.sessions\(id\) on delete cascade/);
 assert.match(sql,/expires_at=captured_at\+30000/);
 const helper=sql.slice(sql.indexOf('create function coverage_export_private.sources_v1'),sql.indexOf('create function public.privacy_coverage_module_export_v1'));
 assert.match(helper,/jsonb_array_length\(items\)>10000/);assert.match(helper,/jsonb_array_length\(ops\)>10000/);assert.match(helper,/octet_length\(notification_private.canonical\(sections\)\)>1000000/);
 assert.doesNotMatch(helper,/notification_private\.hash/);
 assert.match(sql,/progress\.last_cursor is not distinct from cursor_n/);assert.match(sql,/progress\.last_limit is distinct from limit_n/);assert.match(sql,/if not replay then/);
});
