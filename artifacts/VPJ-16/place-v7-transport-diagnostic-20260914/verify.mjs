import fs from 'node:fs';import assert from 'node:assert/strict';
const read=n=>JSON.parse(fs.readFileSync(new URL(n,import.meta.url),'utf8'));
const d=read('diagnostic.json');assert.ok(d.finishedAt);assert.equal(d.status,'PASS');assert.equal(d.modelCalls,0);assert.equal(d.reads.length,4);assert.ok(d.requests.every(x=>x.phase==='done'&&x.status===200));
const b=read('before.json'),a=read('after-disable.json');assert.equal(a.state.attempts,406);assert.equal(a.state.attempts,b.state.attempts);assert.equal(a.state.unresolved,0);assert.equal(a.state.reader,false);assert.equal(a.state.ops,false);assert.equal(a.state.activeMembers,0);assert.equal(a.state.users,b.state.users);assert.equal(a.state.trips,b.state.trips);
for(const [table,hashes] of Object.entries(b.original)){const c=new Map();for(const h of a.original[table])c.set(h,(c.get(h)||0)+1);for(const h of hashes){assert.ok(c.get(h)>0);c.set(h,c.get(h)-1);}}
const f0=read('firewall-before.json').active,f1=read('firewall-remove-after.json').active;for(const k of ['ownerId','projectKey','ips','firewallEnabled','crs','rules'])assert.deepEqual(f1[k],f0[k]);assert.equal(read('firewall-remove-after.json').draft??null,null);
try{
 const {query}=await import('./transport.mjs');
 const sessions=JSON.parse(query("set role postgres;begin read only;select jsonb_agg(jsonb_build_object('ownerId',owner_id,'loggedOut',session_id is null) order by owner_id) from identity_private.mobile_accounts where owner_id in ('fe70fac7-d312-494c-bde1-4c37c3942722','7d063756-e5d8-4a6b-94a3-5134b0b04443');rollback;"));
 assert.equal(sessions.length,2);assert.ok(sessions.every(x=>x.loggedOut));
 const result={status:'PASS',at:new Date().toISOString(),modelCalls:0,normalReads:4,normalLogouts:2,ownedNativeSessionsClosed:true,originalRowsPreserved:true,permissionsClosed:true,attempts:406,unresolved:0,firewallVersion:f1.version,transportFailureReproduced:false,rootCause:'unknown'};
 fs.writeFileSync(new URL('verification.json',import.meta.url),JSON.stringify(result,null,2)+'\n',{mode:0o600,flag:'wx'});console.log(JSON.stringify(result));
}catch(e){console.log(JSON.stringify({status:'FAIL',errorType:e.name}));process.exitCode=1;}
