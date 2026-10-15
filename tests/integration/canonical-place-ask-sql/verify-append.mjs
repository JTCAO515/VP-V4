import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {connect,root,resource} from './db.mjs';
const c=await connect();const append=readFileSync('supabase/migrations/20261015083120_agent005_canonical_place_ask.sql','utf8');
const catalog=async()=>({
 functions:(await c.query(`select n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' signature,md5(pg_get_functiondef(p.oid)) definition,to_jsonb(p)-'prosrc' metadata from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not like 'pg_%' and n.nspname<>'information_schema' order by 1`)).rows,
 tables:(await c.query(`select c.oid::regclass::text relation,c.relkind,c.relowner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,(select jsonb_agg(jsonb_build_object('name',attname,'type',format_type(atttypid,atttypmod),'required',attnotnull,'default',atthasdef) order by attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) columns from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not like 'pg_%' and n.nspname<>'information_schema' order by 1`)).rows,
 constraints:(await c.query(`select n.nspname||'.'||r.relname relation,k.conname,pg_get_constraintdef(k.oid) definition from pg_constraint k join pg_class r on r.oid=k.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname not like 'pg_%' order by 1,2`)).rows,
 roles:(await c.query("select to_jsonb(r)-'rolpassword' value from pg_roles r order by rolname")).rows,
 policies:(await c.query('select to_jsonb(p) value from pg_policy p order by oid')).rows,
 defaults:(await c.query('select to_jsonb(d) value from pg_default_acl d order by oid')).rows,
 memberships:(await c.query('select to_jsonb(m) value from pg_auth_members m order by roleid,member')).rows,
});
const h=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
try{
 const baseline=await catalog();
 await c.query('begin');await c.query('alter function public.read_place_action_context_v1(uuid,jsonb) cost 99');await assert.rejects(c.query(append),/CANONICAL_PLACE_BEFORE_DEFINITION_MISMATCH/);await c.query('rollback');assert.deepEqual(await catalog(),baseline);console.log('DECLARED_SOURCE_DEPENDENCY_DRIFT_REJECTED');
 await c.query('begin');await c.query('alter table turn_private.grounded_turns add column unknown_future_slot jsonb');await assert.rejects(c.query(append),/CANONICAL_PLACE_LIFECYCLE_GUARD_MISMATCH/);await c.query('rollback');assert.deepEqual(await catalog(),baseline);console.log('UNKNOWN_SCHEMA_DELTA_REJECTED_WITHOUT_ADOPTION');
 await c.query('begin');await c.query(append);await c.query('rollback');assert.deepEqual(await catalog(),baseline);console.log('FULL_APPEND_ROLLBACK_EXACT_CATALOG_ACL_ROLES_POLICIES_PASS');
 await c.query('begin');await c.query(append);await c.query('commit');const after=await catalog();
 const prior=new Map(baseline.functions.map(x=>[x.signature,x]));const changed=after.functions.filter(x=>prior.has(x.signature)&&x.definition!==prior.get(x.signature).definition);const added=after.functions.filter(x=>!prior.has(x.signature));
 const pins=JSON.parse(readFileSync(root+'/function-pins.json','utf8'));
 const normalize=s=>s.replaceAll('uuid,uuid','uuid, uuid').replaceAll('text,text','text, text');
 assert.equal(changed.length,pins.length);assert.equal(added.length,19);assert.ok(added.every(x=>x.signature.startsWith('place_actions_private.ask_')));
 for(const row of after.functions)if(prior.has(row.signature))assert.deepEqual(row.metadata,prior.get(row.signature).metadata,row.signature);
 for(const key of ['roles','policies','defaults','memberships'])assert.deepEqual(after[key],baseline[key],key);
 assert.equal(after.tables.length,baseline.tables.length);
 for(let i=0;i<after.tables.length;i++){
  const a=after.tables[i],b=baseline.tables[i];if(a.relation==='turn_private.grounded_turns'){
   assert.deepEqual(a.columns.slice(0,-1),b.columns);assert.deepEqual(a.columns.at(-1),{name:'selected_place_request',type:'jsonb',required:false,default:false});assert.deepEqual({...a,columns:null},{...b,columns:null});
  }else assert.deepEqual(a,b,a.relation);
 }
 const newConstraints=after.constraints.filter(x=>!baseline.constraints.some(b=>b.relation===x.relation&&b.conname===x.conname));assert.equal(newConstraints.length,1);assert.equal(newConstraints[0].conname,'grounded_selected_place_request_shape');assert.deepEqual(after.constraints.filter(x=>x.conname!=='grounded_selected_place_request_shape'),baseline.constraints);
 for(const signature of ['public.read_place_action_context_v1(uuid,jsonb)','public.execute_place_action_v1(uuid,jsonb)','public.guide_place_v1(uuid,jsonb)','public.privacy_turn_data_v1(text,text,bigint)'])assert.equal((await c.query("select has_function_privilege('authenticated',$1,'EXECUTE') value",[signature])).rows[0].value,false,signature);
 for(const row of added)for(const role of ['anon','authenticated','service_role'])assert.equal((await c.query('select has_function_privilege($1,$2,$3) value',[role,row.signature,'EXECUTE'])).rows[0].value,false);
 const guards=(await c.query(readFileSync(root+'/guards.sql','utf8'))).rows;assert.ok(guards.every(g=>g.value===true),JSON.stringify(guards));
 writeFileSync(root+'/catalog-proof.json',JSON.stringify({postgres:(await c.query('select version() value')).rows[0].value,migrationSha256:createHash('sha256').update(append).digest('hex'),baselineCatalogSha256:h(baseline),afterCatalogSha256:h(after),changedFunctions:changed.map(x=>x.signature),newPrivateFunctions:added.map(x=>x.signature),newTables:0,newConstraint:newConstraints[0],oldFunctionMetadataUnchanged:true,tableAclRolesPoliciesDefaultsMembershipsUnchanged:true,ordinaryPlaceGuidePrivacyIngressDenied:true,privateHelperGrantsDenied:true,rollbackExact:true,dependencyDriftRejected:true,unknownSchemaRejected:true,guards},null,2)+'\n');
 console.log('PRODUCT_APPEND_CATALOG_PASS',changed.length,'authored existing functions,',added.length,'private functions; all nine guards TRUE');
}catch(e){await c.query('rollback');throw e;}finally{await c.end();}
