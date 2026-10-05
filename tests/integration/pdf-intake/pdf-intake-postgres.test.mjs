// Network-none disposable PG; synthetic owned Auth/session/claims, explicit
// fixture-only grant. This proves SQL behavior, not target Auth/enrollment.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_TURN_DB_TEST==='1';
const container='vpj55-pdf-'+randomUUID().slice(0,8);let created=false;
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
const json=v=>literal(JSON.stringify(v))+'::jsonb';
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const claims=a=>`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session})}';`;
const digest=v=>createHash('sha256').update(v).digest('hex');
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
const deny=async(q,re)=>{const r=await sql(container,q);assert.notEqual(r.code,0,'expected denial');assert.match(r.stderr,re);};
before(async()=>{
 if(!enabled)return;
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
 assert.equal(r.code,0,r.stderr);created=true;
 for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;grant usage on schema auth to authenticated;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
async function fixture(){
 const a={owner:randomUUID(),session:randomUUID(),trip:randomUUID(),epoch:1};
 await db(`insert into auth.users(id) values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');insert into identity_private.mobile_accounts(owner_id,epoch,session_id) values('${a.owner}',1,'${a.session}');insert into identity_private.mobile_attempts values('${a.owner}','${randomUUID()}','${a.session}',1);${claims(a)}insert into public.trips(id,owner_id,title) values('${a.trip}','${a.owner}','Synthetic PDF Trip');`);
 return a;
}
const cmd=(overrides={})=>({operationId:randomUUID(),expectedHeadVersion:0,contentHash:'a'.repeat(64),byteCount:12345,pageCount:2,extraction:'pdfkit_text',expiresAt:new Date(Date.now()+3600000).toISOString(),fields:[{kind:'date',value:'2026-10-08',locator:{page:1,line:3,sourceTextHash:'b'.repeat(64)}},{kind:'address',value:'广州·旅行 😀',locator:{page:2,line:9,sourceTextHash:'c'.repeat(64)}}],...overrides});
const callSQL=(a,action,input,raw=JSON.stringify(input))=>claims(a)+`set role authenticated;select public.pdf_intake_v1(${literal(action)},'${a.trip}',${literal(raw)},${a.epoch});`;
const call=async(a,action,input,raw)=>JSON.parse(await db(callSQL(a,action,input,raw)));
const preview=(a,c)=>call(a,'preview',c);
async function submit(a,c){const p=await preview(a,c);const input={command:c,reviewedPreviewDigest:p.previewDigest};const raw=JSON.stringify(input,null,2);return {p,c,input,raw,r:await call(a,'proposal',input,raw)};}
const operation=(a,id)=>call(a,'operation',{operationId:id});
const snap=async a=>JSON.parse(await db(claims(a)+`select public.trip_content_snapshot('${a.trip}',title) from public.trips where id='${a.trip}';`));
const confirmSQL=(a,p,id=randomUUID())=>claims(a)+`set role authenticated;select outcome from public.confirm_and_apply_trip_proposal('${p.proposalId}',${literal(id)},(select digest from public.read_trip_proposal_v2('${p.proposalId}')));`;

run('append replay, RLS and default deny before isolated enrollment',async()=>{
 assert.equal(await db("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='pdf_intake_private' and c.relkind='r' and not c.relrowsecurity;"),'0');
 assert.equal(await db("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join (values('anon'),('authenticated'),('service_role'))r(role) where (n.nspname='pdf_intake_private' or p.proname in('pdf_intake_v1','pdf_intake_export_v1')) and has_function_privilege(r.role,p.oid,'EXECUTE');"),'0');
 const a=await fixture();await deny(callSQL(a,'operation',{operationId:randomUUID()}),/permission denied/);
 await db('grant execute on function public.pdf_intake_v1(text,uuid,text,bigint) to authenticated;');
 assert.equal((await operation(a,randomUUID())).state,'absent');
});
run('canonical bytes Unicode arrays numeric forms and UTF16 bounds',async()=>{
 for(const v of [{z:'广州😀"\\/\u2028',a:[1,0,'é']},cmd(),[null,true,false,1.0,20]])assert.equal(await db(`select pdf_intake_private.canonical_v1(${json(v)});`),canonical(v));
 assert.equal(await db(`select pdf_intake_private.canonical_v1('1.000'::jsonb);`),'1');
 assert.equal(await db(`select pdf_intake_private.canonical_v1('-0.000'::jsonb);`),'0');
 const a=await fixture(),c=cmd();c.fields[1].value='😀'.repeat(48);assert.equal((await preview(a,c)).commandDigest,digest(canonical(c)));
 c.fields[1].value+='a';await deny(callSQL(a,'preview',c),/INVALID_INPUT/);
 for(const value of [' x','x\u00a0','x\n','\ufeffx']){c.fields[1].value=value;await deny(callSQL(a,'preview',c),/INVALID_INPUT/);}
});
run('durable original-byte idempotency, original explicit writer and historical receipt',async()=>{
 const a=await fixture(),c=cmd(),s=await submit(a,c);assert.equal(s.r.requestDigest,digest(s.raw));assert.equal(s.r.commandDigest,digest(canonical(c)));
 assert.deepEqual((await snap(a)).days,[]);assert.equal((await operation(a,c.operationId)).state,'pending');
 assert.equal((await call(a,'proposal',s.input,s.raw)).reused,true);
 await deny(callSQL(a,'proposal',s.input,JSON.stringify(s.input)),/IDEMPOTENCY_KEY_REUSE/);
 assert.equal(await db(confirmSQL(a,s.r)),'applied');const recovered=await operation(a,c.operationId);assert.equal(recovered.state,'confirmed');assert.equal(recovered.resultingVersion,1);assert.match(recovered.confirmationEventId,/^[0-9a-f-]{36}$/);
 assert.equal(await db(`select input_bytes is null and command is null from pdf_intake_private.operations_v1 where owner_id='${a.owner}';`),'t');
 const p=JSON.parse(await db(claims(a)+`select row_to_json(p) from public.create_trip_proposal_patch('${a.trip}',${json({expectedVersion:1,operations:[{kind:'set_title',title:'Later title'}]})})p;`));
 assert.equal(await db(confirmSQL(a,{proposalId:p.proposal_id})),'applied');assert.deepEqual(await operation(a,c.operationId),recovered);
 assert.equal((await call(a,'cancel',{operationId:c.operationId})).state,'confirmed');
});
run('preview parity, repeat duplicate, conflicts preserve existing fixed items and order',async()=>{
 const a=await fixture();await db(`insert into public.trip_days(trip_id,owner_id,day_id,trip_date,time_zone) values('${a.trip}','${a.owner}','d1','2026-10-08','Etc/UTC');insert into public.trip_items(trip_id,owner_id,day_id,item_id,title,starts_at,ends_at,manual_order) values('${a.trip}','${a.owner}','d1','z','Fixed reservation','2026-10-08T10:00:00Z','2026-10-08T11:00:00Z',0),('${a.trip}','${a.owner}','d1','a','Second',null,null,1);`);
 const before=await snap(a),c=cmd(),s=await submit(a,c);assert.equal(s.p.patch.operations.at(-1).kind,'reorder_items');
 assert.equal(await db(confirmSQL(a,s.r)),'applied');const first=await snap(a);assert.deepEqual(first.days[0].items.slice(0,2),before.days[0].items);
 const repeat={...c,operationId:randomUUID(),expectedHeadVersion:1};assert.equal((await preview(a,repeat)).relation,'duplicate');
 const conflict={...repeat,operationId:randomUUID(),fields:structuredClone(c.fields)};conflict.fields[1].value='Changed address';const cs=await submit(a,conflict);assert.equal(cs.p.relation,'conflict');assert.equal(await db(confirmSQL(a,cs.r)),'applied');
 const withoutSlot=items=>items.map(({manualOrder,...i})=>i);assert.deepEqual(withoutSlot((await snap(a)).days[0].items.slice(0,3)),withoutSlot(first.days[0].items));
});
run('owner epoch Trip head digest limits cancel tombstone and marker successor denial',async()=>{
 const a=await fixture(),b=await fixture(),c=cmd();const p=await preview(a,c);
 await deny(callSQL({...b,trip:a.trip},'preview',c),/FORBIDDEN/);await deny(callSQL({...a,epoch:2},'preview',c),/SESSION_REPLACED/);
 await deny(callSQL(a,'preview',{...c,expectedHeadVersion:1}),/STALE_TRIP_VERSION/);
 await deny(callSQL(a,'proposal',{command:c,reviewedPreviewDigest:'0'.repeat(64)}),/PDF_PREVIEW_MISMATCH/);
 for(const bad of [{...c,pageCount:11},{...c,byteCount:20000001},{...c,extra:true},{...c,fields:[c.fields[1]]}])await deny(callSQL(a,'preview',bad),/INVALID_INPUT/);
 assert.equal((await call(a,'cancel',{operationId:c.operationId})).state,'cancelled');await deny(callSQL(a,'proposal',{command:c,reviewedPreviewDigest:p.previewDigest}),/CANCELLED/);
 const s=await submit(a,cmd());await deny(claims(a)+`select * from public.revise_trip_proposal_patch('${s.r.proposalId}',${json(s.p.patch)});`,/PDF_SUCCESSOR_FORBIDDEN/);
 await deny(`update public.trip_proposals set expires_at=expires_at+interval '1 day' where id='${s.r.proposalId}';`,/PDF_PROPOSAL_IMMUTABLE/);
 assert.equal((await call(a,'cancel',{operationId:s.c.operationId})).state,'cancelled');assert.notEqual(await db(confirmSQL(a,s.r)),'applied');
});
