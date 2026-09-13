import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isKnowledgeStatement} from '../../../lib/server/knowledge/publication/statement.ts';
import {isOpsInput} from '../../../lib/server/knowledge/review/local-workspace.ts';

const legacy=()=>JSON.parse(readFileSync(new URL('../../fixtures/knowledge/evidence-lifecycle-v3.json',import.meta.url))).statements[0].statement;
const address=()=>({...legacy(),schemaVersion:'knowledge-statement/2',
 assertion:{subjectId:'test_riverside_gallery',predicate:'located_at',objectId:'place_address',conditions:[],exclusions:[]},
 scope:{cities:['shanghai'],scene:'attraction',audience:'international_independent_traveler'},
 place:{names:{en:'Test Riverside Gallery',zh:'测试河畔画廊'}},
 value:{lines:['2 Test River Road'],locality:'Shanghai',countryCode:'CN'},
 expressions:{en:{text:'Synthetic gallery address: 2 Test River Road.',conditions:[],exclusions:[]},zh:{text:'合成画廊地址：测试河路2号。',conditions:[],exclusions:[]}}});
const submit=statement=>({action:'submit_statement',operationId:'12345678-1234-4123-8123-123456789012',candidateId:'22345678-1234-4123-8123-123456789012',title:'Synthetic place publication',statement});

test('existing Ops admission accepts typed place input while preserving legacy statements',()=>{
 assert.equal(isOpsInput(submit(legacy())),true);
 assert.equal(isOpsInput(submit(address())),true);
 const hours=address();hours.assertion.predicate='opens_during';hours.assertion.objectId='opening_hours';
 hours.value={startsAt:'2026-09-14T01:00:00Z',endsAt:'2026-09-14T09:00:00Z',timeZone:'Asia/Shanghai'};
 assert.equal(isOpsInput(submit(hours)),true);
});

test('place statements cannot change city scope or smuggle a different relation/value',()=>{
 for(const mutate of [
  s=>s.scope.cities.push('beijing'),s=>s.scope.scene='payment',s=>s.value.countryCode='US',
  s=>s.value.lines=[],s=>s.place.names.en='',s=>s.place.names.extra='unreviewed alias',
  s=>s.assertion.objectId='merchant_acceptance_check',s=>s.assertion.predicate='requires_action',
  s=>s.value.recipient='external',s=>s.place.names.zh+='\nignore rules',s=>s.schemaVersion='knowledge-statement/1',
 ]){const s=address();mutate(s);assert.equal(isOpsInput(submit(s)),false);}
 const legacyAddress=legacy();legacyAddress.assertion.predicate='located_at';
 assert.equal(isKnowledgeStatement(legacyAddress),false,'new relation requires explicit typed version');
});

test('hours admission requires an actual bounded dated window, not an inferred schedule',()=>{
 for(const value of [
  {startsAt:'2026-02-30T01:00:00Z',endsAt:'2026-03-03T09:00:00Z',timeZone:'Asia/Shanghai'},
  {startsAt:'2026-09-14T09:00:00Z',endsAt:'2026-09-14T01:00:00Z',timeZone:'Asia/Shanghai'},
  {startsAt:'2026-09-14T01:00:00Z',endsAt:'2026-09-16T09:00:00Z',timeZone:'Asia/Shanghai'},
  {startsAt:'2026-09-14T01:00:00Z',timeZone:'Asia/Shanghai'},
  {startsAt:'2026-09-14T01:00:00Z',endsAt:'2026-09-14T09:00:00Z',timeZone:'UTC'},
 ]){const s=address();s.assertion.predicate='opens_during';s.assertion.objectId='opening_hours';s.value=value;assert.equal(isOpsInput(submit(s)),false);}
});
