import test from 'node:test';
import assert from 'node:assert/strict';
import {journeysGoalIndexHTTPOptions} from '../../integration/turn/journeys-goal-index-options.mjs';

test('goal-index runner applies63820 only when both explicit sources are absent',()=>{
 assert.equal(journeysGoalIndexHTTPOptions([]).ports.base,63820);
 assert.equal(journeysGoalIndexHTTPOptions(['--port-base','64020']).ports.base,64020);
 assert.equal(journeysGoalIndexHTTPOptions([],{VP_NATIVE_HTTP_PORT_BASE:'64220'}).ports.base,64220);
 assert.equal(journeysGoalIndexHTTPOptions(['--port-base','64020'],{VP_NATIVE_HTTP_PORT_BASE:'64020'}).ports.base,64020);
 const env={};journeysGoalIndexHTTPOptions([],env);assert.deepEqual(env,{},'defaults do not mutate the caller environment');
});
test('goal-index parsing rejects actual source conflicts and invalid flags before preflight',()=>{
 assert.throws(()=>journeysGoalIndexHTTPOptions(['--port-base','64020'],{VP_NATIVE_HTTP_PORT_BASE:'63820'}),/Conflicting/);
 for(const args of [['--planning'],['--port-base'],['--port-base','64020','--port-base','64020'],['--port-base','70000']])assert.throws(()=>journeysGoalIndexHTTPOptions(args));
});
