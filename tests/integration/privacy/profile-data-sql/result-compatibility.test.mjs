import{ensureFixture}from'./fixture.mjs';
import test from'node:test';import assert from'node:assert/strict';import{db,container}from'./replay.mjs';
// Candidate-only actual PG evidence for Main's append review. Original Result
// namespace/typed/FK checks run unchanged. No Result migration file is edited.
test('Profile precise Result append preserves whole application and boundary guards',{skip:process.env.VP_PROFILE_DATA_SQL!=='1'},async t=>{
 await ensureFixture(t);
 assert.equal(await db('select conversation_data_private.schema_supported_v1() and profile_data_private.schema_v1() and result_data_private.schema_supported_v1()'),'t');
 await t.test('unknown application relation and inbound FK still rejected',async()=>{
  assert.equal(await db('begin;create table public.profile_unapproved_source(id uuid);select profile_data_private.schema_v1(),result_data_private.schema_supported_v1();rollback;'),'f|f');
  assert.equal(await db('begin;create schema storage;create table storage.profile_unapproved_fk(owner_id uuid references public.user_profiles(owner_id));select result_data_private.infrastructure_supported_v1(),result_data_private.schema_supported_v1();rollback;'),'f|f');
 });
 await t.test('original managed typed identities and application OID consumers still rejected',async()=>{
  assert.equal(await db('begin;create schema storage;create table storage.profile_unapproved_typed(artifact_id uuid);select result_data_private.infrastructure_supported_v1();rollback;'),'f');
  assert.equal(await db("begin;create schema realtime;create table realtime.profile_subscription(relation regclass);insert into realtime.profile_subscription values('public.user_profiles'::regclass);select result_data_private.infrastructure_supported_v1();rollback;"),'f');
 });
 await t.test('Profile private no-result-ref constraints reject typed object/field JSON, arbitrary title strings allowed',async()=>{
  assert.equal(await db("select profile_data_private.no_result_references_v1('{\"retainedCopies\":{\"artifactIds\":[\"00000000-0000-0000-0000-000000000001\"]}}'),profile_data_private.no_result_references_v1('{\"kind\":\"artifact_reference\",\"id\":\"00000000-0000-0000-0000-000000000001\"}'),profile_data_private.no_result_references_v1('{\"title\":\"artifactIds random label\"}')"),'f|f|t');
  const bad=await import('../../cost/fixtures/postgres-rpc.mjs').then(({sql})=>sql(container,"begin;insert into profile_data_private.proofs_v1(transaction_id,owner_id,mode,expected_row)values(pg_current_xact_id(),'00000000-0000-0000-0000-000000000001','executor','{\"artifactId\":\"00000000-0000-0000-0000-000000000002\"}');rollback;"));assert.notEqual(bad.code,0);assert.match(bad.stderr,/profile_proof_no_result_references/);
 });
});
