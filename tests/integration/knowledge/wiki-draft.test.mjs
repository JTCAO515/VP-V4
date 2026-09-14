import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,readdirSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID as uuid} from 'node:crypto';
import {completeWikiGenerationJob} from '../../../lib/server/jobs/wiki-generation-complete.ts';
import {runWikiGenerationJob} from '../../../lib/server/jobs/wiki-generation-job.ts';

// Native local PostgreSQL alternative when Docker is unavailable. Never accepts a
// remote connection string. Auth tables/claims are the existing SQL fixture, not GoTrue.
const enabled=!!process.env.VP_WIKI_PG_BIN && !!process.env.VP_WIKI_PG_MODULE;
test('Wiki: native PostgreSQL migrations, full draft persistence, conflicts, ACLs and restart', {skip:!enabled,timeout:180000},async t=>{
  const bin=process.env.VP_WIKI_PG_BIN;
  const {default:pg}=await import(pathToFileURL(process.env.VP_WIKI_PG_MODULE).href);
  const root=mkdtempSync(join(tmpdir(),'vpwiki-db-'));
  const data=join(root,'data');let running=false;
  const control=(...args)=>execFileSync(join(bin,'pg_ctl'),['-D',data,...args],{stdio:['ignore','pipe','pipe']});
  t.after(()=>{try{if(running)control('stop','-m','fast','-w');}finally{rmSync(root,{recursive:true,force:true});}});
  execFileSync(join(bin,'initdb'),['-D',data,'-U','postgres','-A','trust','--no-locale','-E','UTF8'],{stdio:['ignore','pipe','pipe']});
  const start=()=>{control('start','-w','-l',join(root,'postgres.log'),'-o',`-c listen_addresses='' -c unix_socket_directories='${root}' -c unix_socket_permissions=0700`);running=true;};
  start();
  const db=async sql=>{const c=new pg.Client({host:root,user:'postgres',database:'postgres'});await c.connect();try{const results=await c.query(sql);return Array.isArray(results)?results.at(-1).rows:results.rows;}finally{await c.end();}};
  await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
  await db('create schema extensions; create extension pgcrypto with schema extensions;');
  const migration='20260914130000_vpj_75_wiki_draft_content.sql';
  for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f<migration).sort()){
    try{await db('begin;'+readFileSync('supabase/migrations/'+file,'utf8')+'commit;');}catch(error){throw new Error('Migration failed: '+file+': '+error.message);}
  }
  const actor=async(member)=>{const a={id:uuid(),session:uuid()};await db(`insert into auth.users values('${a.id}');insert into auth.sessions(id,user_id) values('${a.session}','${a.id}');${member?`insert into knowledge_review_private.members(actor_id,active) values('${a.id}',true);`:''}`);return a;};
  const author=await actor(true),outsider=await actor(false);
  const lit=x=>"'"+String(x).replaceAll("'","''")+"'";
  const prefix=a=>`set request.jwt.claim.sub='${a.id}';set request.jwt.claims='${JSON.stringify({session_id:a.session})}';set role authenticated;`;
  const call=(a,name,input)=>db(prefix(a)+`select public.${name}(${lit(JSON.stringify(input))}::jsonb) as result;`).then(rows=>rows[0].result);
  const rpc={call:async(name,{p_input})=>({data:await call(author,name,p_input),error:null})};
  await db('update knowledge_review_private.settings set enabled=true;');
  const sourceId=uuid();const source={sourceKey:'wiki_synthetic',revisionLabel:'r1',publisher:'Synthetic test',uri:'urn:vpj15:synthetic:wiki',locator:'paragraph 1',snippet:'Controlled source material.',usageDeclaration:'Synthetic test only'};
  await db(`insert into knowledge_review_private.source_revisions(id,source_key,revision_label,declaration,snippet_hash,submitted_by) values('${sourceId}','wiki_synthetic','r1',${lit(JSON.stringify(source))},'${'a'.repeat(64)}','${author.id}');`);
  const pageKey='source_summary:synthetic';
  const claim=(digest)=>({action:'claim',operationId:uuid(),pageType:'source_summary',pageKey,sourceRevisionIds:[sourceId],promptVersion:'vp-wiki-generation-v1',configDigest:'a'.repeat(64),inputDigest:digest});
  const legacyClaim=await call(author,'ops_wiki_generation_v1',claim('1'.repeat(64)));
  const metadata=job=>({operationId:uuid(),jobId:job.jobId,expectedVersion:job.expectedVersion,sourceRevisionIds:[sourceId],statementRefs:[],promptVersion:'vp-wiki-generation-v1',configDigest:'a'.repeat(64),generatedAt:'2026-09-14T00:00:00Z',changeNote:'Short change note, not the body'});
  const old=metadata(legacyClaim);const {operationId,jobId,...fields}=old;
  const oldInput={action:'complete',operationId,jobId,outcome:{kind:'succeeded',costTokens:10,...fields}};
  const oldReceipt=await call(author,'ops_wiki_generation_v1',oldInput);
  const before=(await db('select row_to_json(r) as r from knowledge_review_private.wiki_page_revisions r;'))[0].r;
  const upgrade=readFileSync('supabase/migrations/'+migration,'utf8');
  await t.test('upgrade is transactionally reversible and preserves historical data/receipt',async()=>{
    await db('begin;'+upgrade+'rollback;');
    assert.equal((await db("select count(*)::int n from information_schema.columns where table_schema='knowledge_review_private' and table_name='wiki_page_revisions' and column_name='draft_content';"))[0].n,0);
    await db('begin;'+upgrade+'commit;');
    const after=(await db('select row_to_json(r) as r from knowledge_review_private.wiki_page_revisions r;'))[0].r;
    assert.equal(after.draft_content,null);delete after.draft_content;assert.deepEqual(after,before);
    assert.deepEqual(await call(author,'ops_wiki_generation_v1',oldInput),oldReceipt);
    assert.equal((await call(author,'ops_wiki_read_v1',{pageKey})).revisions[0].draftContent,null);
  });
  const draft={summary:'中'.repeat(600),gaps:['未核实条件。','Gap '.repeat(30).trim()]};let providerCalls=0;
  const outcome=await runWikiGenerationJob({pageType:'source_summary',pageKey,sourceText:source.snippet,promptVersion:'vp-wiki-generation-v1',configDigest:'a'.repeat(64),maxOutputTokens:1024,timeoutMs:5000,provider:{provider:'qwen',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',configurationId:uuid(),configurationVersion:1,timeoutMs:5000}}, {credential:()=> 'synthetic',recordDestination:async()=>{},fetch:async()=>{providerCalls++;return Response.json({model:'qwen3.7-plus-2026-05-26',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(draft)}}],usage:{prompt_tokens:10,completion_tokens:200,total_tokens:210}});}},new AbortController().signal);
  assert.equal(outcome.kind,'succeeded');
  const claimed=await call(author,'ops_wiki_generation_v1',claim(outcome.inputDigest));const completion=metadata(claimed);
  await t.test('strict content rejects missing/extra/null/whitespace/UTF16-overlong without partial writes',async()=>{
    for(const invalid of [undefined,null,{summary:'ok',gaps:[],published:true},{summary:'\n',gaps:[]},{summary:'\ttext',gaps:[]},{summary:'😀'.repeat(301),gaps:[]},{summary:'ok',gaps:['x\u00a0']},{summary:'ok',gaps:Array(6).fill('x')}]){
      const {operationId:op,jobId:jid,...rest}=completion;
      await assert.rejects(call(author,'ops_wiki_generation_v1',{action:'complete',operationId:uuid(),jobId:jid,outcome:{kind:'succeeded',costTokens:1,...rest,...(invalid===undefined?{}:{draftContent:invalid})}}),/INVALID_INPUT/);
    }
    assert.equal((await call(author,'ops_wiki_read_v1',{pageKey})).version,1);
    assert.equal((await db(`select status from knowledge_review_private.wiki_generation_jobs where id='${claimed.jobId}';`))[0].status,'running');
  });
  await t.test('injected receipt failure rolls back body, version and job completion',async()=>{
    await db("create function knowledge_review_private.wiki_test_fail() returns trigger language plpgsql as $$begin raise exception 'injected receipt failure'; end$$;create trigger wiki_test_fail before insert on knowledge_review_private.receipts for each row execute function knowledge_review_private.wiki_test_fail();");
    try { await assert.rejects(completeWikiGenerationJob(rpc,completion,outcome),/injected receipt failure/); }
    finally { await db('drop trigger wiki_test_fail on knowledge_review_private.receipts;drop function knowledge_review_private.wiki_test_fail();'); }
    assert.equal((await call(author,'ops_wiki_read_v1',{pageKey})).version,1);
    assert.equal((await db(`select status from knowledge_review_private.wiki_generation_jobs where id='${claimed.jobId}';`))[0].status,'running');
  });
  const saveFixture=(name,read)=>{if(process.env.VP_WIKI_FIXTURE_DIR){mkdirSync(process.env.VP_WIKI_FIXTURE_DIR,{recursive:true});writeFileSync(join(process.env.VP_WIKI_FIXTURE_DIR,name+'.json'),JSON.stringify(read));}};
  let saved;
  await t.test('worker → completion adapter → atomic database → reader, exact long body and source',async()=>{
    saved=await completeWikiGenerationJob(rpc,completion,outcome);
    assert.deepEqual(await completeWikiGenerationJob(rpc,completion,outcome),saved);
    assert.equal(providerCalls,1);
    const read=await call(author,'ops_wiki_read_v1',{pageKey});assert.equal(read.version,2);
    assert.deepEqual(read.revisions[0].draftContent,draft);assert.equal(read.revisions[1].draftContent,null);
    assert.deepEqual(read.revisions[0].sources[0].declaration,source);saveFixture('legacy',read);
    assert.equal(read.revisions[0].validationStatus,'draft');
    assert.equal((await call(author,'ops_wiki_generation_v1',claim(outcome.inputDigest))).kind,'already_succeeded');
    await assert.rejects(completeWikiGenerationJob(rpc,{...completion,changeNote:'different same receipt'},outcome),/OPS_CONFLICT/);
    await assert.rejects(completeWikiGenerationJob(rpc,{...completion,operationId:uuid()},outcome),/OPS_CONFLICT/);
  });
  await t.test('native database process restart retains exact body and same receipt',async()=>{
    control('stop','-m','fast','-w');running=false;start();
    assert.deepEqual((await call(author,'ops_wiki_read_v1',{pageKey})).revisions[0].draftContent,draft);
    assert.deepEqual(await completeWikiGenerationJob(rpc,completion,outcome),saved);
  });
  await t.test('concurrent completions at one expectedVersion commit one revision',async()=>{
    const a=metadata(await call(author,'ops_wiki_generation_v1',claim('3'.repeat(64))));
    const b=metadata(await call(author,'ops_wiki_generation_v1',claim('4'.repeat(64))));
    const results=await Promise.allSettled([completeWikiGenerationJob(rpc,a,{...outcome,output:{summary:'Updated synthetic summary. 尚待人工核实。 <script>alert(1)</script>',gaps:['New conditional gap.']}}),completeWikiGenerationJob(rpc,b,{...outcome,output:{summary:'Updated synthetic summary. 尚待人工核实。 <script>alert(1)</script>',gaps:['New conditional gap.']}})]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.match(results.find(r=>r.status==='rejected').reason.message,/OPS_CONFLICT/);
    const latest=await call(author,'ops_wiki_read_v1',{pageKey});assert.equal(latest.version,3);saveFixture('changed',latest);
  });
  await t.test('read and receipt replay reject outsiders, revocation, disabled Ops and direct table access',async()=>{
    await assert.rejects(call(outsider,'ops_wiki_read_v1',{pageKey}),/OPS_FORBIDDEN/);
    for(const role of ['anon','authenticated','service_role'])await assert.rejects(db(`set role ${role};select * from knowledge_review_private.wiki_page_revisions;`),/permission denied/);
    for(const role of ['anon','service_role'])await assert.rejects(db(`set role ${role};select public.ops_wiki_read_v1('{}');`),/permission denied/);
    await db(`update knowledge_review_private.members set active=false where actor_id='${author.id}';`);
    await assert.rejects(call(author,'ops_wiki_read_v1',{pageKey}),/OPS_FORBIDDEN/);
    await assert.rejects(completeWikiGenerationJob(rpc,completion,outcome),/OPS_FORBIDDEN/);
    await db(`update knowledge_review_private.members set active=true where actor_id='${author.id}';update knowledge_review_private.settings set enabled=false;`);
    await assert.rejects(call(author,'ops_wiki_read_v1',{}),/OPS_DISABLED/);
  });
});
