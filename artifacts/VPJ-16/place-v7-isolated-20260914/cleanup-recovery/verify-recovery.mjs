import fs from 'node:fs';import assert from 'node:assert/strict';
const r=new URL('./',import.meta.url),read=n=>JSON.parse(fs.readFileSync(new URL(n,r),'utf8'));
assert.ok(read('recovery.json').finishedAt);assert.equal(read('recovery.json').status,'PASS');
try{
const {query}=await import('./transport.mjs');
const ids=read('../scenario.json').statements.map(x=>x.candidateId);assert.ok(ids.every(x=>/^[0-9a-f-]{36}$/.test(x)));
const rows=JSON.parse(query(`set role postgres;begin read only;select jsonb_agg(jsonb_build_object('candidateId',candidate_id,'state',state,'version',version,'revokedAt',revoked_at,'preRevokeHash',md5((to_jsonb(p)||jsonb_build_object('state','published','version',1,'revoked_at',null))::text))) from knowledge_review_private.publications p where candidate_id in ('${ids.join("','")}');rollback;`));
assert.equal(rows.length,4);assert.ok(rows.every(x=>x.state==='revoked'&&x.version===2&&x.revokedAt));
const targets=rows.filter(x=>['9f2074cc-7d7b-4f78-8940-ad72083ace27','4ff2f6e9-7182-48f1-b843-8d24e021aa76'].includes(x.candidateId));
assert.deepEqual(targets.map(x=>x.preRevokeHash).sort(),read('before.json').allowedPublicationHashes.sort());
const a=read('after-disable.json');assert.equal(a.state.attempts,405);assert.equal(a.state.unresolved,0);assert.equal(a.state.reader,false);assert.equal(a.state.ops,false);assert.equal(a.state.activeMembers,0);
const f0=read('firewall-before.json').active,f1=read('firewall-remove-after.json').active;for(const k of ['ownerId','projectKey','ips','firewallEnabled','crs','rules'])assert.deepEqual(f1[k],f0[k]);assert.equal(read('firewall-remove-after.json').draft??null,null);
const result={at:new Date().toISOString(),status:'PASS',modelCalls:0,allFourRevoked:true,onlyRevokeFieldsChanged:true,publications:rows,permissionsClosed:true,unresolved:0,attempts:405,firewallRestoredVersion:f1.version,originalControllerStatus:'FAIL'};
fs.writeFileSync(new URL('verification.json',r),JSON.stringify(result,null,2)+'\n',{mode:0o600,flag:'wx'});console.log(JSON.stringify(result));
}catch(e){console.log(JSON.stringify({status:'FAIL',errorType:e.name}));process.exitCode=1;}
