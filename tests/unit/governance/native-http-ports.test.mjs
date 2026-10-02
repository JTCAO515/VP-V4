import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {nativeHTTPPorts,nativeHTTPOptions,nativeHTTPChildEnv,nativeHTTPEnvironmentPorts,
  nativeHTTPSupabaseConfig,assertNativeHTTPPortsFree} from '../../integration/turn/native-http-ports.mjs';

const source=readFileSync('supabase/config.toml','utf8');
test('default retains 59620; selected base consistently derives DB and native API env',()=>{
  const defaults=nativeHTTPOptions([]);assert.equal(defaults.ports.base,59620);
  assert.equal(defaults.ports.supabaseAPI,'http://127.0.0.1:59641');assert.equal(defaults.ports.apiPort,59651);
  for(const args of [['--planning','--port-base','62620'],['--port-base','62620','--planning']]){
    const selected=nativeHTTPOptions(args);assert.equal(selected.mode,'--planning');
    const env=nativeHTTPChildEnv(selected.ports,'/tmp/run-owned');
    assert.equal(env.VP_IDENTITY_SUPABASE_API_URL,'http://127.0.0.1:62641');
    assert.equal(env.VP_NATIVE_API_PORT,'62651');assert.deepEqual(nativeHTTPEnvironmentPorts(env),selected.ports);
  }
  assert.equal(nativeHTTPOptions([],{VP_NATIVE_HTTP_PORT_BASE:'62620'}).ports.base,62620);
});
test('malformed, remote, duplicate, conflicting and out of range options fail closed',()=>{
  for(const base of ['postgres://remote','http://127.0.0.1:62620','0','1023','65001','65535','62620x','62620.1','-62620','',null,NaN])assert.throws(()=>nativeHTTPPorts(base));
  for(const args of [['--port-base'],['--port-base','62620','--port-base','62720'],['--planning','--service'],['--remote'],['--port-base','62620','extra']])assert.throws(()=>nativeHTTPOptions(args));
  assert.throws(()=>nativeHTTPOptions(['--port-base','62620'],{VP_NATIVE_HTTP_PORT_BASE:'62720'}),/Conflicting/);
});
test('child helper rejects remote or inconsistent origins and ports before fixture mutation',()=>{
  const env=nativeHTTPChildEnv(nativeHTTPPorts(62620),'/tmp/run-owned');
  for(const patch of [{VP_IDENTITY_SUPABASE_API_URL:'https://remote.supabase.co'},
    {VP_IDENTITY_SUPABASE_API_URL:'http://127.0.0.1:59641'}, {VP_NATIVE_API_PORT:'59651'},
    {VP_NATIVE_API_PORT:'http://remote'}, {VP_NATIVE_HTTP_PORT_BASE:'0'}])assert.throws(()=>nativeHTTPEnvironmentPorts({...env,...patch}));
});
test('namespace and all Supabase config ports isolate without cascading replacements',()=>{
  const a=nativeHTTPSupabaseConfig(source,'vp-native-ask-a1234567',nativeHTTPPorts(62620));
  const b=nativeHTTPSupabaseConfig(source,'vp-native-ask-b1234567',nativeHTTPPorts(62720));
  assert.match(a,/project_id = "vp-native-ask-a1234567"/);assert.match(b,/project_id = "vp-native-ask-b1234567"/);
  for(const offset of [20,21,22,23,24,27,29]){
    assert.ok(a.includes(String(62620+offset)));assert.ok(b.includes(String(62720+offset)));
    assert.ok(!a.includes(String(62720+offset)));
  }
  const overlap=nativeHTTPSupabaseConfig(source,'vp-native-ask-a1234567',nativeHTTPPorts(54301));
  assert.match(overlap,/shadow_port = 54321/);assert.match(overlap,/\[api\][\s\S]*?port = 54322/);
  assert.match(overlap,/\[db\][\s\S]*?port = 54323/);
  assert.throws(()=>nativeHTTPSupabaseConfig(source,'existing-shared-project',nativeHTTPPorts()),/namespace/);
  assert.throws(()=>nativeHTTPSupabaseConfig(source.replace('54322','99999'),'vp-native-ask-a1234567',nativeHTTPPorts()),/configuration changed/);
});

async function bind(port){
  const server=net.createServer(socket=>socket.end('owned fixture'));
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',ok);});return server;
}
async function closeAll(servers){await Promise.all(servers.map(server=>new Promise(ok=>server.close(ok))));}
async function ownedRange(exclude=[]){
  for(let i=0;i<20;i++){
    const plan=nativeHTTPPorts(60000+Math.floor(Math.random()*40)*100);
    if(plan.ports.some(port=>exclude.includes(port)))continue;
    const servers=[];
    try{for(const port of plan.ports)servers.push(await bind(port));return {plan,servers};}
    catch(error){await closeAll(servers);if(error.code!=='EADDRINUSE')throw error;}
  }
  throw Error('No available disposable fixture port range (not skipped)');
}
test('two owned ranges remain independent; runner collision fails before Docker and leaves listeners intact',async()=>{
  const a=await ownedRange();let b;
  try{
    b=await ownedRange(a.plan.ports);
    assert.equal(new Set([...a.plan.ports,...b.plan.ports]).size,a.plan.ports.length+b.plan.ports.length);
    await assert.rejects(()=>assertNativeHTTPPortsFree(a.plan),/Disposable test port unavailable/);
    const collision=spawnSync(process.execPath,['tests/integration/turn/run-native-http.mjs','--planning','--port-base',String(a.plan.base)],
      {encoding:'utf8',env:{...process.env,VP_NATIVE_HTTP_PORT_BASE:String(a.plan.base)},timeout:10000});
    assert.notEqual(collision.status,0);assert.match(collision.stderr,/Disposable test port unavailable/);
    assert.doesNotMatch(collision.stdout,/VP_NATIVE_HTTP_TARGET|VP_NATIVE_HTTP_CLEANUP/);
    for(const server of [...a.servers,...b.servers])assert.ok(server.listening,'collision must not close another owner listener');
    await closeAll(a.servers);a.servers=[];
    await assertNativeHTTPPortsFree(a.plan);
    await assert.rejects(()=>assertNativeHTTPPortsFree(b.plan),/Disposable test port unavailable/,'A cleanup cannot release B');
    await closeAll(b.servers);b.servers=[];
    await assertNativeHTTPPortsFree(b.plan);
  }finally{await closeAll(a.servers);if(b)await closeAll(b.servers);}
});
