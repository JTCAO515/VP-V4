import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../../../supabase/migrations/20261005050000_service_operations.sql',import.meta.url),'utf8');
test('service operations migration adds no role activation, operator enrollment or Trip writer',()=>{
 const executable=migration.replace(/--[^\n]*/g,'');
 assert.doesNotMatch(executable,/\bgrant\s+|insert\s+into\s+service_operations_private\.(operators|shifts|slots)|(?:insert\s+into|update|delete\s+from)\s+public\.(?:trips|trip_proposals|trip_items|trip_days)\b/i);
 assert.doesNotMatch(executable,/create\s+or\s+replace\s+function|(?:alter|drop)\s+(?:function|policy)|on\s+public\.trip_archives/i);
});
test('each new public capability defaults to denied execution',()=>{
 const wrappers=[...migration.matchAll(/create function public\.([a-z_0-9]+)\(/g)].map(m=>m[1]);
 assert.deepEqual(wrappers.sort(),['service_case_data_v1','service_case_export_v1','service_case_operations_v1']);
 for(const fn of wrappers)assert.match(migration,new RegExp('revoke all on function [^;]*public\\.'+fn+'\\([^;]*from public,anon,authenticated,service_role;'));
});
test('new data scope preserves original core export and explicitly incomplete coverage',()=>{
 assert.doesNotMatch(migration,/alter table export_private|update export_private\.core_jobs|create or replace function public\.privacy_core_export/);
 assert.match(migration,/'scope','service-case-data\/1'/);
 assert.match(migration,/'corePackageEnrollment','not_enrolled','allUserDataCompleted',false/);
 assert.match(migration,/'brief','unavailable','attachments','unavailable'/);
 assert.doesNotMatch(migration,/to_jsonb\([csomda]\)/);
});
