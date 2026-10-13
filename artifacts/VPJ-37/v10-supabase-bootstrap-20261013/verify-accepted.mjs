import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,cpSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {identityLocalEnv} from '../../../scripts/db/explicit-local-target.mjs';
import {assertNativeHTTPPortsFree,nativeHTTPPorts} from '../../../tests/integration/turn/native-http-ports.mjs';
import {freshOpsBootstrapSQL,freshOpsScopes,stageFreshOpsFixtureBootstrap} from '../../../tests/integration/observability/ops-control-owned/fresh-bootstrap.mjs';
const repo=process.cwd(),out=join(repo,'artifacts/VPJ-37/v10-supabase-bootstrap-20261013');
const results=[];const httpOnly=process.argv[2]==='--http-only';const apiOrigin='http://localhost:62131';
const expected='543e2617627fe7eddb8564ee4027e4c59cb986d77db2508da12a7a37ae633dea';
assert.equal(createHash('sha256').update(readFileSync('supabase/migrations/20261012103151_vpj37_ops_control_w2.sql')).digest('hex'),expected);
const ports=nativeHTTPPorts(62100);await assertNativeHTTPPortsFree(ports);
assert.equal(spawnSync('supabase',['--version'],{encoding:'utf8'}).stdout.trim(),'2.117.0');
for(const image of ['public.ecr.aws/supabase/postgres:17.6.1.155','public.ecr.aws/supabase/gotrue:v2.196.0','public.ecr.aws/supabase/postgrest:v16.2','public.ecr.aws/supabase/kong:2.8.1'])assert.equal(spawnSync('docker',['image','inspect',image],{stdio:'ignore'}).status,0,'required image cached');
const target=mkdtempSync(join(tmpdir(),'v10-accepted-ops-')),project='vp-ops-review-'+randomUUID().slice(0,8),container='supabase_db_'+project;
mkdirSync(join(target,'supabase'));let config=readFileSync('supabase/config.toml','utf8').replace(/^project_id\s*=.*$/m,`project_id = "${project}"`);
const mapping=new Map([20,21,22,23,24,27,29].map(o=>[String(54300+o),String(62100+o)]));
config=config.replace(/\b(?:54320|54321|54322|54323|54324|54327|54329)\b/g,p=>mapping.get(p)).replace(/(\[db.seed\][\s\S]*?enabled = )true/,'$1false');
writeFileSync(join(target,'supabase/config.toml'),config);cpSync('supabase/migrations',join(target,'supabase/migrations'),{recursive:true});
for(const file of (await import('node:fs')).readdirSync('supabase/migrations'))assert.deepEqual(readFileSync(join(target,'supabase/migrations',file)),readFileSync(join('supabase/migrations',file)));
if(httpOnly)stageFreshOpsFixtureBootstrap(target);writeFileSync(join(out,'accepted-resource.json'),JSON.stringify({target,project,container,ports:ports.ports,source:expected},null,2)+'\n');
let server,serverOutput='';
const quiet=(command,args)=>new Promise(resolve=>{const child=spawn(command,args,{cwd:repo,stdio:['ignore','pipe','pipe']});let diagnostic='';for(const stream of [child.stdout,child.stderr])stream.on('data',part=>diagnostic=(diagnostic+String(part)).slice(-131072));child.once('error',()=>resolve({code:1}));child.once('exit',code=>resolve({code,syntaxError:/ERROR:.*syntax error/.test(diagnostic),sourceUnavailable:/ERROR:\s*W2_FIXTURE_SOURCE_UNAVAILABLE/.test(diagnostic)}));});
const sql=input=>spawnSync('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],{input,encoding:'utf8',maxBuffer:1048576});
function db(input){const r=sql(input);if(r.status!==0){const known=['W2_FIXTURE_ROLE_UNAVAILABLE','W2_FIXTURE_SOURCE_UNAVAILABLE','W2_FIXTURE_NOT_PRISTINE','W2_FIXTURE_DEFAULT_DENIAL_LOST','W2_FIXTURE_RECONCILIATION_FAILED','W2_FIXTURE_ENABLE_FAILED','W2_FIXTURE_CLEANUP_FAILED','OPS_FORBIDDEN','OPS_UNAVAILABLE','OPS_CONFLICT','PROFILE_SOURCE_UNAVAILABLE'];const codes=known.filter(code=>new RegExp('ERROR:\\s*'+code+'(?:\\s|$)').test(r.stderr));console.log('OWNED_SQL_FAILURE '+JSON.stringify({codes,constraintViolation:/violates.*constraint/.test(r.stderr),permissionDenied:/permission denied/.test(r.stderr),nullViolation:/null value.*violates/.test(r.stderr)}));}assert.equal(r.status,0,'owned SQL operation failed; raw diagnostic suppressed');return r.stdout.trim();}
async function check(label,fn){try{const detail=await fn();results.push({label,result:'PASS',...(detail?{detail}: {})});console.log('PASS '+label);}catch(error){const detail=error.code==='ERR_ASSERTION'?{assertion:true,actual:typeof error.actual==='number'||typeof error.actual==='boolean'?error.actual:null,expected:typeof error.expected==='number'||typeof error.expected==='boolean'?error.expected:null}:null;results.push({label,result:'FAIL',detail});throw Error('Owned verification failed at '+label);}finally{writeFileSync(join(out,'accepted-results.json'),JSON.stringify({source:expected,project,results,providerCalls:0,target:'UNRUN'},null,2)+'\n');}}
const snapshotSQL="select jsonb_build_object('root',(select jsonb_agg(jsonb_build_object('revision',revision,'manifestNull',recovery_manifest is null)) from ops_control_private.root_v1),'disabledControls',(select count(*) from ops_control_private.controls_v1 where state='disabled' and revision=0 and stop_revision=0),'enabledControls',(select count(*) from ops_control_private.controls_v1 where state='enabled'),'operations',(select count(*) from ops_control_private.operations_v1),'activeOperations',(select count(*) from ops_control_private.operations_v1 where actor_id is not null or not retired),'fences',(select count(*) from ops_control_private.budget_fences_v1),'budgets',(select count(*) from public.model_budget_scopes),'attempts',(select count(*) from public.model_budget_attempts),'users',(select count(*) from auth.users),'sessions',(select count(*) from auth.sessions),'members',(select count(*) from knowledge_review_private.members),'mobileAccounts',(select count(*) from identity_private.mobile_accounts),'settings',(select enabled from knowledge_review_private.settings where singleton),'ready',ops_control_private.recovery_ready_v1());";
const journal=JSON.stringify({schemaVersion:'ops-control-restore/1',revision:0,controls:freshOpsScopes.map(([kind,key])=>({scope:{kind,key},stopRevision:0})),budgets:[],retiredOperations:[],erasedActors:[]});
let finished=false;
try{
 await check('official CLI isolated GoTrue/PostgREST/SQL startup',async()=>{const r=await quiet('supabase',['start','--workdir',target,'-x','realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor']);assert.equal(r.code,0);return r;});
 if(!httpOnly){await check('actual table privilege vectors and exact named policies',()=>{
  const actual=JSON.parse(db("select jsonb_agg(jsonb_build_object('table',t,'role',r,'privileges',(select jsonb_object_agg(p,has_table_privilege(r,t,p)) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p))) from unnest(array['public.model_budget_scopes','public.model_budget_attempts','public.model_budget_provider_limits']) t cross join unnest(array['postgres','public','anon','authenticated','service_role']) r;"));
  for(const row of actual)for(const [priv,value] of Object.entries(row.privileges))assert.equal(value,row.role==='postgres'||row.role==='service_role'&&['SELECT','INSERT','UPDATE'].includes(priv));
  writeFileSync(join(out,'effective-vectors-after.json'),JSON.stringify(actual,null,2)+'\n');
  const policies=JSON.parse(db("select jsonb_agg(jsonb_build_object('table',polrelid::regclass::text,'policy',polname,'restrictive',not polpermissive,'roles',(select jsonb_agg(pg_get_userbyid(o)::text order by o) from unnest(polroles) o))) from pg_policy where polrelid in ('public.model_budget_scopes'::regclass,'public.model_budget_attempts'::regclass,'public.model_budget_provider_limits'::regclass);"));
  assert.equal(policies.length,3);for(const p of policies){assert.deepEqual(p.roles,['authenticated']);assert.equal(p.restrictive,true);assert.equal(p.policy,'native_mobile_access_v2');}return {policies};
 });
 await check('installed true, original eight guards true, attribute/policy mutation fail closed',()=>{
  const guards=JSON.parse(db("select json_build_object('installed',ops_control_private.installed_supported_v1(),'profile',profile_data_private.schema_v1(),'conversation',conversation_data_private.schema_supported_v1(),'result',result_data_private.schema_supported_v1(),'turnSchema',turn_data_private.schema_supported_v1(),'turnRuntime',turn_data_private.runtime_supported_v1(),'writeHooks',turn_data_private.write_hooks_valid_v1(),'hooks',turn_data_private.hooks_valid_v1(),'profileHooks',export_private.profile_hooks_valid_v1());"));assert.ok(Object.values(guards).every(v=>v===true));
  assert.equal(db("begin;alter function public.ops_control_operations_v1(jsonb) strict;select ops_control_private.installed_supported_v1();rollback;select ops_control_private.installed_supported_v1();"),'f\nt');
  assert.equal(db("begin;alter policy native_mobile_access_v2 on public.model_budget_scopes rename to owned_fixture_changed;select ops_control_private.installed_supported_v1();rollback;select ops_control_private.installed_supported_v1();"),'f\nt');return guards;
 });
 await check('restored/reconciled revision-zero database refuses fresh initializer without resetting data',()=>{
  const before=db(snapshotSQL);const helper=freshOpsBootstrapSQL().replace(/^begin;\n/,'').replace(/\ncommit;$/,'');
  const r=sql(`begin;select ops_control_private.reconcile_restore_v1('${journal}'::jsonb,encode(sha256(convert_to(('${journal}'::jsonb)::text,'UTF8')),'hex'));${helper}`);
  assert.notEqual(r.status,0);assert.match(r.stderr,/ERROR:\s*W2_FIXTURE_NOT_PRISTINE/);assert.equal(db(snapshotSQL),before);return {code:'W2_FIXTURE_NOT_PRISTINE',snapshotUnchanged:true};
 });
 await check('fresh actual initialization executes 12 authenticated CAS, retires receipts and cleans actor',()=>{
  const before=JSON.parse(db(snapshotSQL));assert.equal(before.disabledControls,12);assert.equal(before.root[0].revision,0);assert.equal(before.root[0].manifestNull,true);assert.equal(before.ready,false);assert.equal(before.users,0);
   db(freshOpsBootstrapSQL());const after=JSON.parse(db(snapshotSQL));writeFileSync(join(out,'fresh-initialization-snapshot.json'),JSON.stringify({before,after},null,2)+'\n');assert.equal(after.root[0].revision,13);assert.equal(after.enabledControls,12);assert.equal(after.operations,12);assert.equal(after.activeOperations,0);assert.equal(after.ready,true);for(const k of ['users','sessions','members','mobileAccounts','budgets','attempts','fences'])assert.equal(after[k],0);assert.equal(after.settings,before.settings);return {before,after};
 });
 await check('reuse refuses already initialized database and keeps exact snapshot',()=>{const before=db(snapshotSQL),r=sql(freshOpsBootstrapSQL());assert.notEqual(r.status,0);assert.match(r.stderr,/ERROR:\s*W2_FIXTURE_NOT_PRISTINE/);assert.equal(db(snapshotSQL),before);return {code:'W2_FIXTURE_NOT_PRISTINE',snapshotUnchanged:true};});
 }else{await check('staged fresh helper initializes during actual CLI startup',()=>{const after=JSON.parse(db(snapshotSQL));assert.equal(after.root[0].revision,13);assert.equal(after.enabledControls,12);assert.equal(after.operations,12);assert.equal(after.activeOperations,0);assert.equal(after.ready,true);for(const k of ['users','sessions','members','mobileAccounts','budgets','attempts','fences'])assert.equal(after[k],0);return after;});}
 process.env.VP_IDENTITY_SUPABASE_WORKDIR=target;process.env.VP_IDENTITY_SUPABASE_API_URL=ports.supabaseAPI;const state=identityLocalEnv();assert.equal(state.DB_CONTAINER,container);
 const publishable=state.PUBLISHABLE_KEY||state.ANON_KEY;
 const admin=createClient(state.API_URL,state.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),jar=new Map(),email='v10-ops-'+randomUUID()+'@example.test',password='Local-'+randomUUID();let actor,authClient;
 try{
  await check('real GoTrue cookie and Ops HTTP consumer: workspace/CAS/readback/conflict/negative/revocation',async()=>{
   const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);actor=created.data.user.id;
   const auth=createServerClient(state.API_URL,publishable,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(c=>jar.set(c.name,c.value))}});authClient=auth;assert.equal((await auth.auth.signInWithPassword({email,password})).error,null);
   db(`insert into identity_private.mobile_accounts(owner_id) values('${actor}') on conflict do nothing;insert into knowledge_review_private.members(actor_id,active) values('${actor}',true);update knowledge_review_private.settings set enabled=true where singleton;`);
   server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','localhost','--port',String(ports.apiPort)],{cwd:repo,env:{...process.env,OPS_LOCAL_REVIEW:'1',NEXT_PUBLIC_SUPABASE_URL:state.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:publishable},stdio:['ignore','pipe','pipe']});
   for(const stream of [server.stdout,server.stderr])stream.on('data',p=>serverOutput=(serverOutput+String(p)).slice(-131072));
   const endpoint=apiOrigin+'/api/ops/controls',cookie=()=>[...jar].map(([k,v])=>k+'='+v).join('; ');
   const httpObservations=[];async function call(input,useCookie=true,extra={}){const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Origin:apiOrigin,...(useCookie?{Cookie:cookie()}:{}),...extra},body:JSON.stringify(input)});const data=await r.json();httpObservations.push({action:input.action,status:r.status,error:['OPS_FORBIDDEN','OPS_UNAVAILABLE','UNAUTHENTICATED','OPS_CONFLICT','OPS_INVALID_INPUT'].includes(data?.error?.code)?data.error.code:null,origin:extra.Origin||apiOrigin});writeFileSync(join(out,'http-observations.json'),JSON.stringify(httpObservations,null,2)+'\n');return {status:r.status,data};}
   const workspace={schemaVersion:'ops-control/1',action:'workspace'};const direct=await auth.rpc('ops_control_operations_v1',{p_input:workspace});const claims=await auth.auth.getClaims();writeFileSync(join(out,'http-authority-diagnostic.json'),JSON.stringify({directRPCSucceeded:!direct.error,error:['OPS_FORBIDDEN','OPS_UNAVAILABLE','OPS_CONFLICT','UNAUTHENTICATED'].includes(direct.error?.message)?direct.error.message:null,jwtAuthenticated:claims.data?.claims?.role==='authenticated',jwtAnonymous:claims.data?.claims?.is_anonymous===true,sessionPresent:typeof claims.data?.claims?.session_id==='string',cookieCount:jar.size},null,2)+'\n');let current;
   for(let i=0;i<100;i++){try{current=await call(workspace);if(current.status===200||current.status===403)break;}catch{}await new Promise(r=>setTimeout(r,300));}
   if(current?.status===403){const alternate=await call(workspace,true,{Origin:'http://localhost:'+ports.apiPort});writeFileSync(join(out,'http-origin-diagnostic.json'),JSON.stringify({originalStatus:current.status,alternateLocalhostStatus:alternate.status},null,2)+'\n');}assert.equal(current?.status,200,'HTTP consumer workspace');assert.equal(current.data.data.revision,13);assert.equal(current.data.data.controls.length,12);
   assert.equal((await call(workspace,false)).status,401);assert.equal((await call(workspace,true,{Origin:'https://untrusted.example'})).status,403);
   const mutation={schemaVersion:'ops-control/1',action:'set',operationId:randomUUID(),expectedRevision:13,scope:{kind:'capability',key:'text'},state:'disabled'};
   const changed=await call(mutation);assert.equal(changed.status,200);assert.equal(changed.data.data.revision,14);assert.equal(changed.data.data.acknowledgement,'applied');
   const receipt=await call({schemaVersion:'ops-control/1',action:'receipt',operationId:mutation.operationId});assert.equal(receipt.status,200);assert.deepEqual(receipt.data.data,changed.data.data);
   assert.equal((await call({...mutation,operationId:randomUUID()})).status,409);
   const restored=await call({...mutation,operationId:randomUUID(),expectedRevision:14,state:'enabled'});assert.equal(restored.status,200);assert.equal(restored.data.data.revision,15);
   db(`update knowledge_review_private.members set active=false where actor_id='${actor}';`);assert.equal((await call(workspace)).status,403);
   return {workspace:200,authenticatedCAS:200,receipt:200,staleCAS:409,unauthenticated:401,crossOrigin:403,revokedMember:403,finalRevision:15};
  });
 }finally{
  if(actor){await authClient?.auth.signOut({scope:'global'}).catch(()=>{});const deleted=await admin.auth.admin.deleteUser(actor);assert.equal(deleted.error,null,'own GoTrue actor cleanup');db('update knowledge_review_private.settings set enabled=false where singleton;');}
 }
 await check('HTTP actor cleanup keeps all receipts retired and no auth identities',()=>{const after=JSON.parse(db(snapshotSQL));for(const k of ['users','sessions','members','mobileAccounts','activeOperations'])assert.equal(after[k],0);assert.equal(after.settings,false);return after;});
 finished=true;
}catch(error){console.error(error.message.startsWith('Owned verification failed')?error.message:'Owned verification failure; credential-bearing diagnostics suppressed');process.exitCode=1;}
finally{
 if(server){const ended=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await ended;}
 const stopped=await quiet('supabase',['stop','--workdir',target,'--no-backup']);if(stopped.code===0)rmSync(target,{recursive:true,force:true});else process.exitCode=1;
 writeFileSync(join(out,'accepted-cleanup.json'),JSON.stringify({project,container,stackStop:stopped.code===0,serverExited:!server||server.exitCode!==null,completed:finished,source:expected},null,2)+'\n');
 console.log('OWNED_CLEANUP '+JSON.stringify({stackStop:stopped.code===0,completed:finished}));
}
