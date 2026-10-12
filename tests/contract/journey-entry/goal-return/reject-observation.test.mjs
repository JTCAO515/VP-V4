import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,writeFileSync,symlinkSync,unlinkSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {classifyReject,validReject,writeReject,readReject} from '../../../../tests/integration/journey-entry/goal-return/reject-observation.mjs';
import {network,project,nonce} from '../../../../tests/integration/journey-entry/goal-return/scope.mjs';
test('closed observation exposes enums/booleans only, never synthetic secrets or unknown values',()=>{
 const secret='eyJsynthetic.secret-PRIVATE.VALUE',args=['run','--rm','--network',network,'--label','com.supabase.cli.project='+project,'--label','com.docker.compose.project='+project,'-e','SECRET='+secret,'public.ecr.aws/supabase/realtime:synthetic-tag','raw private command'];
 const r=classifyReject(args,Error('E3_DOCKER_OPERATION_DENIED'));assert.ok(validReject(r));assert.equal(r.imageClass,'realtime_unleased');assert.equal(r.ownNetwork,true);assert.equal(r.ownProjectLabels,true);
 for(const forbidden of [secret,'synthetic-tag','raw private command',network,project])assert.ok(!JSON.stringify(r).includes(forbidden));
 assert.equal(classifyReject(['pull',secret],Error(secret)).reason,'ADAPTER_UNAVAILABLE');
 assert.equal(classifyReject(['image','pull',secret],Error(secret)).operationClass,'image_pull');assert.equal(classifyReject(['other',secret],Error(secret)).imageClass,'unclassified');
 assert.equal(validReject({...r,raw:secret}),false);assert.equal(validReject({...r,ownNetwork:secret}),false);
});
test('fixed file is exclusive0600, symlinks/oversize/schema denied, absent is unavailable',()=>{
 const directory=realpathSync(mkdtempSync(join(tmpdir(),nonce+'-observation-test-'))),p=join(directory,'reject-observation.json');
 try{const r=classifyReject(['compose'],Error('E3_DOCKER_OPERATION_DENIED'));assert.equal(readReject(directory),null);assert.equal(writeReject(directory,r),true);assert.equal(statSync(p).mode&0o777,0o600);
  assert.equal(writeReject(directory,r),false);assert.deepEqual(readReject(directory),r);unlinkSync(p);
  const other=join(directory,'other');writeFileSync(other,'PRIVATE',{mode:0o600});symlinkSync(other,p);assert.equal(writeReject(directory,r),false);assert.throws(()=>readReject(directory));unlinkSync(p);
  writeFileSync(p,'x'.repeat(4097),{mode:0o600});assert.throws(()=>readReject(directory));unlinkSync(p);
  writeFileSync(p,JSON.stringify({...r,raw:'PRIVATE'}),{mode:0o600});assert.throws(()=>readReject(directory));
 }finally{rmSync(directory,{recursive:true});}
});
