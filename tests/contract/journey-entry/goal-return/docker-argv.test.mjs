import test from 'node:test';
import assert from 'node:assert/strict';
import {loopbackDockerArgv} from '../../../../tests/integration/journey-entry/goal-return/docker-argv.mjs';
import {project,network,imageIds} from '../../../../tests/integration/journey-entry/goal-return/scope.mjs';
const tags=Object.keys(imageIds),create=(role,image,publish=[])=>['create','--name','supabase_'+role+'_'+project,'--network',network,'-e','SYNTHETIC_SECRET=not-logged',...publish,image,'sh','-c','original -p command bytes'];
test('all four leased roles preserve nonbinding argv and accept implicit/wildcard/loopback TCP only',()=>{
 for(const [role,tag,host,container] of [['db',tags[0],63842,5432],['kong',tags[3],63841,8000]])for(const binding of [`${host}:${container}`,`0.0.0.0:${host}:${container}`,`127.0.0.1:${host}:${container}/tcp`]){
  const input=create(role,tag,['-p',binding]),result=loopbackDockerArgv(input);const index=input.indexOf('-p')+1;
  assert.equal(result.args[index],`127.0.0.1:${host}:${container}`+(binding.endsWith('/tcp')?'/tcp':''));
  input.forEach((v,i)=>{if(i!==index)assert.equal(result.args[i],v);});assert.equal(result.record[0].role,role);
 }
 for(const [role,tag] of [['auth',tags[1]],['rest',tags[2]]])assert.deepEqual(loopbackDockerArgv(create(role,tag)).args,create(role,tag));
 const equals=create('db',imageIds[tags[0]],['--publish=63842:5432']);assert.ok(loopbackDockerArgv(equals).args.includes('--publish=127.0.0.1:63842:5432'));
});
test('foreign namespace/image/network, alternate protocol/address/range, duplicates and ambiguous flags reject',()=>{
 const base=create('db',tags[0],['-p','63842:5432']);
 const bad=[base.map(v=>v==='supabase_db_'+project?'foreign':v),base.map(v=>v===tags[0]?'postgres:latest':v),base.map(v=>v===network?'bridge':v),
  ...['63841:5432','63842:5433','[::1]:63842:5432','63842-63843:5432','63842:5432/udp','63842:5432/tcp/udp','63842','01:63842:5432'].map(p=>create('db',tags[0],['-p',p])),
  create('db',tags[0],['-p','63842:5432','-p','63842:5432']),create('db',tags[0],['--name','supabase_db_'+project,'-p','63842:5432']),
  create('db',tags[0],['--network',network,'-p','63842:5432']),create('db',tags[0],['-P']),create('db',tags[0],['--publish-all']),
  create('db',tags[0],['--privileged','-p','63842:5432']),create('db',tags[0]),create('auth',tags[1],['-p','63842:5432']),['run','--rm',tags[0]],['compose','up']];
 for(const args of bad)assert.throws(()=>loopbackDockerArgv(args),/^Error: E3_DOCKER_/);
 assert.deepEqual(loopbackDockerArgv(['inspect','owned']).args,['inspect','owned']);
});
