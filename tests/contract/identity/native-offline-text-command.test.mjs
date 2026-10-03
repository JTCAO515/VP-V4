import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOfflineTextCommand } from '../../../lib/server/today/offline-text-command.ts';
const value={operationId:'614b8576-e9e7-49aa-aa66-94eac6ba6544',expectedHeadVersion:0,date:'2026-10-04',title:'我明确提交的新安排',saveOffline:true};
test('explicit input normalizes title once using the existing Trip trim then160 rule',()=>{
  const result=parseOfflineTextCommand({...value,title:'  新安排 \n'});
  assert.deepEqual(result,{...value,title:'新安排'});
  assert.ok(Object.isFrozen(result));
});
test('actor, patch, author, licence and receipt claims cannot enter the controlled command',()=>{
  for(const key of ['owner','sourceKind','author','license','receiptId','patch','fieldId','cacheRights'])assert.equal(parseOfflineTextCommand({...value,[key]:'caller-claim'}),null);
  for(const saveOffline of [false,'true',1,null,undefined])assert.equal(parseOfflineTextCommand({...value,saveOffline}),null);
});
test('invalid dates, operation identity, base version and text fail before any writer',()=>{
  for(const date of ['2026-02-30','2026-2-03',null,' 2026-10-04'])assert.equal(parseOfflineTextCommand({...value,date}),null);
  for(const operationId of ['', 'not-uuid'])assert.equal(parseOfflineTextCommand({...value,operationId}),null);
  for(const expectedHeadVersion of [-1,1.5,'1',Number.MAX_SAFE_INTEGER+1])assert.equal(parseOfflineTextCommand({...value,expectedHeadVersion}),null);
  for(const title of ['', ' \n','x'.repeat(161),' '.repeat(2049)+'a','\ud800',null])assert.equal(parseOfflineTextCommand({...value,title}),null);
});
