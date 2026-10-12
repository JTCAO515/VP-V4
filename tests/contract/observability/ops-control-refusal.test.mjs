import test from 'node:test';import assert from 'node:assert/strict';
import {decodeOpsRefusal,decodeOpsPause,opsRefusalCode} from '../../../lib/server/observability/ops-control/refusal.ts';
test('operational refusal does not classify arbitrary errors or manufacture release evidence',()=>{
 assert.equal(decodeOpsRefusal({kind:'blocked',code:'OPS_CONTROL_DISABLED'}),'OPS_CONTROL_DISABLED');
 assert.equal(decodeOpsRefusal({kind:'disabled',code:'OPS_SCOPE_UNAVAILABLE'}),'OPS_SCOPE_UNAVAILABLE');
 for(const value of [{kind:'authorized',code:'OPS_CONTROL_DISABLED'},{kind:'disabled',code:'OPS_CONTROL_DISABLED',owner:'another'},{kind:'blocked',code:'DATA_POLICY_BLOCKED'},'OPS_CONTROL_DISABLED'])assert.equal(decodeOpsRefusal(value),null);
 assert.equal(opsRefusalCode('SQL detail OPS_CONTROL_DISABLED'),null);assert.equal(opsRefusalCode(new Error('DATA_POLICY_BLOCKED')),null);
});
test('paused operation requires explicit pending-or-unsent accounting and the exact closed shape',()=>{
 assert.deepEqual(decodeOpsPause({kind:'ops_paused',code:'OPS_CONTROL_DISABLED',accounting:'pending'}),{kind:'ops_paused',code:'OPS_CONTROL_DISABLED',accounting:'pending'});
 for(const value of [{kind:'ops_paused',code:'OPS_CONTROL_DISABLED',accounting:'settled'},{kind:'ops_paused',code:'OPS_SCOPE_UNAVAILABLE'},{kind:'ops_paused',code:'OPS_CONTROL_DISABLED',accounting:'not_dispatched',refund:true}])assert.equal(decodeOpsPause(value),null);
});
