import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {nativeHTTPPortObservation,assertNativeHTTPPortsFree} from '../../integration/turn/native-http-ports.mjs';

const row=(port,state,address='0100007F')=>` 0: ${address}:${port.toString(16).toUpperCase().padStart(4,'0')} 12345678:FFFF ${state} RAW_SECRET_PID_CMDLINE`;
const read=path=>path.endsWith('ip_local_port_range')?'32768 60999\n':path.endsWith('tcp')?
  'header\n'+row(59640,'06')+'\n'+row(59640,'01')+'\n'+row(59641,'0A'):
  'header\n'+row(59640,'0A','00000000000000000000000000000000');
test('observation separates TIME_WAIT, connections and listeners only for the selected port',()=>{
  const info=nativeHTTPPortObservation(59640,{platform:'linux',read});
  assert.deepEqual(info.ephemeralRange,[32768,60999]);assert.equal(info.inEphemeralRange,true);
  assert.deepEqual(info.tcpStates,{TIME_WAIT:1,ESTABLISHED:1,LISTEN:1});assert.equal(info.tcpTablesRead,2);
  assert.doesNotMatch(JSON.stringify(info),/RAW_SECRET|12345678|CMDLINE|PID|0100007F/);
  assert.equal(nativeHTTPPortObservation(64440,{platform:'linux',read}).inEphemeralRange,false);
});
test('missing, malformed and unsupported proc observations never become a free-port verdict',()=>{
  const unavailable=nativeHTTPPortObservation(64440,{platform:'darwin',read:()=>{throw Error('must not read');}});
  assert.equal(unavailable.source,'unavailable');assert.equal(unavailable.inEphemeralRange,null);
  const denied=nativeHTTPPortObservation(64440,{platform:'linux',read:()=>{throw Error('SECRET_PATH');}});
  assert.equal(denied.source,'unavailable');assert.doesNotMatch(JSON.stringify(denied),/SECRET_PATH/);
  const malformed=nativeHTTPPortObservation(64440,{platform:'linux',read:()=> 'malformed\n'});
  assert.equal(malformed.ephemeralRange,null);assert.deepEqual(malformed.tcpStates,{});
});
test('hard bind failure retains exact phase/port/errno and does not close the occupied owned socket',async()=>{
  const server=net.createServer();await new Promise((ok,fail)=>{server.once('error',fail);server.listen(64440,'127.0.0.1',ok);});
  try {
    await assert.rejects(()=>assertNativeHTTPPortsFree({ports:[64440]}),error=>{
      assert.match(error.message,/Disposable test port unavailable/);
      const diagnostic=JSON.parse(error.message.split('; ')[1]);
      assert.equal(diagnostic.phase,'port-preflight');assert.equal(diagnostic.port,64440);
      assert.equal(diagnostic.code,'EADDRINUSE');return true;
    });
    assert.ok(server.listening,'no foreign cleanup is attempted');
  } finally {await new Promise(ok=>server.close(ok));}
  await assertNativeHTTPPortsFree({ports:[64440]});
});
