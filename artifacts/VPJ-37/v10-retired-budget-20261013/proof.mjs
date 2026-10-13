// Owned, network-none PostgreSQL regression; SQL claims are not GoTrue evidence.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const out='artifacts/VPJ-37/v10-retired-budget-20261013/';
const migration='supabase/migrations/20261012103151_vpj37_ops_control_w2.sql';
const pinned='5e07bc1ce41f236c0fd29ece8f9f15525c9e234e78f9a7a25ab22751082babdf';
const image='public.ecr.aws/supabase/postgres@sha256:86a2e078779e5bdccda1f6f6c5063aa9779a322d1fface5fb408d051909b230f';
const owner=process.env.CODEX_THREAD_ID;assert.equal(owner,'01a1334b-d22d-74b2-bebd-83006b5072bf');
const name='vpj37-v10-retired-20261013-'+randomUUID().slice(0,8),socket='/tmp/'+name+'-socket',data='/tmp/'+name+'-data';
const sha=x=>createHash('sha256').update(x).digest('hex');
const run=(args,input)=>spawnSync(args[0],args.slice(1),{input,encoding:'utf8',maxBuffer:8*1024*1024});
const cmd=(args,input)=>{const r=run(args,input);assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
function owned(){const c=JSON.parse(cmd(['docker','inspect',name]))[0];assert.equal(c.Config.Labels['vpj37.owner'],owner);assert.equal(c.Config.Labels['vpj37.nonce'],name);assert.equal(c.Config.User,'postgres');assert.equal(c.Image,image.split('@')[1]);assert.equal(c.HostConfig.NetworkMode,'none');assert.equal(c.Mounts.length,0);assert.deepEqual(c.HostConfig.PortBindings??{},{});}
function db(sql){owned();return cmd(['docker','exec','-i',name,'psql','-X','-q','-At','-v','ON_ERROR_STOP=1','-h',socket,'-U','postgres'],"set statement_timeout='30s';set lock_timeout='3s';set search_path=public;\n"+sql);}
const lit=x=>"'"+String(typeof x==='object'?JSON.stringify(x):x).replaceAll("'","''")+"'";
const report={result:'IN_PROGRESS',owner,name,image,sourceSHA:pinned,base:cmd(['git','rev-parse','HEAD']),checks:[],migrations:[],providerCalls:0,roles:'postgres and synthetic SQL claims; no GoTrue',unrun:['target deployment/provider/device/TripProposal acceptance','disabled-trigger injection prohibited by delegated no TRIGGER disable rule'],otherResources:'UNTOUCHED'};
function pass(label){report.checks.push({label,result:'PASS'});console.log('PASS '+label);}
function catalog(source){const tail=source.slice(source.indexOf('create function ops_control_private.installed_supported_v1()'));const m=tail.match(/for spec in select key,value from jsonb_each\('((?:[^']|'')*)'::jsonb\)/);assert.ok(m);return JSON.parse(m[1].replaceAll("''","'"));}
let created=false;
try{
 const bytes=readFileSync(migration);assert.equal(sha(bytes),pinned);
 const old=cmd(['git','show','HEAD:'+migration]),a=catalog(old),b=catalog(bytes.toString());assert.equal(Object.keys(b).length,52);assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());
 const key='ops_control_private.budget_source_changed_v1()';const changed=Object.keys(b).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k]));assert.deepEqual(changed,[key]);
 const fields=Object.keys(b[key]).filter(k=>JSON.stringify(a[key][k])!==JSON.stringify(b[key][k])).sort();assert.deepEqual(fields,['definition','md5','prosrc']);assert.equal(b[key].md5,'6e9254b145253d96940793fc6d09e2d2');
 report.catalog={functions:52,unchangedFunctions:51,unchangedAttributes:13,changedFields:fields};pass('static exact 52-function catalog: only budget body/definition/md5 delta, 13 attributes retained');
 assert.ok(!process.env.DOCKER_HOST&&!process.env.DOCKER_CONTEXT);assert.ok(JSON.parse(cmd(['docker','context','inspect']))[0].Endpoints.docker.Host.startsWith('unix:///'));
 assert.equal(cmd(['docker','ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}']),'');assert.equal(JSON.parse(cmd(['docker','image','inspect',image]))[0].Id,image.split('@')[1]);
 cmd(['docker','run','--pull=never','--rm','-d','--network','none','--name',name,'--label','vpj37.owner='+owner,'--label','vpj37.nonce='+name,'--user','postgres','--entrypoint','/bin/sh',image,'-c',`umask 077;mkdir ${socket};initdb -D ${data} -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D ${data} -c listen_addresses= -c unix_socket_directories=${socket} -c unix_socket_permissions=0700`]);created=true;
 for(let n=0;n<150;n++){if(run(['docker','exec',name,'pg_isready','-h',socket,'-U','postgres']).status===0)break;await new Promise(r=>setTimeout(r,100));}
 assert.match(db('show server_version;'),/^17\.6/);assert.equal(db('show listen_addresses;show unix_socket_permissions;'),'0700');report.version=db('show server_version;');pass('owned immutable PG17.6 network none, zero ports/mounts, private socket/data');
 db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 const files=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();assert.equal(files.length,155);
 for(const file of files){const source=readFileSync('supabase/migrations/'+file);db('begin;'+source+'\ncommit;');report.migrations.push({file,sha256:sha(source)});}
 assert.equal(db('select ops_control_private.installed_supported_v1();'),'t');assert.equal(db("select md5(pg_get_functiondef('ops_control_private.budget_source_changed_v1()'::regprocedure));"),b[key].md5);pass('actual fresh 155 migration compile and installed-supported exact function/relation/hook catalog');
 assert.equal(db('select ops_control_private.recovery_ready_v1();'),'f');pass('fresh installation recovery remains default closed');
 const u=randomUUID(),other=randomUUID(),s=randomUUID();
 db(`insert into auth.users(id) values('${u}'),('${other}');insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values('${s}','${u}','USD',1000,1000,10,10,false,now()+interval '1 day');insert into public.model_budget_provider_limits values('${s}','qwen','synthetic','v1',1000,100,true);`);
 const scope=()=>db(`select to_jsonb(s) from public.model_budget_scopes s where id='${s}';`),fence=()=>JSON.parse(db(`select to_jsonb(f) from ops_control_private.budget_fences_v1 f where scope_id='${s}';`));
 const attempts=()=>db(`select coalesce(jsonb_agg(to_jsonb(a) order by attempt_id),'[]'::jsonb) from public.model_budget_attempts a where scope_id='${s}';`);
 const ids={};for(const status of ['reserved','dispatched','pending','settled','released']){ids[status]=randomUUID();db(`insert into public.model_budget_attempts(scope_id,attempt_id,task_id,provider,model,price_version,reserved_micros,actual_micros,status) values('${s}','${ids[status]}','${randomUUID()}','qwen','synthetic','v1',100,${status==='settled'?20:'null'},'${status}');`);}
 const beforeScope=scope(),beforeFence=fence(),beforeAttempts=JSON.parse(attempts());
 const controls=JSON.parse(db("select jsonb_agg(jsonb_build_object('scope',jsonb_build_object('kind',kind,'key',key),'stopRevision',0) order by kind,key) from ops_control_private.controls_v1;"));
 const journal={schemaVersion:'ops-control-restore/1',revision:20,controls,budgets:[{scopeId:s,scopeCreatedAt:beforeFence.scope_created_at,revision:100,stopRevision:90,retired:true}],retiredOperations:[],erasedActors:[]};
 const reconcile=(j=journal)=>`select ops_control_private.reconcile_restore_v1(${lit(j)}::jsonb,encode(sha256(convert_to((${lit(j)}::jsonb)::text,'UTF8')),'hex'));`;
 const tripSnapshot=()=>db("select jsonb_build_object('trips',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.trips t),'proposals',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]'::jsonb) from public.trip_proposals p));");const beforeTrip=tripSnapshot();
 db(reconcile());assert.equal(scope(),beforeScope);let f=fence();assert.equal(f.retired,true);assert.equal(f.owner_id,null);assert.equal(f.revision,103);assert.equal(f.stop_revision,103);assert.equal(f.scope_created_at,beforeFence.scope_created_at);assert.equal(db('select ops_control_private.recovery_ready_v1();'),'t');
 let ledger=JSON.parse(attempts());for(const row of ledger){const oldRow=beforeAttempts.find(x=>x.attempt_id===row.attempt_id);const expected={...oldRow,status:oldRow.status==='reserved'?'released':oldRow.status==='dispatched'?'pending':oldRow.status};if(['reserved','dispatched'].includes(oldRow.status))expected.updated_at=row.updated_at;assert.deepEqual(row,expected);}pass('sealed retired journal + disabled scope reconcile succeeds: retired owner null, floor monotonic, exact generation and known ledger drain');
 const directFence=fence();db(`update public.model_budget_scopes set enabled=false where id='${s}';`);assert.deepEqual(fence(),directFence);pass('exact disabled no-op leaves retired fence and floors unchanged');
 const savedLedger=attempts();db(reconcile());const second=fence();assert.equal(second.revision,104);assert.equal(second.stop_revision,104);assert.equal(scope(),beforeScope);assert.equal(attempts(),savedLedger);pass('repeat reconcile succeeds with original repeated-stop monotonic marker, ledger idempotent');
 const state=()=>db(`select jsonb_build_object('root',(select to_jsonb(r) from ops_control_private.root_v1 r),'controls',(select jsonb_agg(to_jsonb(c) order by kind,key) from ops_control_private.controls_v1 c),'fence',(select to_jsonb(f) from ops_control_private.budget_fences_v1 f where scope_id='${s}'),'scope',(select to_jsonb(s) from public.model_budget_scopes s where id='${s}'),'attempts',(select jsonb_agg(to_jsonb(a) order by attempt_id) from public.model_budget_attempts a));`);
 function rejected(label,sql,pattern=/OPS_UNAVAILABLE/){const before=state();owned();const r=run(['docker','exec','-i',name,'psql','-X','-q','-At','-v','ON_ERROR_STOP=1','-h',socket,'-U','postgres'],'begin;set search_path=public;'+sql+';commit;');assert.notEqual(r.status,0,label);assert.match(r.stderr,pattern);assert.equal(state(),before);pass(label+' and transaction rollback retains rows');}
 const oldBody=a[key].definition;rejected('prepatch exact body reproduces retired disabled stop failure',oldBody+`;select public.stop_model_budget('${s}','${u}')`);
 rejected('retired false to true denied',`update public.model_budget_scopes set enabled=true where id='${s}'`);
 rejected('retired owner change denied',`update public.model_budget_scopes set owner_id='${other}' where id='${s}'`);
 rejected('retired generation change denied',`update public.model_budget_scopes set created_at=created_at+interval '1 second' where id='${s}'`);
 rejected('retired tariff change denied',`update public.model_budget_provider_limits set model='changed' where scope_id='${s}'`);
 rejected('retired attempt identity change denied',`update public.model_budget_attempts set task_id='${randomUUID()}' where scope_id='${s}' and attempt_id='${ids.pending}'`);
 rejected('retired other field change denied',`update public.model_budget_scopes set limit_micros=1001 where id='${s}'`);
 rejected('retired ledger destructive reset denied',`delete from public.model_budget_attempts where scope_id='${s}';delete from public.model_budget_provider_limits where scope_id='${s}';delete from public.model_budget_scopes where id='${s}';insert into public.model_budget_scopes select * from jsonb_populate_record(null::public.model_budget_scopes,${lit(JSON.parse(beforeScope))}::jsonb)`);
 const empty=randomUUID();db(`insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,expires_at) values('${empty}','${u}','USD',1000,1000,10,10,now()+interval '1 day');delete from public.model_budget_scopes where id='${empty}';`);
 rejected('deleted retired scope recreation denied',`insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,expires_at) values('${empty}','${u}','USD',1000,1000,10,10,now()+interval '1 day')`);
 rejected('late reconcile overflow rolls back all prior writes',reconcile({...journal,revision:9007199254740990}));
 const memberSession=randomUUID();db(`insert into identity_private.mobile_accounts(owner_id) values('${u}');insert into auth.sessions(id,user_id) values('${memberSession}','${u}');update knowledge_review_private.settings set enabled=true;insert into knowledge_review_private.members(actor_id,active) values('${u}',true);`);
 const claims={role:'authenticated',is_anonymous:false,session_id:memberSession};
 const resume={schemaVersion:'ops-control/1',action:'budget_resume',operationId:randomUUID(),scopeId:s,expectedRevision:fence().revision};
 rejected('actual authenticated Ops member cannot resume retired owner budget',`set request.jwt.claim.sub='${u}';set request.jwt.claim.role='authenticated';set request.jwt.claims=${lit(claims)};set role authenticated;select public.ops_control_operations_v1(${lit(resume)}::jsonb)`);
 assert.equal(JSON.parse(db(`select ops_control_private.budget_state_v1('${s}');`)).eligibility,'retired');pass('retired budget eligibility remains retired');
 const stop=()=>JSON.parse(db(`select public.stop_model_budget('${s}','${u}');`));assert.equal(stop().kind,'stopped');pass('original stop on disabled retired scope remains successful');
 const finish=(id,action,actual='null',uid=u)=>JSON.parse(db(`select public.finish_model_budget('${s}','${uid}','${id}','${action}',${actual});`));
 assert.equal(finish(ids.dispatched,'settle',20).kind,'settled');assert.equal(finish(ids.dispatched,'settle',20).kind,'duplicate');assert.equal(finish(ids.dispatched,'settle',21).kind,'conflict');assert.equal(finish(ids.pending,'release').kind,'conflict');assert.equal(finish(ids.pending,'settle',120).kind,'settled');assert.equal(JSON.parse(scope()).frozen,true);assert.equal(finish(ids.pending,'settle',120,other).kind,'unavailable');pass('original exact settle/duplicate/conflict/overrun freeze and foreign owner refusal preserved');
 rejected('settled actual cannot be rewritten',`update public.model_budget_attempts set actual_micros=21 where scope_id='${s}' and attempt_id='${ids.settled}'`);
 const svc="set request.jwt.claim.role='service_role';set request.jwt.claims='{\"role\":\"service_role\"}';set role service_role;";
 rejected('ordinary authenticated stop denied',`set request.jwt.claim.role='authenticated';set role authenticated;select public.stop_model_budget('${s}','${u}')`,/permission denied/);
 rejected('ordinary service reconcile denied',svc+reconcile(),/permission denied/);
 assert.equal(JSON.parse(db(svc+`select public.reserve_model_budget('${s}','${u}','${randomUUID()}','${randomUUID()}','qwen','synthetic','v1',10);`)).kind,'disabled');pass('actual service-role fresh reserve disabled; no privilege grant');
 const mutated=b[key].definition.replace(b[key].prosrc,b[key].prosrc+'\n-- synthetic unknown source');assert.notEqual(mutated,b[key].definition);
 rejected('unknown source refused by installed guard and reconcile',mutated+";do $$begin if ops_control_private.installed_supported_v1() then raise exception 'UNEXPECTED_SUPPORTED';end if;end$$;"+reconcile());assert.equal(db('select ops_control_private.installed_supported_v1();'),'t');
 rejected('renamed required hook refused by installed guard and reconcile',"alter trigger ops_control_scope_version_v1 on public.model_budget_scopes rename to synthetic_unknown_hook;do $$begin if ops_control_private.installed_supported_v1() then raise exception 'UNEXPECTED_SUPPORTED';end if;end$$;"+reconcile());assert.equal(db('select ops_control_private.installed_supported_v1();'),'t');
 rejected('incorrect sealed manifest digest refused',`select ops_control_private.reconcile_restore_v1(${lit(journal)}::jsonb,repeat('0',64))`);
 assert.equal(tripSnapshot(),beforeTrip);assert.equal(fence().retired,true);assert.equal(fence().owner_id,null);assert.equal(db('select ops_control_private.installed_supported_v1();'),'t');assert.equal(sha(readFileSync(migration)),pinned);pass('final installed source exact; Trip/proposals unchanged; retired owner never restored');
 report.finalFence=fence();report.finalLedger=JSON.parse(attempts());report.result='PASS';
}catch(error){report.result='FAIL';report.error=String(error);console.error(String(error));process.exitCode=1;}
finally{if(created){try{owned();cmd(['docker','rm','-f',name]);assert.equal(cmd(['docker','ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}']),'');report.cleanup='ABSENT';}catch(e){report.cleanup=String(e);report.result='FAIL';process.exitCode=1;}}writeFileSync(out+'manifest.json',JSON.stringify(report,null,2)+'\n');}
