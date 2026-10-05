import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

test('Ops unchanged default-port preflight reports owned collision and exits before CLI/test startup',{timeout:15000},async()=>{
  // Own this exact default first port only for the negative. No port switching,
  // process discovery, Supabase startup, force cleanup or retry is performed.
  const occupied=net.createServer();
  await new Promise((resolve,reject)=>{occupied.once('error',reject);occupied.listen(56920,'127.0.0.1',resolve);});
  try {
    const env={...process.env,VP_OPS_TEST_PORT_BASE:'56900',VP_OPS_TEST_FILE:'tests/integration/ops/local-review.test.mjs'};
    delete env.VP_OPS_BEFORE_MIGRATION;
    const child=spawn(process.execPath,['tests/integration/ops/run-local.mjs'],{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';child.stdout.on('data',v=>{stdout+=v;});child.stderr.on('data',v=>{stderr+=v;});
    const [code,signal]=await once(child,'exit');assert.equal(code,1);assert.equal(signal,null);assert.equal(stdout,'');
    const observed=stderr.split('\n').find(line=>line.startsWith('Error: Disposable test port unavailable:'));
    assert.ok(observed,'real runner denied the bind');
    const diagnostic=JSON.parse(observed.slice(observed.indexOf('; ')+2));
    assert.deepEqual(Object.keys(diagnostic).sort(),['phase','port','code','source','tcpTablesRead','ephemeralRange','inEphemeralRange','tcpStates'].sort());
    assert.equal(diagnostic.phase,'port-preflight');assert.equal(diagnostic.port,56920);assert.equal(diagnostic.code,'EADDRINUSE');
    assert.ok(['linux-proc','unavailable'].includes(diagnostic.source));
    if(process.platform==='linux')assert.ok(diagnostic.tcpStates.LISTEN>=1,'actual owned LISTEN state was observed');
    assert.equal(occupied.listening,true,'the diagnostic never closes the existing listener');
  } finally {await new Promise(resolve=>occupied.close(resolve));}
});
