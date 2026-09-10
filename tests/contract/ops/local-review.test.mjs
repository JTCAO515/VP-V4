import test from 'node:test';
import assert from 'node:assert/strict';
import { isOpsInput, opsLocalConfig } from '../../../lib/server/knowledge/review/local-workspace.ts';
const base={OPS_LOCAL_REVIEW:'1',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:56621',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic-public-key'};
test('Ops local switch is fail closed and rejects remote or credential-bearing targets',()=>{
  assert.equal(opsLocalConfig({}),null);
  assert.ok(opsLocalConfig(base));
  for(const url of ['https://project.supabase.co','http://127.0.0.1.evil.example','http://user:password@localhost:56621','http://localhost:56621/path','http://localhost:56621?x=1','http://localhost:56621#x'])assert.equal(opsLocalConfig({...base,NEXT_PUBLIC_SUPABASE_URL:url}),null,url);
  assert.equal(opsLocalConfig({...base,OPS_LOCAL_REVIEW:'0'}),null);
});
test('Ops input rejects caller-selected authority, publication and invalid review versions',()=>{
  const candidate={action:'submit',operationId:'12345678-1234-4123-8123-123456789012',candidateId:'22345678-1234-4123-8123-123456789012',title:'Example',content:'Private candidate'};
  assert.ok(isOpsInput(candidate));
  for(const field of ['authorId','reviewerId','published','retrievalEligible'])assert.equal(isOpsInput({...candidate,[field]:true}),false);
  assert.equal(isOpsInput({...candidate,content:' '.repeat(4000)}),false);
  assert.equal(isOpsInput({...candidate,content:'a'.repeat(4001)}),false);
  const review={action:'review',operationId:candidate.operationId,candidateId:candidate.candidateId,expectedVersion:1,decision:'reviewed',note:'Reviewed independently'};
  assert.ok(isOpsInput(review));
  for(const value of [{...review,expectedVersion:2},{...review,decision:'published'},{...review,note:''},{...review,actorId:candidate.candidateId}])assert.equal(isOpsInput(value),false);
});

const {safeReturnTo}=await import('../../../lib/navigation/safe-return-to.ts');
test('Ops login returns only to the exact private review route',()=>{
 assert.equal(safeReturnTo('/ops/review'),'/ops/review');
 for(const value of ['/ops/review?actor=admin','/ops/review#secret','//evil.example/ops/review','https://evil.example/ops/review','/ops/review/other','/ops/%72eview','/ops\\review','/%2fops/review'])assert.equal(safeReturnTo(value),'/visepanda');
});
