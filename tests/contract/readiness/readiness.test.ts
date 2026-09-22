import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { evaluateReadiness } from '../../../lib/server/readiness/index.ts';
import { parseReadinessInput, timestamp, type ReadinessInput } from '../../../lib/server/readiness/contract.ts';
import { readReadiness } from '../../../lib/server/readiness/service.ts';

const now = new Date('2026-09-22T04:00:00.000Z');
const input: ReadinessInput = { taskId:'11111111-1111-4111-8111-111111111111', tripVersion:1, city:'shanghai', locale:'en', applies:'yes', documentReady:'unknown', conditionsChecked:'yes', checkAt:'now' };
const trip = { id:'22222222-2222-4222-8222-222222222222', headVersion:1, dates:[] };
const id = '33333333-3333-4333-8333-333333333333';
// Editorial content is a fixture, never a claim that this publication exists on Staging.
const batch = JSON.parse(readFileSync('docs/knowledge-base/batches/2026-09-12-first-party/statements.json','utf8'));
const candidates = batch.records;
const statement = candidates.find((v: { editorialId: string }) => v.editorialId === 'SIM-01').statement;
function evidence(locale: 'en'|'zh' = 'en') {
 return { schemaVersion:'knowledge-answer/1', evaluatedAt:now.toISOString(), scope:{city:'shanghai',scene:'connectivity',locale}, purpose:'trip_planning',recipient:'first_party',territory:'CN-mainland',status:'available',
  answer:{questionId:'connectivity_sim_documents',questionVersion:1,outcome:'answered',claims:[{id:statement.assertion.objectId,status:'covered',factIds:[id],reasons:[]}]},
  statements:[{factId:id,version:1,assertionId:id,assertionRevision:1,assertion:structuredClone(statement.assertion),...statement.expressions[locale],reviewedAt:'2026-09-21T04:00:00+00:00',publishedAt:'2026-09-21T05:00:00+00:00',expiresAt:'2026-09-23T04:00:00+00:00',sources:[{sourceRevisionId:id,...statement.sources[0]}]}] };
}
for (const locale of ['en','zh'] as const) test(`${locale}: same evidence distinguishes five states and one scoped next step`, () => {
 const cases = [
  [{},'unknown','now','check_document'],
  [{documentReady:'yes'},'satisfied','now','none'],
  [{documentReady:'no'},'not_satisfied','now','prepare_document'],
  [{applies:'no'},'not_applicable','not_applicable','none'],
  [{documentReady:'no',checkAt:'2026-09-23T04:00:00Z'},'not_satisfied','not_yet','return_at_time'],
 ] as const;
 for (const [delta,state,timing,step] of cases) {
  const result = evaluateReadiness({...input,...delta,locale},trip,evidence(locale),now);
  assert.equal(result.userReadiness,state); assert.equal(result.actionTiming,timing); assert.equal(result.nextStep.kind,step);
  assert.equal(result.knowledgeAvailability,'available'); assert.equal(result.taskId,input.taskId); assert.equal(result.tripId,trip.id);
  assert.equal(result.evidence[0].assertionRevision,1); assert.equal(result.ruleVersion,'sim-documents/1'); assert.match(result.nextStep.text, locale === 'zh' ? /[\u4e00-\u9fff]/ : /[a-z]/i);
 }
});
test('unknown applicability/conditions/time stay unknown and generate their own next step', () => {
 assert.equal(evaluateReadiness({...input,applies:'unknown'},trip,evidence(),now).nextStep.kind,'clarify_applicability');
 assert.equal(evaluateReadiness({...input,documentReady:'yes',conditionsChecked:'unknown'},trip,evidence(),now).userReadiness,'unknown');
 assert.equal(evaluateReadiness({...input,checkAt:'unknown'},trip,evidence(),now).nextStep.kind,'choose_time');
});
test('expired/revoked/missing evidence never reuses an earlier satisfied declaration', () => {
 for (const raw of [null,{...evidence(),status:'no_eligible_content',statements:[]},evidence()]) {
  if(raw?.statements.length) raw.statements[0].expiresAt=now.toISOString();
  const result=evaluateReadiness({...input,documentReady:'yes'},trip,raw,now);
  assert.equal(result.userReadiness,'unknown');assert.equal(result.knowledgeAvailability,'unknown');assert.equal(result.nextStep.kind,'verify_evidence');assert.deepEqual(result.evidence,[]);
 }
});
test('unsupported conditions, variants, wrong subject and wrong locale fail closed', () => {
 const mutations = [
  (v:ReturnType<typeof evidence>)=>{v.statements[0].assertion.subjectId='other_subject';},
  (v:ReturnType<typeof evidence>)=>{v.statements[0].assertion.conditions.push('new_condition');},
  (v:ReturnType<typeof evidence>)=>{v.answer.claims[0].status='unresolved_variants';},
  (v:ReturnType<typeof evidence>)=>{v.scope.locale='zh';},
  (v:ReturnType<typeof evidence>)=>{v.statements[0].sources[0].uri='javascript:alert(1)';},
  (v:ReturnType<typeof evidence>)=>{v.statements[0].assertionRevision=2;},
 ];
 for(const mutate of mutations){const v=evidence();mutate(v);assert.equal(evaluateReadiness(input,trip,v,now).knowledgeAvailability,'unknown');}
});
test('lease is bounded by original evaluation and expiry, including SQL offset timestamps', () => {
 const v=evidence();v.evaluatedAt='2026-09-22T03:59:40+00:00';
 assert.equal(evaluateReadiness(input,trip,v,now).expiresAt,'2026-09-22T04:00:10.000Z');
 v.evaluatedAt='2026-09-22T03:59:30Z';assert.equal(evaluateReadiness(input,trip,v,now).knowledgeAvailability,'unknown');
});
test('date basis changes and old Trip version is rejected', () => {
 const next={...trip,headVersion:2,dates:[{date:'2026-09-24',timeZone:'Asia/Shanghai'}]};
 assert.throws(()=>evaluateReadiness(input,next,evidence(),now),/STALE_TRIP_VERSION/);
 assert.notEqual(evaluateReadiness(input,trip,evidence(),now).dateBasis,evaluateReadiness({...input,tripVersion:2},next,evidence(),now).dateBasis);
});
test('fresh service reads revalidate owner and Trip version after evidence; no writer exists', async () => {
 let reads=0,evidenceReads=0;
 const result=await readReadiness(input,async()=>{reads++;return trip;},async()=>{evidenceReads++;return evidence();},()=>now);
 assert.equal(result.userReadiness,'unknown');assert.equal(reads,2);assert.equal(evidenceReads,1);
 let count=0;
 await assert.rejects(readReadiness(input,async()=>++count===1?trip:{...trip,headVersion:2},async()=>evidence(),()=>now),/STALE_TRIP_VERSION/);
 count=0;
 await assert.rejects(readReadiness(input,async()=>++count===1?trip:null,async()=>evidence(),()=>now),/FORBIDDEN/);
});
test('closed request rejects guessed flags, unknown properties, unzoned or impossible dates', () => {
 assert.deepEqual(parseReadinessInput(input),input);
 assert.equal(parseReadinessInput({...input,tripVersion:0})?.tripVersion,0);
 for(const delta of [{applies:false},{applies:['yes']},{locale:['zh']},{owner:'attacker'},{tripVersion:-1},{checkAt:'2026-02-30T00:00:00Z'},{checkAt:'2026-09-22T04:00:00'},{documentReady:'done'}]) assert.equal(parseReadinessInput({...input,...delta}),null);
 assert.equal(timestamp('2026-09-22T12:00:00+08:00'),now.getTime());
});
