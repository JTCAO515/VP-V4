import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261005080000_place_guide.sql','utf8');
const section=(from,to)=>sql.slice(sql.indexOf(from),sql.indexOf(to,sql.indexOf(from)+from.length));
test('Guide append has no activation, identity override, second task queue or Trip writer',()=>{
 const executable=sql.replace(/--[^\n]*/g,'');
 assert.doesNotMatch(executable,/\bgrant\b|\bcreate\s+role\b|set_config|request\.jwt|\bcreate\s+policy\b/i);
 assert.doesNotMatch(executable,/\b(?:insert into|update|delete from)\s+(?:public\.(?:trips|trip_proposals|trip_events|model_budget_attempts)|turn_private\.(?:work|service_tasks))\b/i);
 assert.match(executable,/submitted:=public\.submit_grounded_turn\(/);
});
test('retained Guide owner state contains metadata only and marked tombstones survive source deletion',()=>{
 const progress=section('create table guide_private.progress_v1(', 'create function guide_private.mapping_v1');
 assert.doesNotMatch(progress,/input_text|source_body|snippet|caption|question|payload|audio|bytea/);
 const binding=section('create table guide_private.bindings_v1(', 'create index guide_bindings_trip');
 assert.match(binding,/references turn_private\.text_content\(turn_id\) on delete cascade deferrable initially deferred/);
 assert.doesNotMatch(binding,/references (?:public\.(?:trips|trip_place_references)|auth\.sessions)/);
 assert.match(sql,/revoke all on all tables in schema guide_private from public,anon,authenticated,service_role/);
});
test('all actual grounded execution and historical reads are guarded, without replacing original admission',()=>{
 const seams=section('-- Surgical append-only', '-- Source and capability');
 for(const name of ['read_grounded_work','authorize_grounded_dispatch','complete_grounded_work_with_needs','complete_grounded_place_work','complete_selected_grounded_work','read_grounded_turn'])assert.ok(seams.includes(name),name);
 assert.doesNotMatch(seams,/submit_grounded_turn|start_text_turn|enqueue_turn_work/);
 assert.match(seams,/pg_get_functiondef/);
 assert.match(seams,/guide_private\.bound_v1/);
 assert.match(seams,/guide_private\.answer_basis_v1/);
});
