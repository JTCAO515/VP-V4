import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {nativeDatabase} from './native-db.mjs';
import {fixturePorts} from './fixture.mjs';
import {produceTripCandidate} from './producer-fixture.mjs';
// Real wall-clock expiry of the original immutable 9-minute source/Proposal.
// Kept separate so Main can schedule this long relevant check explicitly.
test('original immutable Proposal reaches real expiry and releases without Trip settlement',{skip:process.env.VP_TRIP_EXPIRY_TEST!=='1',timeout:620000},async t=>{
 const {db,upgrade}=await nativeDatabase(t);await db('begin;'+upgrade+'commit;');const f=fixturePorts(db);await db('update turn_private.service_task_capacity_settings set trip_enabled=true,enabled=true');
 const {a,task,proposal}=await produceTripCandidate(f,db,{cancel:false,proposal:true});const until=Date.parse(proposal.expiresAt)+100-Date.now();assert.ok(until>0&&until<550000);
 console.log('REAL_PROPOSAL_EXPIRY_WAIT',proposal.expiresAt,'private PostgreSQL only; no clock/trigger mutation');
 await new Promise(r=>setTimeout(r,until));
 assert.equal(await f.call(a,'confirm_and_apply_trip_proposal',[proposal.proposalId,uuid(),proposal.proposalDigest]),'(proposal_expired,)');
 assert.equal((await db(`select head_version from public.trips where id='${a.trip}'`))[0].head_version,0);
 assert.equal((await db(`select state from turn_private.service_task_capacity where task_id='${task.taskId}'`))[0].state,'released');
 assert.equal((await db(`select actual_micros::text cost from public.model_budget_attempts where task_id='${task.taskId}'`))[0].cost,'15');
});
