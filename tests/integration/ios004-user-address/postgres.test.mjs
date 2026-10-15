import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('IOS004 original authority, two readers, egress and lifecycle on owned PostgreSQL17',{
 skip:process.env.IOS004_NATIVE_PG!=='1',timeout:180000,
},()=>{
 const result=spawnSync(process.execPath,['tests/integration/ios004-user-address/replay.mjs'],{
  env:{...process.env,IOS004_APPLY:'1',IOS004_RESOURCE_TEST:'1'},encoding:'utf8',maxBuffer:1024*1024,
 });
 assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
 assert.match(result.stdout,/PASS actual Cookie \+ Native Bearer/);
 assert.match(result.stdout,/PASS original export projection/);
 assert.match(result.stdout,/PASS known-source drift rejection/);
});
