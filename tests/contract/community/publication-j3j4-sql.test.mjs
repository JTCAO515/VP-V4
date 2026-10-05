import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261005092000_community_publication_j3j4.sql','utf8');
test('controlled publication is append-only no new grants policies target roles or caller admission copy',()=>{
 assert.match(sql,/enabled boolean not null default false/);
 assert.match(sql,/create table community_publication_private.qualifications/);
 assert.doesNotMatch(sql,/\bgrant\s|create role|create policy|set_config|current_setting/i);
 assert.doesNotMatch(sql,/create or replace function (?:community_private|community_safety_private)\./);
 assert.match(sql,/u:=community_private.actor_j1\(\)/);
 assert.match(sql,/community_publication_private.valid\(envelope->'command'\) is not true/);
 assert.match(sql,/revoke all on all functions in schema community_publication_private/);
});
test('terminal references retain only exact metadata and no search knowledge or Trip writer',()=>{
 const table=sql.slice(sql.indexOf('create table community_publication_private.references('),sql.indexOf('create table community_publication_private.rights_reviews('));
 assert.doesNotMatch(table,/\btitle\b|\bcontent\b|disclosure|jsonb/);
 assert.match(table,/submission_version/);assert.match(table,/safety_version/);assert.match(table,/publication_version/);
 assert.match(sql,/p.version=r.publication_version/);
 assert.match(sql,/new.state<>'erased' then raise exception 'PUBLICATION_CONFLICT'/);
 assert.doesNotMatch(sql,/(?:insert into|update|delete from) public\.(?:trips|trip_proposals|trip_patches|knowledge)/);
 assert.match(sql,/'publiclyVisible',false,'retrievalEligible',false/);
});
test('retained own notes grants and 101 sentinel export are explicit scoped exit',()=>{
 assert.match(sql,/'authoredRightsReviews'/);assert.match(sql,/'qualification'/);
 assert.equal((sql.match(/limit 101/g)||[]).length,5);
 assert.match(sql,/reference_json\(u,id,false\)/);
 assert.match(sql,/create trigger community_publication_account_erasure before delete on auth.users/);
 assert.match(sql,/delete from community_publication_private.rights_reviews where actor_id=u/);
 assert.match(sql,/delete from community_publication_private.qualifications where actor_id=u/);
 assert.match(sql,/'coverage','complete_for_community_publication'/);
});
