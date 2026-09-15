import {runWikiStatementProposalJob} from "../../../lib/server/jobs/wiki-statement-proposal-job.ts";
import http from "node:http";
import {Readable} from "node:stream";
import {handleOpsRequest} from "../../../lib/server/knowledge/review/http-workspace.ts";
import {handleWikiRequest} from "../../../lib/server/knowledge/wiki/http-wiki.ts";
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
test('Wiki: native PostgreSQL migrations, full draft persistence, conflicts, ACLs and restart', {skip:!enabled,timeout:process.env.VP_WIKI_BROWSER_FIXTURE==='1'?900000:180000},async t=>{
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
    if(file==='20260914100000_vpj_19_363_place_identity.sql'){
      const batch=['20260914110000_vpj_75_359_wiki_schema.sql','20260914120000_vpj_75_359_wiki_dispatcher.sql',migration].map(f=>readFileSync('supabase/migrations/'+f,'utf8')).join('\n');
      await db(`insert into knowledge_review_private.source_revisions(source_key,revision_label,declaration,snippet_hash,submitted_by) values('wiki_preupgrade','r1','{"snippet":"Preserve this synthetic historical material"}','${'b'.repeat(64)}','${uuid()}');`);
      const before=await db("select row_to_json(s) as source from knowledge_review_private.source_revisions s order by id;");
      await db('begin;'+batch+'rollback;');
      assert.equal((await db("select to_regclass('knowledge_review_private.wiki_pages') is null as absent;"))[0].absent,true);
      assert.deepEqual(await db("select row_to_json(s) as source from knowledge_review_private.source_revisions s order by id;"),before);
      console.log('Staging 50-to-53 combined three-migration rollback PASS');
    }
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
  const linkSql=readFileSync('supabase/migrations/20260914140000_vpj_75_wiki_statement_review.sql','utf8');
  await t.test('statement-link migration rollback preserves prior reader and receipts',async()=>{
    await db('begin;'+linkSql+'rollback;');
    assert.equal((await db("select to_regclass('knowledge_review_private.wiki_statement_candidates') is null as absent;"))[0].absent,true);
    await db('begin;'+linkSql+'commit;');
    await db('update knowledge_review_private.settings set enabled=true;');
    assert.deepEqual(await completeWikiGenerationJob(rpc,completion,outcome),saved);
  });
  const currentWiki=await call(author,'ops_wiki_read_v1',{pageKey});
  const currentRevision=currentWiki.revisions[0];
  const statement={schemaVersion:'knowledge-statement/1',assertion:{subjectId:'synthetic_museum',predicate:'requires_document',objectId:'identity_document',conditions:['entry'],exclusions:['exempt']},scope:{cities:['shanghai'],scene:'attraction',audience:'international_independent_traveler'},expressions:{zh:{text:'需提供身份证明。',conditions:['入场时'],exclusions:['豁免者除外']},en:{text:'Bring ID.',conditions:['On entry'],exclusions:['Unless exempt']}},sources:[source]};
  const input={action:'submit_wiki_statement',operationId:uuid(),candidateId:uuid(),wikiRevisionId:currentRevision.id,expectedWikiVersion:currentWiki.version,title:'Wiki-based synthetic statement',statement};
  let candidate;
  await t.test('exact source/version + identical input dedup under new operation IDs',async()=>{
    candidate=await call(author,'ops_review_workspace',input);
    assert.equal(candidate.status,'pending');assert.equal(candidate.published,false);
    assert.deepEqual(candidate.wikiOrigin,{pageKey,revisionId:currentRevision.id,version:3,method:'operator_statement'});
    assert.deepEqual(await call(author,'ops_review_workspace',input),candidate);
    const duplicate=await call(author,'ops_review_workspace',{...input,operationId:uuid(),candidateId:uuid()});
    assert.equal(duplicate.id,candidate.id);
    assert.equal((await db('select count(*)::int n from knowledge_review_private.wiki_statement_candidates;'))[0].n,1);
    for(const change of [{expectedWikiVersion:2},{wikiRevisionId:currentWiki.revisions[1].id},{statement:{...statement,sources:[{...source,snippet:'Invented source text'}]}},{statement:{...statement,sources:[{...source,sourceKey:'invented_source'}]}}])await assert.rejects(call(author,'ops_review_workspace',{...input,operationId:uuid(),candidateId:uuid(),...change}),/OPS_CONFLICT/);
    await assert.rejects(call(author,'ops_review_workspace',{...input,title:'Changed same receipt'}),/OPS_CONFLICT/);
  });
  await t.test('concurrent equivalent submissions create one candidate across operation IDs',async()=>{
    const concurrent={...input,statement:{...statement,assertion:{...statement.assertion,objectId:'parallel_document'}}};
    const results=await Promise.all([call(author,'ops_review_workspace',{...concurrent,operationId:uuid(),candidateId:uuid()}),call(author,'ops_review_workspace',{...concurrent,operationId:uuid(),candidateId:uuid()})]);
    assert.equal(results[0].id,results[1].id);
    assert.equal((await db(`select count(*)::int n from knowledge_review_private.wiki_statement_candidates where candidate_id='${results[0].id}';`))[0].n,1);
  });
  await t.test('link failure rolls back candidate, statement, audit and receipt together',async()=>{
    await db("create function knowledge_review_private.wiki_link_fail() returns trigger language plpgsql as $$begin raise exception 'injected link failure';end$$;create trigger wiki_link_fail before insert on knowledge_review_private.wiki_statement_candidates for each row execute function knowledge_review_private.wiki_link_fail();");
    const broken={...input,operationId:uuid(),candidateId:uuid(),statement:{...statement,assertion:{...statement.assertion,objectId:'other_document'}}};
    try{await assert.rejects(call(author,'ops_review_workspace',broken),/injected link failure/);}finally{await db('drop trigger wiki_link_fail on knowledge_review_private.wiki_statement_candidates;drop function knowledge_review_private.wiki_link_fail();');}
    for(const table of ['candidates','statements','audit'])assert.equal((await db(`select count(*)::int n from knowledge_review_private.${table} where ${table==='candidates'?'id':'candidate_id'}='${broken.candidateId}';`))[0].n,0);
    assert.equal((await db(`select count(*)::int n from knowledge_review_private.receipts where operation_id='${broken.operationId}';`))[0].n,0);
  });
  const reviewer=await actor(true);
  await t.test('existing independent review/publication/reader/revocation keeps exact source and conditions',async()=>{
    const review={action:'review',operationId:uuid(),candidateId:candidate.id,expectedVersion:1,decision:'reviewed',note:'Synthetic independent review'};
    await assert.rejects(call(author,'ops_review_workspace',review),/OPS_SELF_REVIEW/);
    const reviewed=await call(reviewer,'ops_review_workspace',review);assert.equal(reviewed.status,'reviewed');assert.deepEqual(reviewed.wikiOrigin,candidate.wikiOrigin);
    const publish={action:'publish_statement',operationId:uuid(),candidateId:candidate.id,expectedVersion:2,expiresAt:new Date(Date.now()+3600000).toISOString(),useBasis:'original_factual_summary',useNote:'Synthetic review only'};
    await assert.rejects(call(author,'ops_review_workspace',publish),/OPS_SELF_REVIEW/);
    await db('update knowledge_review_private.publication_settings set enabled=true;');
    assert.equal((await call(outsider,'knowledge_read_v1',{city:'shanghai',scene:'attraction',locale:'en'})).statements.length,0);
    const published=await call(reviewer,'ops_review_workspace',publish);assert.equal(published.operationOutcome,'published');
    for(const locale of ['zh','en']){
      const read=await call(outsider,'knowledge_read_v1',{city:'shanghai',scene:'attraction',locale});
      assert.equal(read.statements.length,1);assert.equal(read.statements[0].text,statement.expressions[locale].text);
      assert.deepEqual(read.statements[0].conditions,statement.expressions[locale].conditions);
      assert.deepEqual(read.statements[0].exclusions,statement.expressions[locale].exclusions);
      assert.equal(read.statements[0].sources[0].sourceRevisionId,sourceId);
    }
    await call(reviewer,'ops_review_workspace',{action:'revoke_statement',operationId:uuid(),candidateId:candidate.id,expectedPublicationVersion:1,note:'Synthetic withdrawal'});
    assert.equal((await call(outsider,'knowledge_read_v1',{city:'shanghai',scene:'attraction',locale:'en'})).statements.length,0);
  });
  await t.test('new route denies outsider, revoked membership and direct/private bypass',async()=>{
    await assert.rejects(call(outsider,'ops_review_workspace',input),/OPS_FORBIDDEN/);
    await db(`update knowledge_review_private.members set active=false where actor_id='${author.id}';`);
    await assert.rejects(call(author,'ops_review_workspace',input),/OPS_FORBIDDEN/);
    for(const role of ['anon','authenticated','service_role']){
      await assert.rejects(db(`set role ${role};select * from knowledge_review_private.wiki_statement_candidates;`),/permission denied/);
      await assert.rejects(db(`set role ${role};select knowledge_review_private.ops_review_workspace_before_wiki_v1('{}');`),/permission denied/);
    }
  });

  const proposalMigration=readFileSync('supabase/migrations/20260914150000_vpj_75_wiki_statement_proposals.sql','utf8');
  await t.test('structured proposal migration rolls back without changing legacy bodies/receipts',async()=>{
    await db(`update knowledge_review_private.members set active=true where actor_id='${author.id}';`);
    const before=await call(author,'ops_wiki_read_v1',{pageKey});
    await db('begin;'+proposalMigration+'rollback;');
    assert.deepEqual(await call(author,'ops_wiki_read_v1',{pageKey}),before);
    await db('begin;'+proposalMigration+'commit;');
    assert.deepEqual(await completeWikiGenerationJob(rpc,completion,outcome),saved);
  });
  const proposalSourceId=uuid();const proposalSource={...source,sourceKey:'proposal_source',snippet:'😀 Shanghai museum: bring ID on entry unless exempt.'};
  await db(`insert into knowledge_review_private.source_revisions(id,source_key,revision_label,declaration,snippet_hash,submitted_by) values('${proposalSourceId}','proposal_source','r1',${lit(JSON.stringify(proposalSource))},'${'d'.repeat(64)}','${author.id}');`);
  const {sources:ignoredSources,...modelStatement}=statement;
  const rawProposal={summary:'Synthetic museum entry requirements.',gaps:['Other cities are not covered.'],proposals:[{statement:modelStatement,evidence:[{sourceRevisionId:proposalSourceId,quote:'bring ID on entry unless exempt.'}]}]};
  const proposalResult=await runWikiStatementProposalJob({dataClass:'c0_synthetic',sources:[{id:proposalSourceId,declaration:proposalSource}],configDigest:'a'.repeat(64),provider:{provider:'qwen',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',configurationId:uuid(),configurationVersion:1,timeoutMs:5000},maxOutputTokens:2048,timeoutMs:5000},{credential:()=> 'synthetic',recordDestination:async()=>{},fetch:async()=>Response.json({model:'qwen3.7-plus-2026-05-26',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(rawProposal)}}],usage:{prompt_tokens:30,completion_tokens:60,total_tokens:90}})},new AbortController().signal);
  assert.equal(proposalResult.kind,'succeeded');
  const proposalPageKey='source_summary:proposal_fixture';
  const proposalClaim=await call(author,'ops_wiki_generation_v1',{...claim(proposalResult.inputDigest),pageKey:proposalPageKey,sourceRevisionIds:[proposalSourceId],promptVersion:'vp-wiki-statement-proposals-v1'});
  const proposalCompletion={...metadata(proposalClaim),sourceRevisionIds:[proposalSourceId],promptVersion:'vp-wiki-statement-proposals-v1'};
  await t.test('database rejects invented proposal source metadata, quote and Unicode offsets atomically',async()=>{
    const base=proposalResult.output;const p=base.statementProposals[0];
    for(const change of [
      {...p,statement:{...p.statement,sources:[{...proposalSource,publisher:'Invented publisher'}]}},
      {...p,evidence:p.evidence.map(e=>({...e,startOffset:e.startOffset+1,endOffset:e.endOffset+1}))},
      {...p,evidence:p.evidence.map(e=>({...e,sourceRevisionId:sourceId}))},
    ]){
      const invalid={...proposalResult,output:{...base,statementProposals:[change]}};
      await assert.rejects(completeWikiGenerationJob(rpc,{...proposalCompletion,operationId:uuid()},invalid),/INVALID_INPUT/);
    }
    assert.equal((await call(author,'ops_wiki_read_v1',{pageKey:proposalPageKey})).version,0);
  });
  let proposalRead;
  await t.test('model protocol → exact quote binding → complete → restart → full proposal readback',async()=>{
    const completed=await completeWikiGenerationJob(rpc,proposalCompletion,proposalResult);
    assert.deepEqual(await completeWikiGenerationJob(rpc,proposalCompletion,proposalResult),completed);
    control('stop','-m','fast','-w');running=false;start();
    proposalRead=await call(author,'ops_wiki_read_v1',{pageKey:proposalPageKey});
    assert.deepEqual(proposalRead.revisions[0].draftContent,proposalResult.output);
    assert.equal(proposalRead.revisions[0].validationStatus,'draft');
  });
  await t.test('operator-edited model proposal retains its index and exact source without publication',async()=>{
    const selected={...input,operationId:uuid(),candidateId:uuid(),wikiRevisionId:proposalRead.revisions[0].id,expectedWikiVersion:1,wikiProposalIndex:0,statement:proposalResult.output.statementProposals[0].statement,title:'Generated proposal for operator review'};
    const submitted=await call(author,'ops_review_workspace',selected);
    assert.equal(submitted.wikiOrigin.proposalIndex,0);assert.equal(submitted.wikiOrigin.method,'operator_statement');assert.equal(submitted.published,false);
    assert.deepEqual(submitted.statement.sources,[proposalSource]);
    await assert.rejects(call(author,'ops_review_workspace',{...selected,operationId:uuid(),candidateId:uuid(),wikiProposalIndex:4}),/OPS_CONFLICT/);
    await assert.rejects(call(author,'ops_review_workspace',{...selected,operationId:uuid(),candidateId:uuid(),wikiRevisionId:currentRevision.id,expectedWikiVersion:3}),/OPS_CONFLICT/);
  });
  if(process.env.VP_WIKI_BROWSER_FIXTURE==='1') {
    await db(`update knowledge_review_private.members set active=true where actor_id='${author.id}';`);
    await new Promise((resolve,reject)=>{
      let dropNext=false;
      const server=http.createServer(async(req,res)=>{
        try {
          if(req.url==='/fixture/drop-next' && req.method==='POST'){dropNext=true;res.end('armed');return;}
          if(req.url==='/fixture/stop' && req.method==='POST'){res.end('stopped');server.close(resolve);return;}
          if(req.url.startsWith('/api/ops/')) {
            const request=new Request('http://127.0.0.1:3197'+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Readable.toWeb(req),duplex:'half'}:{})});
            const createRpc=()=>({authenticate:async()=>author.id,call:async(name,{p_input})=>{try{return {data:await call(author,name,p_input),error:null};}catch(error){return {data:null,error:{message:error.message}};}}});
            const result=req.url.startsWith('/api/ops/wiki')?await handleWikiRequest(request,{enabled:true,createRpc}):await handleOpsRequest(request,{enabled:true,sameOrigin:request.headers.get('origin')==='http://127.0.0.1:3197',createRpc});
            if(dropNext && req.method==='POST'){dropNext=false;res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'OPS_ACK_UNKNOWN'}));return;}
            res.writeHead(result.status,{'content-type':'application/json','cache-control':'private, no-store','x-vp-fixture':'SQL claims, not GoTrue'});res.end(JSON.stringify(result.body));return;
          }
          const forward=http.request({hostname:'127.0.0.1',port:3196,path:req.url,method:req.method,headers:{...req.headers,host:'127.0.0.1:3196'}},up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res);});
          forward.on('error',()=>{res.writeHead(502);res.end();});req.pipe(forward);
        }catch(error){res.writeHead(500);res.end('fixture failure');}
      });
      server.on('error',reject);server.listen(3197,'127.0.0.1',()=>console.log('BROWSER_FIXTURE_READY http://127.0.0.1:3197/ops/wiki'));
      t.after(()=>server.close());
    });
  }

});
