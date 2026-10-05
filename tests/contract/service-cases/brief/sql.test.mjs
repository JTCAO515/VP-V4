import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../../../supabase/migrations/20261005060000_traveler_brief.sql',import.meta.url),'utf8');
const executable=sql.replace(/--[^\n]*/g,'');
test('Brief migration only adds its own reference lifecycle and defaults to denied capability',()=>{
 assert.doesNotMatch(executable,/\bgrant\s+|create\s+or\s+replace\s+function|alter table export_private|(?:insert\s+into|update|delete\s+from)\s+(?:public\.(?:trips|memory_profiles|user_profiles)|turn_private\.assistant_(?:travel_intakes|goals|messages))\b/i);
 assert.match(sql,/enabled boolean not null default false/);
 assert.match(sql,/revoke all on function public\.service_case_brief_v1\(jsonb,text,text\) from public,anon,authenticated,service_role/);
 assert.deepEqual([...sql.matchAll(/create function public\.([a-z_0-9]+)\(/g)].map(x=>x[1]),['service_case_brief_v1']);
});
test('Brief records contain no value, summary, message or provider payload column',()=>{
 const tables=[...sql.matchAll(/create table service_brief_private\.([a-z_]+) \(([\s\S]*?)\n\);/g)];
 assert.equal(tables.length,6);
 for(const [,name,body] of tables)assert.doesNotMatch(body,/\b(?:value|summary|problem|intake|input_text|provider_payload|fields)\s+(?:jsonb|text)\b/i,name);
 const audit=tables.find(x=>x[1]==='audit')[2];assert.doesNotMatch(audit,/digest|request_bytes|sources/);
});
test('Original intake/link receipt authority, source NOWAIT, independent export scope',()=>{
 assert.match(sql,/assistant_travel_current_basis_v1/);assert.match(sql,/assistant_goal_trip_receipts/);
 assert.match(sql,/after_goal_scope_version=l\.goal_scope_version/);assert.match(sql,/session_id=r\.session_id for share nowait/);
 assert.match(sql,/intake_revision=\(select max\(i2\.intake_revision\)/);
 assert.match(sql,/source_changed before insert or update or delete/);assert.match(sql,/exception when lock_not_available then raise exception 'BRIEF_BUSY'/);
 assert.match(sql,/'schemaVersion','traveler-brief-data\/1'/);assert.match(sql,/'sourceValues','not_copied','attachments','unavailable'/);
 assert.match(sql,/'corePackageEnrollment','not_enrolled','allUserDataCompleted',false/);
 assert.match(sql,/interval '30 seconds'/);assert.match(sql,/n>10000/);assert.match(sql,/>524288/);
});
