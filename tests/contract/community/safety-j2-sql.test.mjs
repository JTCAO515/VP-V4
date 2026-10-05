import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261005091000_community_safety_j2.sql','utf8');
test('append-only J2 default deny preserves public RPC ACL and no production authority enrollment',()=>{
 assert.doesNotMatch(sql,/\bgrant\s+(execute|usage|select|all)|create\s+role|insert into community_safety_private\.(moderators|controlled_readers)|update\s+community_safety_private\.settings\s+set\s+enabled\s*=\s*true/i);
 assert.match(sql,/create or replace function public\.community_workspace\(p_input jsonb\)/);assert.match(sql,/revoke all on all functions in schema community_safety_private/);
 assert.doesNotMatch(sql,/user_metadata|raw_user_meta_data|set_config|insert into public\.trip|public\.privacy_core_export|enable publication/i);
});
test('durable operation stores only identity generation digest and minimal fence; auth precedes cleanup',()=>{
 const table=sql.slice(sql.indexOf('create table community_safety_private.operations('),sql.indexOf('create table community_safety_private.audit('));
 assert.doesNotMatch(table,/mutation_bytes|input_bytes|\bcontent\b|\btitle\b|\bnote\b/);assert.match(table,/session_id uuid not null,session_epoch bigint not null/);
 const rpc=sql.slice(sql.indexOf('create function community_safety_private.workspace('));assert.ok(rpc.indexOf('u:=community_private.actor_j1()')<rpc.indexOf('perform community_safety_private.erase(u)'));
 assert.match(sql,/SAFETY_OPERATION_ABANDONED/);assert.match(sql,/receipt.session_id<>s or receipt.session_epoch<>epoch/);
});
test('full owned-data exit includes separately bounded own notes/grants and removes attribution without foreign body erasure',()=>{
 assert.match(sql,/'authoredDecisions'/);assert.match(sql,/'readerGrants'/);assert.match(sql,/'kind',case when action='disposition' then 'report' else 'appeal' end/);
 assert.match(sql,/delete from community_safety_private\.decisions where actor_id=u/);assert.match(sql,/delete from community_safety_private\.controlled_readers where actor_id=u/);
 assert.match(sql,/operator_fence/);assert.match(sql,/j1_operator_fence/);assert.match(sql,/SAFETY_CAPACITY/);
 assert.doesNotMatch(sql,/delete from community_private\.submissions|set title=|set content=/);assert.match(sql,/'operation_fences','record_tombstones','audit_metadata'/);
});
