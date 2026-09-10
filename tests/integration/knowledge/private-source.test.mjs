import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { identityLocalEnv } from '../identity/local-supabase.mjs';
const migration='20260910213151_vpj_15_private_source_assertion.sql';
test('private source revision → pending assertion → review → restart; real34→35 compatibility', {skip:process.env.VP_OPS_LOCAL_INTEGRATION!=='true',timeout:240000},async t=>{
 const state=identityLocalEnv();assert.ok(state&&/^supabase_db_vp-ops-review-/.test(state.DB_CONTAINER));
 assert.equal(process.env.VP_OPS_BEFORE_MIGRATION,migration,'explicit baseline34 required');
 const key=state.PUBLISHABLE_KEY||state.ANON_KEY,api='http://127.0.0.1:'+(process.env.VP_OPS_API_PORT||'56931');
 const sql=input=>execFileSync('docker',['exec','-i',state.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 assert.equal(sql("select to_regclass('knowledge_review_private.source_revisions') is null;"),'t');
 const admin=createClient(state.API_URL,state.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 let server;
 async function start(){server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',new URL(api).port],{env:{...process.env,OPS_LOCAL_REVIEW:'1',NEXT_PUBLIC_SUPABASE_URL:state.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key},stdio:['ignore','pipe','pipe']});const log=createWriteStream('/tmp/vpj15-source-api.log',{flags:'a'});server.stdout.pipe(log);server.stderr.pipe(log);for(let i=0;i<100;i++){try{const r=await fetch(api+'/api/ops/review');if(r.headers.get('content-type')?.includes('application/json'))return;}catch{}await new Promise(r=>setTimeout(r,300));}throw Error('Ops API readiness failed');}
 async function stop(){if(!server)return;const child=server;server=null;const ended=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await ended;}
 t.after(stop);await start();
 async function actor(label,member=true){const email='vpj15-'+label+'-'+randomUUID()+'@example.test',password='Synthetic-'+randomUUID();const made=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(made.error,null);const id=made.data.user.id,jar=new Map();const auth=createServerClient(state.API_URL,key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(c=>jar.set(c.name,c.value))}});assert.equal((await auth.auth.signInWithPassword({email,password})).error,null);if(member)sql(`insert into knowledge_review_private.members(actor_id,active) values('${id}',true);`);return{id,auth,email,password,cookie:()=>[...jar].map(([n,v])=>n+'='+v).join('; ')};}
 const author=await actor('author'),reviewer=await actor('reviewer'),outsider=await actor('outsider',false);
 sql('update knowledge_review_private.settings set enabled=true;');
 t.after(()=>sql('update knowledge_review_private.settings set enabled=false; delete from knowledge_review_private.members;'));
 async function call(who,input){const r=await fetch(api+'/api/ops/review',{method:input?'POST':'GET',headers:{Cookie:who.cookie(),...(input?{'Content-Type':'application/json',Origin:api,'X-Ops-Expected-Actor':who.id}:{})},...(input?{body:JSON.stringify(input)}:{})});return{status:r.status,body:await r.json()};}
 const oldInput={action:'submit',operationId:randomUUID(),candidateId:randomUUID(),title:'Legacy before35',content:'Synthetic plain text'};
 const old=await call(author,oldInput);assert.equal(old.status,200);assert.equal(old.body.data.structured,undefined);
 await t.test('CLI applies35; old receipt survives; private helpers have no external EXECUTE',async()=>{
  copyFileSync(join('supabase/migrations',migration),join(process.env.VP_IDENTITY_SUPABASE_WORKDIR,'supabase/migrations',migration));
  try{execFileSync('supabase',['migration','up','--local','--workdir',process.env.VP_IDENTITY_SUPABASE_WORKDIR],{stdio:['ignore','pipe','pipe']});}catch{throw Error('Owned migration35 apply failed; CLI output suppressed');}
  assert.deepEqual((await call(author,oldInput)).body,old.body);
  for(const role of ['anon','authenticated','service_role']){
   assert.equal(sql(`select has_function_privilege('${role}','public.ops_review_workspace(jsonb)','EXECUTE');`),role==='authenticated'?'t':'f');
   for(const fn of ['ops_review_workspace(jsonb)','candidate_json(uuid)','bounded_text(jsonb,integer)','current_actor()'])assert.equal(sql(`select has_function_privilege('${role}','knowledge_review_private.${fn}','EXECUTE');`),'f',role+' private '+fn);
  }
  assert.equal((await call(outsider)).status,403);
 });
 function sample(){return{action:'submit_assertion',operationId:randomUUID(),candidateId:randomUUID(),title:'Synthetic source-backed address',source:{sourceKey:'test-'+randomUUID(),revisionLabel:'r1',publisher:'Synthetic test author',uri:'urn:vpj15:synthetic:material-1',locator:'paragraph1',snippet:'The synthetic help desk is at Test Hall. 此片段仅供合成测试。',usageDeclaration:'Self-authored synthetic test declaration; unverified and not a runtime grant.'},assertion:{subjectId:'test-help-desk',claimType:'address',value:{lines:['Test Hall'],locality:'Synthetic City',countryCode:'CN'}},expressions:{zh:'合成服务台位于测试大厅。',en:'The synthetic help desk is at Test Hall.'}};}
 const draft=sample();let saved;
 await t.test('source snippet hash and bilingual projections persist under one pending assertion',async()=>{
  const r=await call(author,draft);assert.equal(r.status,200);saved=r.body.data;
  assert.equal(saved.structured.source.snippetHash,createHash('sha256').update(draft.source.snippet).digest('hex'));
  assert.equal(saved.structured.source.locatorStatus,'unverified');assert.equal(saved.structured.source.usageStatus,'unverified');
  assert.deepEqual(saved.structured.assertion.expressions,draft.expressions);assert.deepEqual(saved.structured.assertion.value,draft.assertion.value);assert.equal(saved.structured.assertion.revision,1);
  assert.equal(saved.published,false);assert.equal(saved.retrievalEligible,false);assert.equal(saved.audit.length,1);
  for(const change of [v=>v.source.snippet+=' changed',v=>v.expressions.zh+='改变',v=>v.assertion.value.lines=['Other Hall']]){const replay=structuredClone(draft);change(replay);assert.equal((await call(author,replay)).status,409);}
  assert.deepEqual((await call(author,draft)).body.data,saved);
  assert.equal((await call(author,{action:'submit',operationId:draft.operationId,candidateId:draft.candidateId,title:draft.title,content:draft.expressions.en})).status,409);
  assert.equal((await call(author,{...sample(),operationId:oldInput.operationId})).status,409);
  const padded=sample();padded.source.revisionLabel='r1'+' '.repeat(120);const denied=await author.auth.rpc('ops_review_workspace',{p_input:padded});assert.equal(denied.error?.message,'INVALID_INPUT','direct RPC raw source field limit cannot be padded away');assert.equal(sql(`select count(*) from knowledge_review_private.source_revisions where source_key='${padded.source.sourceKey}';`),'0');
  const chinese=sample();chinese.source.snippet='合'.repeat(2000);chinese.expressions.zh='成'.repeat(1000);chinese.expressions.en='测'.repeat(1000);assert.equal((await call(author,chinese)).status,200,'Chinese UTF8 field limits fit the total request budget');
  const oversized=sample();oversized.source.snippet='测'.repeat(9000);assert.equal((await call(author,oversized)).status,413,'whole body remains24KB bounded');
 });
 await t.test('source revision concurrency reuses exact declarations and rejects conflicting versions atomically',async()=>{
  const a=sample(),b={...sample(),source:a.source};const same=await Promise.all([call(author,a),call(reviewer,b)]);assert.deepEqual(same.map(x=>x.status),[200,200]);assert.equal(same[0].body.data.structured.source.revisionId,same[1].body.data.structured.source.revisionId);
  assert.equal(sql(`select count(*) from knowledge_review_private.source_revisions where source_key='${a.source.sourceKey}';`),'1');
  const c=sample(),d={...sample(),source:{...c.source,snippet:'Different synthetic revision content'}};const different=await Promise.all([call(author,c),call(reviewer,d)]);assert.deepEqual(different.map(x=>x.status).sort(),[200,409]);const failed=different[0].status===409?c:d;
  assert.equal(sql(`select count(*) from knowledge_review_private.candidates where id='${failed.candidateId}';`),'0');assert.equal(sql(`select count(*) from knowledge_review_private.audit where candidate_id='${failed.candidateId}';`),'0');assert.equal(sql(`select count(*) from knowledge_review_private.receipts where operation_id='${failed.operationId}';`),'0');assert.equal(sql(`select count(*) from knowledge_review_private.source_revisions where source_key='${c.source.sourceKey}';`),'1');
 });
 await t.test('assertion insert and receipt update faults roll back old-submit and new-source writes',async()=>{
  for(const [table,event] of [['candidate_assertions','insert'],['receipts','update']]){
   sql(`create function knowledge_review_private.test_source_fault() returns trigger language plpgsql as $$ begin raise exception 'synthetic structured fault'; end $$; create trigger test_source_fault before ${event} on knowledge_review_private.${table} for each row execute function knowledge_review_private.test_source_fault();`);
   const bad=sample();try{assert.equal((await call(author,bad)).status,503);for(const query of [`select count(*) from knowledge_review_private.candidates where id='${bad.candidateId}';`,`select count(*) from knowledge_review_private.audit where candidate_id='${bad.candidateId}';`,`select count(*) from knowledge_review_private.receipts where operation_id='${bad.operationId}';`,`select count(*) from knowledge_review_private.source_revisions where source_key='${bad.source.sourceKey}';`])assert.equal(sql(query),'0');}finally{sql(`drop trigger test_source_fault on knowledge_review_private.${table}; drop function knowledge_review_private.test_source_fault();`);}
  }
 });
 const review={action:'review',operationId:randomUUID(),candidateId:draft.candidateId,expectedVersion:1,decision:'reviewed',note:'Synthetic independent source/assertion review; rights remain unverified.'};
 await t.test('different reviewer and restarts preserve exact immutable source/assertion binding',async()=>{
  assert.equal((await call(author,review)).status,403);const r=await call(reviewer,review);assert.equal(r.status,200);assert.deepEqual(r.body.data.structured,saved.structured);assert.equal(r.body.data.audit.length,2);assert.equal(r.body.data.published,false);assert.equal(r.body.data.retrievalEligible,false);
  await stop();execFileSync('docker',['restart',state.DB_CONTAINER],{stdio:['ignore','pipe','pipe']});for(let i=0;i<80;i++){try{if(sql('select 1;')==='1')break;}catch{}await new Promise(r=>setTimeout(r,250));}await start();
  let read;for(let i=0;i<40;i++){read=await call(reviewer);if(read.status===200)break;await new Promise(r=>setTimeout(r,250));}assert.equal(read.status,200);assert.deepEqual(read.body.data.candidates.find(c=>c.id===draft.candidateId),r.body.data);assert.deepEqual((await call(author,oldInput)).body,old.body);
 });
 if(process.env.VP_OPS_BROWSER_EXECUTABLE) await t.test('existing Ops form registers and reviews a synthetic bilingual address at desktop and390px',async()=>{
  const {chromium}=await import('@playwright/test');const browser=await chromium.launch({executablePath:process.env.VP_OPS_BROWSER_EXECUTABLE,headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
   async function login(who){await page.goto(api+'/auth/sign-in?returnTo=/ops/review');const signOut=page.getByRole('button',{name:'退出登录',exact:true});await signOut.or(page.getByRole('textbox',{name:'邮箱',exact:true})).first().waitFor();if(await signOut.isVisible())await signOut.click();await page.getByRole('textbox',{name:'邮箱',exact:true}).fill(who.email);await page.getByRole('textbox',{name:'密码',exact:true}).fill(who.password);await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL(api+'/ops/review');await page.getByRole('textbox',{name:'标题',exact:true}).waitFor();}
   await login(author);await page.getByRole('checkbox',{name:'登记来源与双语地址草稿',exact:true}).check();await page.locator('[name=sourceKey]').fill('bad key');assert.equal(await page.locator('[name=sourceKey]').evaluate(node=>node.validity.patternMismatch),true,'browser identifier pattern remains valid under Unicode Sets');
   const title='Synthetic browser source assertion';
   for(const [name,value] of [['title',title],['sourceKey','browser-'+randomUUID()],['revisionLabel','r1'],['publisher','Synthetic browser author'],['uri','urn:vpj15:synthetic:browser-material'],['locator','paragraph1'],['snippet','Synthetic help desk is at Test Hall.'],['usageDeclaration','Synthetic declaration, not a licence grant.'],['subjectId','test-browser-desk'],['addressLines','Test Hall'],['locality','Synthetic City'],['countryCode','CN'],['expressionZh','合成服务台位于测试大厅。'],['expressionEn','The synthetic desk is at Test Hall.']])await page.locator('[name="'+name+'"]').fill(value);
   await page.locator('main > form').screenshot({path:'/tmp/vpj15-source-form-desktop.png'});await page.getByRole('button',{name:'提交候选',exact:true}).click();
   let article=page.getByRole('article').filter({has:page.getByRole('heading',{name:title,exact:true})});await article.waitFor();assert.ok(await article.getByText('请由另一位成员审核。',{exact:true}).isVisible());
   await login(reviewer);article=page.getByRole('article').filter({has:page.getByRole('heading',{name:title,exact:true})});await article.getByRole('textbox',{name:'审核说明',exact:true}).fill('Independent synthetic source/assertion review; no usage grant.');await article.getByRole('button',{name:'审核通过',exact:true}).click();await article.getByText('Independent synthetic source/assertion review; no usage grant.',{exact:true}).waitFor();
   await article.getByText('来源与双语草稿',{exact:true}).click();assert.ok(await article.getByText('未经核验；未获运行授权',{exact:true}).isVisible());
   await article.screenshot({path:'/tmp/vpj15-reviewed-desktop.png'});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await article.screenshot({path:'/tmp/vpj15-reviewed-mobile.png'});
   await page.getByRole('combobox',{name:'语言',exact:true}).selectOption('ar');assert.deepEqual(await page.evaluate(()=>({lang:document.documentElement.lang,dir:document.documentElement.dir,width:document.documentElement.scrollWidth})),{lang:'ar',dir:'rtl',width:390});await article.screenshot({path:'/tmp/vpj15-reviewed-ar.png'});assert.deepEqual(errors,[]);
  }finally{await browser.close();}
 });
 await t.test('member revocation and real sign-out still reject old and structured receipts',async()=>{
  sql(`update knowledge_review_private.members set active=false where actor_id='${author.id}';`);assert.equal((await call(author,oldInput)).status,403);assert.equal((await call(author,draft)).status,403);
  const stale=reviewer.cookie();assert.equal((await reviewer.auth.auth.signOut({scope:'global'})).error,null);reviewer.cookie=()=>stale;assert.equal((await call(reviewer,review)).status,401);
 });
});
