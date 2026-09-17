import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGING, API, requireTarget, migrationDiff, newJournal, validateJournal, marker, ownedUser, ownedTrip, denied, hidden, requestFactory, cleanupFixtures } from '../../../scripts/db/vpj-02-verification-core.mjs';

test('explicit staging target rejects absent, production and URL lookalikes', () => {
  assert.doesNotThrow(() => requireTarget(STAGING));
  for (const ref of [undefined, '', 'production', `${STAGING}.evil`, API]) assert.throws(() => requireTarget(ref));
});
test('migration comparison keeps pending, drift and unknown history distinct', () => {
  const files = ['20260101000000_one.sql','20260102000000_two.sql','20260103000000_three.sql'];
  const result = migrationDiff(files, [{version:'20260101000000',name:'one'}, {version:'20260102000000',name:'wrong'}, {version:'20260104000000',name:'remote'}]);
  assert.equal(result.matched,1); assert.equal(result.historical24Matched,false);
  assert.deepEqual(result.pending,[{version:'20260103000000',name:'three'}]);
  assert.deepEqual(result.nameDrift,['20260102000000']); assert.deepEqual(result.remoteOnly,['20260104000000']);
  assert.throws(() => migrationDiff(files,[{version:'x',name:'one'}]));
  assert.throws(() => migrationDiff(files,[{version:'20260101000000',name:'one'},{version:'20260101000000',name:'one'}]));
});
test('journal rejects duplicate IDs, SQL injection, mismatched email and wrong target', () => {
  const j = newJournal(); assert.equal(validateJournal(j),j);
  for (const mutate of [j=>j.trips[0]=j.users[0].id,j=>j.run="';delete",j=>j.users[0].email='someone@example.com',j=>j.project='wrong']) {
    const bad=structuredClone(j); mutate(bad); assert.throws(()=>validateJournal(bad));
  }
});
test('ownership requires exact id, owner, run marker and empty Trip version', () => {
  const j=newJournal(); const user={...j.users[0],user_metadata:{vpj02_run:j.run}};
  assert.equal(ownedUser(user,j,j.users[0]),true);
  assert.equal(ownedUser({...user,id:j.users[1].id},j,j.users[0]),false);
  const trip={id:j.trips[0],owner_id:j.users[0].id,title:marker(j),head_version:0};
  assert.equal(ownedTrip(trip,j),true);
  for (const patch of [{id:newJournal().trips[0]},{owner_id:newJournal().users[0].id},{title:'original data'},{head_version:1}]) assert.equal(ownedTrip({...trip,...patch},j),false);
});
test('denial checks reject network, server and schema failures', () => {
  assert.equal(denied({status:403,body:{code:'42501'}}),true);
  for(const r of [{status:500,body:{code:'42501'}},{status:403,body:{code:'unknown'}},{status:404,body:{code:'PGRST205'}},{status:200,body:[]}]) assert.equal(denied(r),false);
  assert.equal(hidden({status:200,body:[]}),true); assert.equal(hidden({status:200,body:[{id:'other'}]}),false);
});
test('HTTP requests pin origin, deny redirects, bound time and never return thrown secret details', async () => {
  const seen=[];
  const req=requestFactory({anon:'anon-test',service:'secret-test',fetchImpl:async(url,options)=>{seen.push({url,options});return new Response('[]',{status:200});}});
  await req('/rest/v1/trips?select=id'); await req('/auth/v1/user',{token:'jwt-test'});
  assert.equal(seen[0].url,`${API}/rest/v1/trips?select=id`); assert.equal(seen[0].options.redirect,'error'); assert.ok(seen[0].options.signal);
  assert.equal(seen[0].options.headers.Authorization,undefined); assert.equal(seen[1].options.headers.Authorization,'Bearer jwt-test');
  await assert.rejects(()=>req('https://evil.test'),/PATH_REJECTED/);
  const failing=requestFactory({anon:'anon',service:'secret',fetchImpl:async()=>{throw new Error('secret-test jwt-test');}});
  await assert.rejects(()=>failing('/auth/v1/user'),(e)=>e.message==='HTTP_REQUEST_FAILED'&&!e.stack.includes('secret-test'));
});
test('oversized HTTP response is rejected', async () => {
  const req=requestFactory({anon:'a',service:'s',fetchImpl:async()=>new Response('x'.repeat(1024*1024+1))});
  await assert.rejects(()=>req('/rest/v1/trips'),/HTTP_REQUEST_FAILED/);
});
function fixture() {
  const j=newJournal(); j.preflight=true; j.users.forEach(u=>u.attempted=true);
  j.baseline={auth_count:7,trip_count:3,auth_digest:'same',trip_digest:'same'};
  const after={...j.baseline,fixture_users:0,fixture_trips:0,fixture_sessions:0};
  const users=new Map(j.users.map(u=>[u.id,{id:u.id,email:u.email,user_metadata:{vpj02_run:j.run}}]));
  const trips=new Map([[j.trips[0],{id:j.trips[0],owner_id:j.users[0].id,title:marker(j),head_version:0}]]);
  const calls=[]; const report={};
  const request=async(path,options={})=>{
    calls.push({path,...options});
    const id=path.split('/').at(-1);
    if(path.startsWith('/auth/v1/admin/users/')) {
      if(options.method==='DELETE'){users.delete(id);return {status:200,body:{}};}
      return users.has(id)?{status:200,body:users.get(id)}:{status:404,body:{}};
    }
    if(path.startsWith('/auth/v1/logout'))return {status:204};
    const url=new URL(path,API); const selected=[...trips.values()].filter(t=>(!url.searchParams.has('id')||url.searchParams.get('id')===`eq.${t.id}`)&&url.searchParams.get('owner_id')===`eq.${t.owner_id}`);
    if(options.method==='DELETE') selected.forEach(t=>trips.delete(t.id));
    return {status:200,body:selected};
  };
  return {j,after,users,trips,calls,report,request,snapshot:()=>after,save:()=>{}};
}
test('recovery after unknown create acknowledgement removes only exact run objects',async()=>{
  const f=fixture(); await cleanupFixtures(f.j,f);
  assert.equal(f.users.size,0); assert.equal(f.trips.size,0); assert.equal(f.j.complete,true);
  assert.equal(f.report.cleanup.fixturesAbsent,'PASS');
  const deletes=f.calls.filter(c=>c.method==='DELETE'); assert.equal(deletes.length,3);
  assert.ok(deletes.filter(c=>c.path.startsWith('/rest')).every(c=>c.path.includes('id=eq.')&&c.path.includes('owner_id=eq.')));
});
test('normal cleanup signs out before deleting owned objects',async()=>{
  const f=fixture(); await cleanupFixtures(f.j,{...f,tokens:['a','b']});
  assert.ok(f.calls.findIndex(c=>c.path.includes('/logout'))<f.calls.findIndex(c=>c.method==='DELETE'));
});
test('cleanup rejects ownership drift but still cleans the independent second account',async()=>{
  const f=fixture(); f.users.get(f.j.users[0].id).email='different@example.com'; f.after.fixture_users=1;
  await assert.rejects(()=>cleanupFixtures(f.j,f));
  assert.equal(f.users.has(f.j.users[0].id),true); assert.equal(f.users.has(f.j.users[1].id),false);
  assert.equal(f.calls.some(c=>c.method==='DELETE'&&c.path.endsWith(f.j.users[0].id)),false);
});
test('cleanup never Auth-cascades an unrecorded Trip',async()=>{
  const f=fixture(); const id=newJournal().trips[0]; f.trips.set(id,{id,owner_id:f.j.users[0].id,title:'unexpected',head_version:0}); f.after.fixture_users=1;
  await assert.rejects(()=>cleanupFixtures(f.j,f));
  assert.equal(f.trips.has(id),true); assert.equal(f.users.has(f.j.users[0].id),true);
});
test('changed original rows and leftover sessions cannot yield PASS',async()=>{
  for(const patch of [{auth_digest:'changed'},{trip_digest:'changed'},{fixture_sessions:1}]) {
    const f=fixture();Object.assign(f.after,patch);await assert.rejects(()=>cleanupFixtures(f.j,f));assert.notEqual(f.j.complete,true);
  }
});
test('unarmed journal cannot delete anything',async()=>{
  const f=fixture(); f.j.preflight=false;await cleanupFixtures(f.j,f);assert.equal(f.calls.length,0);
});
