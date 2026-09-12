import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createWriteStream,copyFileSync} from 'node:fs';
import {join} from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {identityLocalEnv} from '../identity/local-supabase.mjs';
const enabled=process.env.VP_OPS_LOCAL_INTEGRATION==='true';
test('real protected statement producer → independent review/publication → scoped product read → revocation',{skip:!enabled,timeout:240000},async t=>{
 const state=identityLocalEnv();assert.ok(state && /^supabase_db_vp-ops-review-/.test(state.DB_CONTAINER));
 const sql=input=>execFileSync('docker',['exec','-i',state.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 const key=state.PUBLISHABLE_KEY||state.ANON_KEY,api='http://127.0.0.1:'+(process.env.VP_OPS_API_PORT||'56931');
 const admin=createClient(state.API_URL,state.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',new URL(api).port],{env:{...process.env,OPS_LOCAL_REVIEW:'1',KNOWLEDGE_LOCAL_READ:'1',VISEPANDA_NATIVE_LOCAL_SESSION:'true',VISEPANDA_NATIVE_LOCAL_SERVICE_KEY:state.SERVICE_ROLE_KEY,NEXT_PUBLIC_SUPABASE_URL:state.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key},stdio:['ignore','pipe','pipe']});
 const log=createWriteStream('/tmp/vpj15-publication-api.log',{flags:'a'});server.stdout.pipe(log);server.stderr.pipe(log);
 t.after(async()=>{const ended=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await ended;});
 for(let i=0;i<100;i++){try{const r=await fetch(api+'/api/ops/review');if(r.headers.get('content-type')?.includes('application/json'))break;}catch{}await new Promise(r=>setTimeout(r,300));}
 async function actor(member){const email='vpj15-'+randomUUID()+'@example.test',password='Local-'+randomUUID();const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);const id=created.data.user.id;const jar=new Map();const client=createServerClient(state.API_URL,key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:cs=>cs.forEach(c=>jar.set(c.name,c.value))}});assert.equal((await client.auth.signInWithPassword({email,password})).error,null);if(member)sql(`insert into knowledge_review_private.members(actor_id,active) values('${id}',true);`);return {id,client,email,password,cookie:()=>[...jar].map(([n,v])=>n+'='+v).join('; ')};}
 const a=await actor(true),b=await actor(true),user=await actor(false);
 sql('update knowledge_review_private.settings set enabled=true;');
 const request=async(who,path,body)=>{const r=await fetch(api+path,{method:body?'POST':'GET',headers:{...(who?{Cookie:who.cookie()}:{}),...(body?{Origin:api,'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
 const ops=(who,body)=>request(who,'/api/ops/review',body);
 if(process.env.VP_OPS_BEFORE_MIGRATION){
  const migration='20260912042452_vpj_15_knowledge_publication.sql';assert.equal(process.env.VP_OPS_BEFORE_MIGRATION,migration);
  await t.test('CLI upgrade38 to39 preserves existing candidate and exact legacy receipt',async()=>{
   const legacy={action:'submit',operationId:randomUUID(),candidateId:randomUUID(),title:'Before publication migration',content:'Synthetic legacy candidate.'};
   const before=await ops(a,legacy);assert.equal(before.status,200);
   const structured={action:'submit_assertion',operationId:randomUUID(),candidateId:randomUUID(),title:'Before39 address',source:{sourceKey:'before39-source',revisionLabel:'one',publisher:'Synthetic author',uri:'urn:vpj15:synthetic:before39',locator:'paragraph1',snippet:'Synthetic address only.',usageDeclaration:'Owned synthetic data.'},assertion:{subjectId:'test-help-desk',claimType:'address',value:{lines:['Test Hall'],countryCode:'CN'}},expressions:{zh:'合成地址。',en:'Synthetic address.'}};
   const address=await ops(a,structured);assert.equal(address.status,200);
   const original=sql(`select to_jsonb(c)::text from knowledge_review_private.candidates c where id='${legacy.candidateId}';`);
   copyFileSync(join('supabase/migrations',migration),join(process.env.VP_IDENTITY_SUPABASE_WORKDIR,'supabase/migrations',migration));
   try{execFileSync('supabase',['migration','up','--local','--workdir',process.env.VP_IDENTITY_SUPABASE_WORKDIR],{stdio:['ignore','pipe','pipe']});}catch{throw Error('Owned migration39 apply failed; CLI output suppressed');}
   assert.deepEqual((await ops(a,legacy)).body,before.body);assert.equal(sql(`select to_jsonb(c)::text from knowledge_review_private.candidates c where id='${legacy.candidateId}';`),original);
   assert.deepEqual((await ops(a,structured)).body,address.body);
   const current=await request(a,'/api/ops/review');assert.equal(current.status,200);assert.ok(JSON.stringify(current.body).includes('Synthetic address.'));
   assert.equal(sql('select count(*) from supabase_migrations.schema_migrations;'),'39');
   assert.equal(sql("select enabled from knowledge_review_private.publication_settings;"),'f');
  });
 }
 const read=(who=user,city='shanghai',scene='payment',locale='en')=>request(who,`/api/knowledge?city=${city}&scene=${scene}&locale=${locale}`);
 const source={sourceKey:'owned-source',revisionLabel:'one',publisher:'Synthetic test author',uri:'urn:vpj15:synthetic:publication',locator:'one assertion',snippet:'Synthetic evidence only.',usageDeclaration:'Owned synthetic test content; not a real payment statement.'};
 const statement={schemaVersion:'knowledge-statement/1',assertion:{subjectId:'synthetic-payment',predicate:'accepts_method',objectId:'synthetic-cash',conditions:['synthetic-condition'],exclusions:['no-real-acceptance']},scope:{cities:['shanghai'],scene:'payment',audience:'international_independent_traveler'},expressions:{zh:{text:'合成支付说明。',conditions:['仅限本次合成测试。'],exclusions:['不表示真实支付受理。']},en:{text:'Synthetic payment note.',conditions:['Only for this synthetic test.'],exclusions:['Does not establish real payment acceptance.']}},sources:[source,{...source,sourceKey:"owned-corroboration",uri:"urn:vpj15:synthetic:corroboration"}]};
 const submission={action:'submit_statement',operationId:randomUUID(),candidateId:randomUUID(),title:'Synthetic payment',statement};
 const review=cid=>({action:'review',operationId:randomUUID(),candidateId:cid,expectedVersion:1,decision:'reviewed',note:'Independent synthetic statement/provenance/scope review.'});
 const publish=cid=>({action:'publish_statement',operationId:randomUUID(),candidateId:cid,expectedVersion:2,expiresAt:new Date(Date.now()+3600000).toISOString(),useBasis:'original_factual_summary',useNote:'Owned synthetic test only; first-party test display.'});
 await t.test('default off and nonmember cannot publish; strict identity/input',async()=>{
  assert.equal((await read()).status,503);assert.equal((await read(null)).status,401);
  assert.equal((await ops(user,submission)).status,403);
  assert.equal((await ops(a,{...submission,statement:{...statement,granted:true}})).status,400);
  assert.equal((await ops(a,{...submission,statement:{...statement,expressions:{...statement.expressions,en:{...statement.expressions.en,conditions:[]}}}})).status,400);
  const direct=await user.client.rpc('ops_review_workspace',{p_input:submission});assert.ok(direct.error);
  assert.ok((await user.client.schema('knowledge_review_private').from('statements').select('*')).error);
 });
 await t.test('immutable multi-source statement, exact replay, separate review and publication',async()=>{
  const one=await ops(a,submission);assert.equal(one.status,200);assert.equal(one.body.data.published,false);assert.equal(one.body.data.statement.assertion.objectId,'synthetic-cash');assert.deepEqual((await ops(a,submission)).body,one.body);
  assert.equal((await ops(a,{...submission,title:'drift'})).status,409);
  assert.equal((await ops(a,publish(submission.candidateId))).status,403);
  assert.equal((await ops(b,publish(submission.candidateId))).status,409);
  assert.equal((await ops(b,review(submission.candidateId))).status,200);
  sql('update knowledge_review_private.publication_settings set enabled=true;');
  assert.equal((await read()).body.data.statements.length,0,'review is not publication');
 });
 let published;
 await t.test('publish and eligible bilingual product read preserve conditions without leaking private material',async()=>{
  published=publish(submission.candidateId);const r=await ops(b,published);assert.equal(r.status,200);assert.deepEqual((await ops(b,published)).body,r.body);
  const en=await read(),zh=await read(user,'shanghai','payment','zh');assert.equal(en.status,200);assert.equal(en.body.data.statements.length,1);
  const item=en.body.data.statements[0];assert.equal(item.text,statement.expressions.en.text);assert.equal(zh.body.data.statements[0].text,statement.expressions.zh.text);assert.equal(item.assertionId,zh.body.data.statements[0].assertionId);assert.deepEqual(item.assertion.conditions,statement.assertion.conditions);
  assert.deepEqual(item.conditions,statement.expressions.en.conditions);assert.deepEqual(item.exclusions,statement.expressions.en.exclusions);assert.equal(item.sources.length,2);assert.equal(item.sources[0].locator,source.locator);assert.ok(!JSON.stringify(en.body).includes(source.snippet));assert.ok(!JSON.stringify(en.body).includes(published.useNote));
  assert.equal((await read(user,'beijing')).body.data.statements.length,0);assert.equal((await read(user,'shanghai','rail')).body.data.statements.length,0);
  assert.equal((await request(user,'/api/knowledge?city=shanghai&scene=payment&locale=en&purpose=llm_inference')).status,400);
  assert.ok((await user.client.rpc('knowledge_read_v1',{p_input:{city:'shanghai',scene:'payment',locale:'en',recipient:'model'}})).error);
 });
 if(process.env.VP_OPS_BROWSER_EXECUTABLE) await t.test('browser statement submission, independent publication, bilingual reading and withdrawal',async()=>{
  const {chromium,expect}=await import('@playwright/test');
  const browser=await chromium.launch({executablePath:process.env.VP_OPS_BROWSER_EXECUTABLE,headless:true});
  const errors=[];
  try{
   async function pageFor(owner,path,viewport){
    const context=await browser.newContext({viewport});const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.goto(api+'/auth/sign-in?returnTo='+path);
    await page.getByRole('textbox',{name:'邮箱',exact:true}).fill(owner.email);
    await page.getByRole('textbox',{name:'密码',exact:true}).fill(owner.password);
    await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL(api+path);return page;
   }
   const author=await pageFor(a,'/ops/review',{width:390,height:844});
   await author.getByRole('checkbox',{name:'登记旅程陈述',exact:true}).check();
   await author.locator('input[name="title"]').fill('Browser statement');
   const values={...source,sourceKey:'browser-source',subjectId:'browser-subject',objectId:'browser-object',conditions:'test-only',exclusions:'no-real-service',conditionsZh:'仅限浏览器测试。',conditionsEn:'Browser test only.',exclusionsZh:'不代表真实服务。',exclusionsEn:'No real service claim.',expressionZh:'浏览器合成旅途参考。',expressionEn:'Browser synthetic travel note.'};
   for(const [name,value] of Object.entries(values))await author.locator('[name="'+name+'"]').fill(value);
   await author.locator('select[name="scene"]').selectOption('rail');
   await author.getByRole('button',{name:'提交候选',exact:true}).click();
   await expect(author.locator('article').filter({has:author.getByRole('heading',{name:'Browser statement',exact:true})})).toBeVisible();
   assert.equal(await author.evaluate(()=>document.documentElement.scrollWidth),390);
   const reviewer=await pageFor(b,'/ops/review',{width:1280,height:900});
   const card=reviewer.locator('article').filter({has:reviewer.getByRole('heading',{name:'Browser statement',exact:true})});
   await card.locator('summary').filter({hasText:'登记旅程陈述'}).click();await expect(card.getByText('Browser test only.',{exact:true})).toBeVisible();await expect(card.getByText(source.snippet,{exact:true})).toBeVisible();
   await card.locator('textarea[name="note"]').fill('Independent browser synthetic review.');
   await card.locator('button[value="reviewed"]').click();
   const expires=new Date(Date.now()+3600000);expires.setMinutes(expires.getMinutes()-expires.getTimezoneOffset());
   await card.locator('input[name="expires"]').fill(expires.toISOString().slice(0,16));
   await card.locator('textarea[name="useNote"]').fill('Owned synthetic first-party browser test.');
   await card.getByRole('button',{name:'发布供站内测试读取',exact:true}).click();await expect(card.getByRole('button',{name:'撤销发布',exact:true})).toBeVisible();
   await reviewer.screenshot({path:'/tmp/vpj15-editor-desktop-zh.png',fullPage:true});
   const reader=await pageFor(user,'/journey/knowledge',{width:390,height:844});
   await reader.getByLabel('Situation',{exact:true}).selectOption('rail');await expect(reader.getByText('Browser synthetic travel note.',{exact:true})).toBeVisible();
   await expect(reader.getByText('Browser test only.',{exact:true})).toBeVisible();await expect(reader.getByText('No real service claim.',{exact:true})).toBeVisible();
   await reader.getByText('Sources and context',{exact:true}).click();await expect(reader.getByText(source.locator,{exact:true})).toBeVisible();
   assert.equal(await reader.evaluate(()=>document.documentElement.scrollWidth),390);await reader.screenshot({path:'/tmp/vpj15-reader-mobile-en.png',fullPage:true});
   await reader.getByLabel('Language',{exact:true}).selectOption('zh');await expect(reader.getByText('浏览器合成旅途参考。',{exact:true})).toBeVisible();await expect(reader.getByText('仅限浏览器测试。',{exact:true})).toBeVisible();
   await reader.setViewportSize({width:1280,height:900});await reader.screenshot({path:'/tmp/vpj15-reader-desktop-zh.png',fullPage:true});
   await card.locator('textarea[name="revokeNote"]').fill('Browser withdrawal.');await card.getByRole('button',{name:'撤销发布',exact:true}).click();await expect(card.getByText('已撤销',{exact:true})).toBeVisible();
   await reader.getByRole('button',{name:'刷新',exact:true}).click();await expect(reader.getByText('浏览器合成旅途参考。',{exact:true})).toHaveCount(0);await expect(reader.getByRole('status')).toContainText('目前没有');
   assert.deepEqual(errors,[],'browser console and page errors');
  }finally{await browser.close();}
 });
 await t.test('actual native credential proof and current session read the same first-party projection',async()=>{
  const owner=await actor(false),attemptId=randomUUID();
  const cred=await fetch(api+'/api/auth/native/v2/credentials',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({attemptId,email:owner.email,password:owner.password})});assert.equal(cred.status,200);const tokens=await cred.json();
  const login=await fetch(api+'/api/auth/native/v2/login',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tokens.accessToken},body:JSON.stringify({attemptId})});assert.equal(login.status,200);
  const path=api+'/api/knowledge/native/v1?city=shanghai&scene=payment&locale=en';
  const r=await fetch(path,{headers:{Authorization:'Bearer '+tokens.accessToken}});assert.equal(r.status,200);assert.equal((await r.json()).data.statements.length,1);
  assert.equal((await fetch(path,{headers:{Cookie:owner.cookie(),Authorization:'Bearer '+tokens.accessToken}})).status,400);
  const questionPath=api+'/api/knowledge/native/v1/answer?questionId=rail_boarding_documents&questionVersion=1&city=shanghai&locale=en';
  const question=async(path=questionPath)=>{const r=await fetch(path,{headers:{Authorization:'Bearer '+tokens.accessToken}});return {status:r.status,body:await r.json()};};
  assert.equal((await question()).body.data.answer.outcome,'no_answer','payment notes cannot cover a rail question');
  const railIds=[];
  for(const objectId of ['original_valid_booking_id','valid_ticket_not_itinerary_or_receipt']){
   const rail=structuredClone(statement);rail.scope.scene='rail';rail.assertion={...rail.assertion,subjectId:'rail_eticket_boarding',predicate:'requires_document',objectId};
   const cid=randomUUID();railIds.push(cid);
   assert.equal((await ops(a,{...submission,candidateId:cid,operationId:randomUUID(),statement:rail})).status,200);
   assert.equal((await ops(b,review(cid))).status,200);assert.equal((await ops(b,publish(cid))).status,200);
  }
  for(const locale of ['en','zh']){const r=await question(questionPath.replace('locale=en','locale='+locale));assert.equal(r.status,200);assert.equal(r.body.data.answer.outcome,'answered');assert.equal(r.body.data.statements.length,2);assert.deepEqual(r.body.data.statements[0].conditions,statement.expressions[locale].conditions);assert.equal(r.body.data.statements[0].sources.length,2);assert.ok(!JSON.stringify(r.body).includes(source.snippet));}
  for(const extra of ['&text=book+my+train','&locale=zh','&scene=rail'])assert.equal((await question(questionPath+extra)).status,400);
  assert.equal((await fetch(questionPath,{headers:{Authorization:'Bearer '+tokens.accessToken,Origin:api}})).status,400);
  assert.equal((await fetch(questionPath,{headers:{Authorization:'Bearer '+tokens.accessToken,Cookie:owner.cookie()}})).status,400);
  assert.equal((await ops(b,{action:'revoke_statement',operationId:randomUUID(),candidateId:railIds[0],expectedPublicationVersion:1,note:'Question API withdrawal'})).status,200);
  const partial=await question();assert.equal(partial.body.data.answer.outcome,'partial');assert.deepEqual(partial.body.data.answer.claims[0].reasons,['revoked']);assert.equal(partial.body.data.statements.length,1);
  sql(`update knowledge_review_private.publications set expires_at=published_at+interval '1 millisecond' where candidate_id='${railIds[1]}';`);
  const expired=await question();assert.equal(expired.body.data.answer.outcome,'no_answer');assert.deepEqual(expired.body.data.answer.claims[1].reasons,['expired']);assert.equal(expired.body.data.statements.length,0);
  sql('update knowledge_review_private.publication_settings set enabled=false;');assert.equal((await question()).status,503);sql('update knowledge_review_private.publication_settings set enabled=true;');
  const logout=await fetch(api+'/api/auth/native/v2/logout',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tokens.accessToken},body:'{}'});assert.equal(logout.status,200);assert.equal((await fetch(path,{headers:{Authorization:'Bearer '+tokens.accessToken}})).status,401);assert.equal((await question()).status,401);
 });
 await t.test('atomic publication audit failure rolls back status and receipt',async()=>{
  const next={...submission,candidateId:randomUUID(),operationId:randomUUID()};assert.equal((await ops(a,next)).status,200);assert.equal((await ops(b,review(next.candidateId))).status,200);
  sql("create function knowledge_review_private.test_publication_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic audit failure'; end$$; create trigger test_publication_failure before insert on knowledge_review_private.publication_audit for each row execute function knowledge_review_private.test_publication_failure();");
  const op=publish(next.candidateId);
  try{assert.equal((await ops(b,op)).status,503);assert.equal(sql(`select count(*) from knowledge_review_private.publications where candidate_id='${next.candidateId}'`),'0');assert.equal(sql(`select count(*) from knowledge_review_private.receipts where operation_id='${op.operationId}'`),'0');}finally{sql('drop trigger test_publication_failure on knowledge_review_private.publication_audit; drop function knowledge_review_private.test_publication_failure();');}
 });
 await t.test('source revision conflict rolls back entire candidate; SQL rejects forged assertion',async()=>{
  const cid=randomUUID(),op=randomUUID();const drift={...submission,candidateId:cid,operationId:op,statement:{...statement,sources:[{...source,snippet:'changed under same revision'}]}};assert.equal((await ops(a,drift)).status,409);assert.equal(sql(`select count(*) from knowledge_review_private.candidates where id='${cid}'`),'0');
  assert.ok((await a.client.rpc('ops_review_workspace',{p_input:{...submission,candidateId:randomUUID(),operationId:randomUUID(),statement:{...statement,assertion:{...statement.assertion,conditions:null}}}})).error);
 });
 await t.test('concurrent publication and revocation each commit exactly one state and audit',async()=>{
  const next={...submission,candidateId:randomUUID(),operationId:randomUUID()};assert.equal((await ops(a,next)).status,200);assert.equal((await ops(b,review(next.candidateId))).status,200);
  const published=await Promise.all([ops(b,publish(next.candidateId)),ops(b,publish(next.candidateId))]);assert.deepEqual(published.map(r=>r.status).sort(),[200,409]);
  const revoke=()=>({action:'revoke_statement',operationId:randomUUID(),candidateId:next.candidateId,expectedPublicationVersion:1,note:'Concurrent withdrawal'});
  const revoked=await Promise.all([ops(a,revoke()),ops(b,revoke())]);assert.deepEqual(revoked.map(r=>r.status).sort(),[200,409]);
  assert.equal(sql(`select count(*) from knowledge_review_private.publication_audit where candidate_id='${next.candidateId}'`),'2');
 });
 await t.test('expiry, committed revocation and current authority invalidate product reads and retries',async()=>{
  sql(`update knowledge_review_private.publications set expires_at=published_at+interval '1 millisecond' where candidate_id='${submission.candidateId}';`);assert.equal((await read()).body.data.statements.length,0);
  sql(`update knowledge_review_private.publications set expires_at=clock_timestamp()+interval '1 hour' where candidate_id='${submission.candidateId}';`);
  const op={action:'revoke_statement',operationId:randomUUID(),candidateId:submission.candidateId,expectedPublicationVersion:1,note:'Synthetic revoke'};
  const r=await ops(a,op);assert.equal(r.status,200);assert.deepEqual((await ops(a,op)).body,r.body);assert.equal((await read()).body.data.statements.length,0);
  assert.equal((await ops(b,published)).body.data.operationOutcome,'published','historical receipt is not current eligibility');assert.equal((await read()).body.data.statements.length,0);
  assert.equal((await ops(b,publish(submission.candidateId))).status,409,'new source version/candidate required after revoke');
  sql(`update knowledge_review_private.members set active=false where actor_id='${b.id}';`);assert.equal((await ops(b,published)).status,403);
  await user.client.auth.signOut({scope:'global'});assert.equal((await read()).status,401);
 });
});
