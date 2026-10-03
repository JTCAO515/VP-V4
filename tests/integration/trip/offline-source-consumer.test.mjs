// Actual isolated PG -> production TS consumer. SQL positives are administrator-only,
// ordinary claims simulated; API role negatives use real revoked ACLs. No Auth/grant fixture.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync,createHash,verify} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
import {parseOfflineProvenance,offlineTextError} from '../../../lib/server/today/offline-text-repository.ts';
import {productionOfflinePorts} from '../../../lib/server/today/offline-production.ts';
import {issueOfflineRead,offlineCanonical,offlineDigest} from '../../../lib/server/today/offline-read.ts';
const enabled=process.env.VP_TURN_DB_TEST==='1',container='vpj25-ts-consumer-'+randomUUID().slice(0,8);
const migration='20261003160000_vpj25_controlled_offline_text_provenance.sql';
let created=false;
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const literal=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const claims=a=>`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.subject}';set request.jwt.claims='${JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.sessionId})}';`;
const invocation=(a,name,p)=>claims(a)+'select to_jsonb(public.'+name+'('+Object.entries(p).map(([k,v])=>k+'=>'+literal(v)).join(',')+'));';
const call=async(a,name,p)=>JSON.parse(await db(invocation(a,name,p)));
before(async()=>{
  if(!enabled)return;
  const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
  assert.equal(r.code,0,r.stderr);created=true;
  for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
  await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
  await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
  const pinned=process.env.VP_OFFLINE_SQL_SOURCE;
  let source;
  if(pinned){assert.match(pinned,/^[0-9a-f]{40}$/);const out=await command('git',['show',`${pinned}:supabase/migrations/${migration}`]);assert.equal(out.code,0,out.stderr);source=out.stdout;}
  else source=readFileSync('supabase/migrations/'+migration,'utf8');
  for(const f of [...new Set([...readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')),migration])].sort())await db('begin;'+(f===migration?source:readFileSync('supabase/migrations/'+f,'utf8'))+'commit;');
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
async function owner(){
  const a={subject:randomUUID(),sessionId:randomUUID(),tripId:randomUUID()};
  await db(`insert into auth.users(id)values('${a.subject}');insert into auth.sessions(id,user_id)values('${a.sessionId}','${a.subject}');insert into identity_private.mobile_accounts(owner_id,epoch,session_id)values('${a.subject}',1,'${a.sessionId}');insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch)values('${a.subject}','${randomUUID()}','${a.sessionId}',1);${claims(a)}insert into public.trips(id,owner_id,title)values('${a.tripId}','${a.subject}','Synthetic local Trip');`);return a;
}
async function confirm(a,id){const p=await call(a,'read_trip_proposal_v2',{p_proposal_id:id});return call(a,'confirm_and_apply_trip_proposal',{p_proposal_id:id,p_idempotency_key:randomUUID(),p_digest:p.digest});}
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
run('immutable SQL qualified subset and field hashes interoperate with actual TS parser and signer',async()=>{
  const a=await owner();
  const old=await call(a,'create_trip_proposal_patch',{p_trip_id:a.tripId,p_patch:{expectedVersion:0,operations:[{kind:'upsert_day',dayId:'DAY_Upper-1',date:'2026-10-10'},{kind:'upsert_item',dayId:'DAY_Upper-1',itemId:'ITEM_Mixed-1',title:'Old online-only text'}]}});await confirm(a,old.proposal_id);
  const candidate=await call(a,'submit_offline_trip_text_proposal_v1',{p_trip_id:a.tripId,p_operation_id:randomUUID(),p_expected_head_version:1,p_date:'2026-10-11',p_title:'我的新输入 😀 "quote"\nline',p_save_offline:true});await confirm(a,candidate.proposalId);
  const readCurrent=async()=>{const snapshot=JSON.parse(await db(`${claims(a)}select content from public.trip_version_snapshots where trip_id='${a.tripId}' and version=2;`));return {subject:a.subject,sessionEpoch:1,tripId:a.tripId,headVersion:2,confirmed:true,active:true,payload:{days:snapshot.days.map(d=>({id:d.id,date:d.date,items:d.items.map(i=>({id:i.id,title:i.title}))}))}};};
  const basis=await readCurrent();
  const provenance=async b=>{const raw=await call(a,'read_offline_trip_text_provenance_v1',{p_trip_id:b.tripId,p_expected_head_version:b.headVersion,p_expected_epoch:b.sessionEpoch});const receipt=parseOfflineProvenance(raw,b);assert.ok(receipt,'actual SQL receipt must satisfy strict TS locator/hash/coverage decoder');return receipt;};
  const receipt=await provenance(basis);assert.equal(receipt.coverage.kind,'partial');
  const keys=generateKeyPairSync('ed25519'),der=keys.publicKey.export({format:'der',type:'spki'}),now=Date.now();
  const policy={version:'offline_read_policy/1',environment:'local',enabled:true,revoked:false,policyId:'isolated-local-fixture',policyRevision:1,fieldAllowlist:['days.date','days.items.title'],issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+60000).toISOString(),maxLeaseMs:60000};
  const signer={version:'offline_read_signer/1',environment:'local',algorithm:'Ed25519',keyId:'ed25519:'+createHash('sha256').update(der).digest('hex'),publicKeySpki:der.toString('base64url'),privateKeyPkcs8Pem:keys.privateKey.export({format:'pem',type:'pkcs8'})};
  const result=await issueOfflineRead(a.tripId,2,randomUUID(),productionOfflinePorts(readCurrent,'local',{readPolicy:()=>JSON.stringify(policy),readSigner:()=>JSON.stringify(signer)},provenance));
  assert.equal(result.kind,'offline_trip_read/1');assert.equal(result.coverage,'partial');assert.equal(result.generation,receipt.generation);assert.deepEqual(result.payload,receipt.qualifiedPayload);
  assert.equal(result.snapshotDigest,receipt.qualifiedPayloadDigest);assert.notEqual(result.snapshotDigest,offlineDigest(basis.payload));
  const {proof,...unsigned}=result;assert.equal(verify(null,Buffer.from(offlineCanonical(unsigned)),keys.publicKey,Buffer.from(proof.signature,'base64url')),true);
});
run('real authenticated EXECUTE denial remains unavailable in TS error mapping; no grants/Auth bypass',async()=>{
  const a=await owner();
  const calls=[['submit_offline_trip_text_proposal_v1',{p_trip_id:a.tripId,p_operation_id:randomUUID(),p_expected_head_version:0,p_date:'2026-10-11',p_title:'new text',p_save_offline:true}],['read_offline_trip_text_provenance_v1',{p_trip_id:a.tripId,p_expected_head_version:1,p_expected_epoch:1}],['revoke_offline_trip_text_provenance_v1',{p_trip_id:a.tripId,p_expected_epoch:1,p_operation_id:randomUUID()}]];
  for(const[name,params]of calls){const denied=await sql(container,'set role authenticated;'+invocation(a,name,params));assert.notEqual(denied.code,0);assert.match(denied.stderr,/permission denied for function/);assert.equal(offlineTextError(denied.stderr),'PROVIDER_UNAVAILABLE');}
});
