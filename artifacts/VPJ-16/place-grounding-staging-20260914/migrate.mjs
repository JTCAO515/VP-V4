import {placeShapeSQL} from "./place-shape.mjs";

import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tableSnapshotSQL,validateSnapshot} from './table-snapshot.mjs';
import {schemaInventorySQL} from './schema-inventory.mjs';
const root='/Users/jtcao/Library/Caches/visepanda/place-grounding-staging-20260914',frozen=root+'/frozen';
const read=p=>readFileSync(p,'utf8'),hash=b=>createHash('sha256').update(b).digest('hex');
let stage='arguments';
try{
 const action=process.argv[2];assert.ok(['dry-run','apply','verify'].includes(action));
 const manifest=JSON.parse(read(root+'/migrations.json'));assert.equal(manifest.head,'e19bd584ba86604047c9216e50c5329e8881dcf8');
 const files=readdirSync(frozen+'/supabase/migrations').filter(f=>f.endsWith('.sql')).sort();assert.equal(files.length,48);
 manifest.migrations.forEach((m,i)=>{assert.equal(files[i],m.file);assert.equal(hash(readFileSync(frozen+'/supabase/migrations/'+m.file)),m.sha256);});
 assert.deepEqual(files.slice(-2),['20260914040000_vpj_16_place_statements.sql','20260914041000_vpj_16_place_questions.sql']);
 stage='backup';const backup=JSON.parse(read(read(root+'/current-backup-path')+'/manifest.json'));
 assert.equal(backup.restoreRehearsal,'PASS');assert.equal(backup.candidateRollbackExact,true);assert.equal(backup.restoreContainerCleaned,true);
 assert.equal(backup.restoreTableDigestsMatched,backup.tablesBefore.length);assert.equal(backup.restoreSchemaInventoryMatched,backup.schemaBefore.length);
 assert.ok(Date.now()-Date.parse(backup.createdAt)<3600000);assert.equal(hash(readFileSync(backup.file)),backup.ciphertextSha256);
 const {query,env,ca,inventory,verifiedPoolUrl}=await import('./transport.mjs');
 stage='history';const history=JSON.parse(query("set role postgres;begin read only;select json_agg(json_build_object('version',version,'name',name) order by version) from supabase_migrations.schema_migrations;rollback;"));
 assert.equal(history.length,action==='verify'?48:46);history.forEach((m,i)=>assert.equal(files[i],m.version+'_'+m.name+'.sql'));
 stage='retained-data';const current=inventory();for(const k of ['authCount','tripCount','authDigest','tripDigest'])assert.equal(current[k],backup.sourceBefore[k]);
 assert.deepEqual(validateSnapshot(JSON.parse(query(tableSnapshotSQL(backup.tablesBefore,action==='verify'?files.at(-3).slice(0,14):null)))),backup.tablesBefore);
 stage='schema';const before=new Map(backup.schemaBefore.map(r=>[r.kind+':'+r.identity,r.digest])),after=JSON.parse(query(schemaInventorySQL));
 const expected=JSON.parse(read(root+'/candidate-schema.json'));assert.equal(expected.head,manifest.head);assert.equal(expected.rollbackExact,true);
 if(action==='verify') { assert.deepEqual(after,expected.schema);assert.deepEqual(JSON.parse(query("set role postgres;begin read only;"+placeShapeSQL+"rollback;")),expected.groundedShape); }
 else assert.deepEqual(after,backup.schemaBefore);
 stage='ops-state';const opsState=JSON.parse(query("set role postgres;begin read only;select json_build_object('enabled',(select enabled from knowledge_review_private.settings),'active',(select count(*) from knowledge_review_private.members where active));rollback;"));assert.equal(opsState.enabled,false);assert.equal(opsState.active,0);
 stage='reader';assert.equal(JSON.parse(query("set role postgres;begin read only;select to_json(enabled) from knowledge_review_private.publication_settings;rollback;")),false);
 stage='writers';const work=JSON.parse(query("set role postgres;begin read only;select json_build_object('leased',(select count(*) from turn_private.work where state='leased'),'reserved',(select count(*) from public.model_budget_attempts where status in ('reserved','dispatched','pending')));rollback;"));assert.equal(work.leased,0);assert.equal(work.reserved,0);
 if(action==='verify'){
  const check=JSON.parse(query("set role postgres;begin read only;select json_build_object('defaultReadDisabled',not (select enabled from knowledge_review_private.publication_settings),'opsDisabled',not (select enabled from knowledge_review_private.settings),'noActiveMembers',not exists(select 1 from knowledge_review_private.members where active),'privateHelpersDenied',not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join (values ('anon'),('authenticated'),('service_role')) r(role) where n.nspname='knowledge_review_private' and has_function_privilege(r.role,p.oid,'execute')),'privateTablesDenied',not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join (values ('anon'),('authenticated'),('service_role')) r(role) where n.nspname='knowledge_review_private' and c.relkind='r' and has_table_privilege(r.role,c.oid,'select,insert,update,delete')),'groundedPrivate',not exists(select 1 from (values ('anon'),('authenticated'),('service_role')) r(role) where has_table_privilege(r.role,'turn_private.grounded_turns','select,insert,update,delete')),'groundedRls',(select relrowsecurity from pg_class where oid='turn_private.grounded_turns'::regclass),'placeCompletionAcl',has_function_privilege('service_role','public.complete_grounded_place_work(uuid,uuid,text,text,text,text)','execute') and not has_function_privilege('authenticated','public.complete_grounded_place_work(uuid,uuid,text,text,text,text)','execute') and not has_function_privilege('anon','public.complete_grounded_place_work(uuid,uuid,text,text,text,text)','execute'));rollback;"));
  assert.ok(Object.values(check).every(v=>v===true));
  const result={at:new Date().toISOString(),status:'PASS',migrationCount:48,originalTablesPreserved:backup.tablesBefore.length,originalSchemaEntriesChecked:before.size,expectedChangedFunctions:expected.changed,backupRestore:'PASS',authCount:current.authCount,tripCount:current.tripCount,...check};writeFileSync(root+'/migration-result.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));process.exit(0);
 }
 stage='cli';const url=new URL(verifiedPoolUrl);url.username=env.PGUSER;url.password='';url.searchParams.set('sslmode','verify-full');url.searchParams.set('sslrootcert',ca);url.searchParams.set('options','-c role=postgres');
 const cli=args=>spawnSync('supabase',args,{cwd:frozen,env:{...process.env,PGPASSWORD:env.PGPASSWORD},encoding:'utf8',timeout:180000,maxBuffer:3*1024*1024,stdio:['ignore','pipe','pipe']});
 const dry=cli(['db','push','--db-url',url.toString(),'--dry-run','--skip-vault','--output-format','json']);assert.equal(dry.status,0);
 const pending=[...new Set((dry.stdout+'\n'+dry.stderr).match(/\d{14}_[a-z0-9_]+\.sql/g)??[])].sort();assert.deepEqual(pending,files.slice(-2));
 console.log(JSON.stringify({dryRun:'PASS',pending,backupRestore:'PASS',noActiveLease:true,unsettledAttemptsPreserved:work.reserved}));
 if(action==='dry-run')process.exit(0);
 stage='apply';const applied=cli(['db','push','--db-url',url.toString(),'--skip-vault','--yes','--output-format','json']);
 writeFileSync(root+'/migration-process.json',JSON.stringify({at:new Date().toISOString(),exitCode:applied.status,signal:applied.signal,authorizedFiles:pending,rawOutputRecorded:false})+'\n',{mode:0o600});
 console.log(JSON.stringify({migrationProcessExit:applied.status,postcheck:'required'}));assert.equal(applied.status,0);
}catch(e){console.error(JSON.stringify({status:'STOPPED',stage,errorType:e.name,rawOutput:'suppressed',next:'inspect actual state before retry'}));process.exitCode=1;}
