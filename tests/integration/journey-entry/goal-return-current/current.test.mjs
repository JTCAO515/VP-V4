import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {command} from '../../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_TURN_DB_TEST==='1';
// Uses only a new network-none disposable container; never an external DB endpoint.
test('current QA goal-return append preserves source, ACL, lifecycle, scope and concurrency',{skip:!enabled,timeout:180000},async()=>{
 const name='ios001-goal-return-'+randomUUID(),out=mkdtempSync(join(tmpdir(),'ios001-e3-proof-'))+'/';let created=false;
 const env={...process.env,VP_GOAL_RETURN_CONTAINER:name,VP_GOAL_RETURN_OUTPUT:out};
 const run=async(file,arg)=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,[new URL(file,import.meta.url).pathname,...arg?[arg]:[]],{env,stdio:'inherit'});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(new Error(file+' exit '+code)));});
 try{
  const got=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',name,'--label','ios001.owner=goal-return-current','--label','ios001.nonce='+name,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/ios001-e3-socket;initdb -D /tmp/ios001-e3-data -U postgres -A trust --no-locale -E UTF8 >/tmp/ios001-e3-init.log 2>&1 && exec postgres -D /tmp/ios001-e3-data -c listen_addresses= -c unix_socket_directories=/tmp/ios001-e3-socket -c unix_socket_permissions=0700']);assert.equal(got.code,0,got.stderr);created=true;
  let ready=false;for(let n=0;n<100;n++){if((await command('docker',['exec',name,'pg_isready','-h','/tmp/ios001-e3-socket','-U','postgres'])).code===0){ready=true;break;}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
  await run('kernel.mjs','replay');await run('catalog.mjs');await run('proof.mjs');await run('lifecycle.mjs');await run('concurrency.mjs');
  for(const file of ['proof.json','lifecycle-proof.json','concurrency-proof.json']){const rows=JSON.parse(readFileSync(out+file));assert.ok(rows.length>0);for(const row of rows)assert.ok(row.result==='PASS'||(row.result==='UNRUN'&&row.label==='Missing owned head event rejects injection'),JSON.stringify(row));}
 }finally{if(created){const cleanup=await command('docker',['rm','-f',name]);assert.equal(cleanup.code,0,cleanup.stderr);}}
});
