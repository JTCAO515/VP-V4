import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { identityLocalEnv } from '../identity/local-supabase.mjs';

const enabled=process.env.VP_OPS_LOCAL_INTEGRATION==='true';
test('real GoTrue Cookie → controlled Ops → separate reviewer → atomic audit → restart/revocation', {skip:!enabled,timeout:240000}, async t=>{
  const state=identityLocalEnv();
  assert.ok(state && /^supabase_db_vp-ops-review-/.test(state.DB_CONTAINER),'dedicated Ops test instance required');
  const key=state.PUBLISHABLE_KEY||state.ANON_KEY;
  const api='http://127.0.0.1:'+(process.env.VP_OPS_API_PORT||'56631');
  const sql=input=>execFileSync('docker',['exec','-i',state.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
  const admin=createClient(state.API_URL,state.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  let server;
  async function start(){
    server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',new URL(api).port],{env:{...process.env,OPS_LOCAL_REVIEW:'1',NEXT_PUBLIC_SUPABASE_URL:state.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key},stdio:['ignore','pipe','pipe']});
    const log=createWriteStream('/tmp/vpj14-ops-api.log',{flags:'a'});server.stdout.pipe(log);server.stderr.pipe(log);
    for(let i=0;i<100;i++){try{const r=await fetch(api+'/api/ops/review');if(r.headers.get('content-type')?.includes('application/json'))return;}catch{}await new Promise(r=>setTimeout(r,300));}
    throw new Error('Ops API did not become ready');
  }
  async function stop(){if(!server)return;const child=server;server=null;const ended=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await ended;}
  t.after(stop);
  await start();
  const ids=[];
  t.after(()=>{sql('update knowledge_review_private.settings set enabled=false; delete from knowledge_review_private.members;');});
  async function actor(label,member){
    const email='vpj14-'+label+'-'+randomUUID()+'@example.test',password='Local-review-'+randomUUID();
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{ops:true,role:'admin'}});
    assert.equal(created.error,null,'synthetic GoTrue account');const id=created.data.user.id;ids.push(id);
    const jar=new Map();
    const auth=createServerClient(state.API_URL,key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(c=>jar.set(c.name,c.value))}});
    const signed=await auth.auth.signInWithPassword({email,password});assert.equal(signed.error,null);
    const token=signed.data.session.access_token;
    const jwt=createClient(state.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token}}});
    if(member)sql(`insert into knowledge_review_private.members(actor_id,active) values('${id}',true);`);
    const cookie=()=>[...jar].map(([name,value])=>name+'='+value).join('; ');
    return {id,auth,jwt,token,cookie,email,password};
  }
  const author=await actor('author',true), reviewer=await actor('reviewer',true), reviewer2=await actor('reviewer2',true), outsider=await actor('outsider',false);
  const call=async(who,body,headers={})=>{
    const r=await fetch(api+'/api/ops/review',{method:body?'POST':'GET',headers:{...(who?{Cookie:who.cookie()}:{}),...(body?{'Content-Type':'application/json',Origin:api}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
    return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};
  };
  const make=title=>({action:'submit',operationId:randomUUID(),candidateId:randomUUID(),title,content:'Synthetic review text. Never published.'});
  const review=(candidateId,decision='reviewed')=>({action:'review',operationId:randomUUID(),candidateId,expectedVersion:1,decision,note:'Synthetic independent review.'});
  await t.test('default disabled; real cookies and membership required; metadata is not membership',async()=>{
    assert.equal((await call(author)).status,503);
    sql('update knowledge_review_private.settings set enabled=true;');
    assert.equal((await call(null)).status,401);
    assert.equal((await call(outsider)).status,403);
    assert.equal((await call(author,null,{Authorization:'Bearer '+author.token})).status,401);
    const ok=await call(author);assert.equal(ok.status,200);assert.match(ok.cache,/no-store/);assert.equal(ok.body.data.actorId,author.id);
    assert.ok((await outsider.jwt.rpc('ops_review_workspace',{p_input:{action:'list'}})).error,'direct RPC also checks membership');
    assert.ok((await author.jwt.schema('knowledge_review_private').from('members').select('*')).error,'private schema inaccessible');
    sql(`insert into public.user_profiles(owner_id,display_name) values('${outsider.id}','synthetic outsider') on conflict(owner_id) do update set display_name='synthetic outsider';`);
    const profiles=await author.jwt.from('user_profiles').select('owner_id');assert.equal(profiles.error,null);assert.ok(!profiles.data.some(r=>r.owner_id===outsider.id),'Ops membership does not grant customer reads');
  });
  const submitted=make('One synthetic candidate');
  await t.test('strict input, cross-origin, idempotency and author separation',async()=>{
    assert.equal((await call(author,submitted,{Origin:'https://untrusted.example'})).status,403);
    assert.equal((await call(author,{...submitted,authorId:reviewer.id})).status,400);
    assert.equal((await call(author,submitted,{'X-Ops-Expected-Actor':reviewer.id})).status,403,'credential mismatch assertion cannot become authority');
    assert.equal((await call(author,{...submitted,title:' '})).status,400);
    const both=await Promise.all([call(author,submitted),call(author,submitted)]);assert.deepEqual(both.map(x=>x.status),[200,200]);assert.deepEqual(both[0].body,both[1].body);
    assert.equal(both[0].body.data.authorId,author.id);assert.equal(both[0].body.data.audit.length,1);
    assert.equal((await call(author,{...submitted,content:'Different replay'})).status,409);
    assert.equal((await call(author,review(submitted.candidateId))).status,403);
    assert.equal((await call(reviewer,{...review(submitted.candidateId),expectedVersion:2})).status,400);
  });
  const accepted=review(submitted.candidateId);
  await t.test('different reviewer; reviewed remains unpublished; restart read',async()=>{
    const result=await call(reviewer,accepted);assert.equal(result.status,200);assert.equal(result.body.data.status,'reviewed');assert.equal(result.body.data.reviewerId,reviewer.id);
    assert.equal(result.body.data.published,false);assert.equal(result.body.data.retrievalEligible,false);assert.equal(result.body.data.audit.length,2);
    assert.deepEqual((await call(reviewer,accepted)).body,result.body);
    assert.equal((await call(reviewer2,review(submitted.candidateId,'rejected'))).status,409);
    await stop();
    execFileSync('docker',['restart',state.DB_CONTAINER],{stdio:['ignore','pipe','pipe']});
    for(let i=0;i<80;i++){try{if(sql('select 1;')==='1')break;}catch{}await new Promise(r=>setTimeout(r,250));}
    await start();
    let reread;
    for(let i=0;i<40;i++){reread=await call(reviewer);if(reread.status===200)break;await new Promise(r=>setTimeout(r,250));}
    assert.equal(reread.status,200);assert.deepEqual(reread.body.data.candidates.find(c=>c.id===submitted.candidateId),result.body.data);
  });
  await t.test('actual injected audit failure rolls back candidate/review and receipt',async()=>{
    const draft=make('Audit rollback candidate');assert.equal((await call(author,draft)).status,200);
    sql("create function knowledge_review_private.test_fail_audit() returns trigger language plpgsql as $$ begin raise exception 'synthetic audit failure'; end $$; create trigger test_fail_audit before insert on knowledge_review_private.audit for each row execute function knowledge_review_private.test_fail_audit();");
    try{
      const failed=make('Must roll back');assert.equal((await call(author,failed)).status,503);
      assert.equal(sql(`select count(*) from knowledge_review_private.candidates where id='${failed.candidateId}';`),'0');
      const attempted=review(draft.candidateId);assert.equal((await call(reviewer,attempted)).status,503);
      assert.equal(sql(`select status||':'||version from knowledge_review_private.candidates where id='${draft.candidateId}';`),'pending:1');
      assert.equal(sql(`select count(*) from knowledge_review_private.receipts where operation_id in ('${failed.operationId}','${attempted.operationId}');`),'0');
      assert.equal(sql(`select count(*) from knowledge_review_private.audit where candidate_id='${draft.candidateId}';`),'1');
    }finally{sql('drop trigger test_fail_audit on knowledge_review_private.audit; drop function knowledge_review_private.test_fail_audit();');}
    assert.equal((await call(reviewer,review(draft.candidateId))).status,200,'normal review resumes after fault removal');
  });
  await t.test('concurrent opposing reviews have exactly one committed audit',async()=>{
    const draft=make('Concurrent review');assert.equal((await call(author,draft)).status,200);
    const results=await Promise.all([call(reviewer,review(draft.candidateId)),call(reviewer2,review(draft.candidateId,'rejected'))]);assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
    assert.equal(sql(`select count(*) from knowledge_review_private.audit where candidate_id='${draft.candidateId}';`),'2');
  });
  if(process.env.VP_OPS_BROWSER_EXECUTABLE) await t.test('real browser lost acknowledgement retries original operation without second candidate',async()=>{
    const {chromium}=await import('@playwright/test');
    const browser=await chromium.launch({executablePath:process.env.VP_OPS_BROWSER_EXECUTABLE,headless:true});
    try {
      const page=await browser.newPage({viewport:{width:390,height:844}});
      await page.goto(api+'/auth/sign-in?returnTo=/ops/review');
      await page.getByRole('textbox',{name:'邮箱',exact:true}).fill(author.email);
      await page.getByRole('textbox',{name:'密码',exact:true}).fill(author.password);
      await page.getByRole('button',{name:'登录',exact:true}).click();
      await page.waitForURL(api+'/ops/review');
      await page.getByRole('textbox',{name:'标题',exact:true}).waitFor();
      let dropped=false;const payloads=[];
      await page.route('**/api/ops/review',async route=>{
        if(route.request().method()!=='POST')return route.continue();
        assert.equal(route.request().headers()['x-ops-expected-actor'],author.id);
        payloads.push(route.request().postDataJSON());
        if(!dropped){dropped=true;const committed=await route.fetch();assert.equal(committed.status(),200);return route.abort('failed');}
        return route.continue();
      });
      await page.getByRole('textbox',{name:'标题',exact:true}).fill('Lost acknowledgement browser candidate');
      await page.getByRole('textbox',{name:'候选正文',exact:true}).fill('Synthetic real-browser lost-response proof.');
      await page.getByRole('button',{name:'提交候选',exact:true}).click();
      const retry=page.getByRole('button',{name:'重试同一操作',exact:true});await retry.waitFor();
      assert.equal(await page.getByRole('textbox',{name:'标题',exact:true}).count(),0,'no new submission while acknowledgement is unknown');
      await page.screenshot({path:'/tmp/vpj14-unknown-ack-mobile.png',fullPage:true});
      await retry.click();
      await page.getByRole('textbox',{name:'标题',exact:true}).waitFor();
      assert.equal(payloads.length,2);assert.deepEqual(payloads[0],payloads[1]);
      assert.equal(sql(`select count(*) from knowledge_review_private.candidates where id='${payloads[0].candidateId}';`),'1');
      assert.equal(sql(`select count(*) from knowledge_review_private.audit where candidate_id='${payloads[0].candidateId}';`),'1');
      assert.equal(sql(`select count(*) from knowledge_review_private.receipts where operation_id='${payloads[0].operationId}';`),'1');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
    }finally{await browser.close();}
  });
  await t.test('current member, session and global disable checked before successful receipt replay',async()=>{
    sql(`update knowledge_review_private.members set active=false,revision=revision+1 where actor_id='${reviewer.id}';`);
    assert.equal((await call(reviewer)).status,403);assert.equal((await call(reviewer,accepted)).status,403);
    assert.ok((await reviewer.jwt.rpc('ops_review_workspace',{p_input:accepted})).error,'JWT direct replay revoked too');
    sql(`update knowledge_review_private.members set active=true,revision=revision+1 where actor_id='${reviewer.id}';`);
    assert.equal((await call(reviewer,accepted)).status,200);
    sql('update knowledge_review_private.settings set enabled=false;');assert.equal((await call(reviewer,accepted)).status,503);sql('update knowledge_review_private.settings set enabled=true;');
    const session=JSON.parse(Buffer.from(reviewer.token.split('.')[1],'base64url').toString()).session_id;
    const staleCookie=reviewer.cookie();
    const signedOut=await reviewer.auth.auth.signOut({scope:'global'});assert.equal(signedOut.error,null,'real GoTrue sign-out');
    reviewer.cookie=()=>staleCookie;
    assert.equal(sql(`select count(*) from auth.sessions where id='${session}' and user_id='${reviewer.id}';`),'0','GoTrue removed the session');
    assert.equal((await call(reviewer,accepted)).status,401);assert.equal((await call(reviewer)).status,401);
  });
});
