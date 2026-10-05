import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261005090000_community_submission_j1.sql','utf8');
test('J1 append preserves RPC ACL and default-off trusted identity; no target activation',()=>{
 assert.doesNotMatch(sql,/\bgrant\s+(execute|usage|select|all)|create\s+role|update\s+community_private\.settings\s+set\s+enabled\s*=\s*true/i);
 assert.match(sql,/create or replace function public\.community_workspace\(p_input jsonb\)/);
 assert.match(sql,/revoke all on all functions in schema community_private/);
 assert.doesNotMatch(sql,/user_metadata|raw_user_meta_data|insert into community_private\.disclosures_j1/i);
 assert.match(sql,/'reviewerDisclosure'/);assert.match(sql,/'publiclyVisible',false,'retrievalEligible',false/);
});
test('operation inventory stores digest and generation only; legacy action is honest unknown',()=>{
 const table=sql.slice(sql.indexOf('create table community_private.operations_j1('),sql.indexOf('alter table community_private.disclosures_j1'));
 assert.doesNotMatch(table,/mutation_bytes|input_bytes|\bcontent\b|\btitle\b|\bnote\b/);
 assert.match(table,/session_id uuid not null,session_epoch bigint not null/);
 assert.match(sql,/'action','unknown'/);assert.match(sql,/COMMUNITY_OPERATION_ABANDONED/);
 assert.match(sql,/original->>'action'='review'.*COMMUNITY_SELF_REVIEW/);
});
test('cleanup authorizes first and independently preserves foreign body plus minimal tombstones',()=>{
 const body=sql.slice(sql.indexOf('create function community_private.workspace_j1('));
 assert.ok(body.indexOf('u:=community_private.actor_j1()')<body.indexOf('perform community_private.erase_j1(u)'));
 assert.match(sql,/update community_private\.submissions set reviewer_id=null,review_note=null,author_visible_note=null,review_anonymized=true where reviewer_id=u/);
 assert.match(sql,/'operation_fences','submission_tombstones','audit_metadata'/);
 assert.doesNotMatch(sql,/create or replace function public\.privacy_core_export|delete from public\.trip|insert into public\.trip_proposals/i);
});
