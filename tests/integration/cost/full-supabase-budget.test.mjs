import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseBudgetRpc } from '../../../lib/server/model-gateway/budget/supabase-rpc.ts';
import { runWithDurableBudget } from '../../../lib/server/model-gateway/budget/durable.ts';
const workdir=process.env.VP_BUDGET_SUPABASE_WORKDIR;
const sqlFile='20260909184816_vpj_59_durable_model_budget.sql';
function safeExec(command,args){try{return execFileSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:90000});}catch{throw Error('Local fixture command failed; raw output suppressed');}}
const count=()=>Number(safeExec('docker',['exec','supabase_db_vpj59-full-local','psql','-U','postgres','-Atc','select count(*) from supabase_migrations.schema_migrations;']).trim());
test('full local Supabase25->26 preserves a Trip and enforces real Auth/PostgREST budget permissions',{skip:!workdir?'explicit isolated Supabase upgrade workdir not configured':false},async()=>{
  assert.match(readFileSync(join(workdir,'supabase/config.toml'),'utf8'),/^project_id = "vpj59-full-local"$/m);
  assert.equal(existsSync(join(workdir,'supabase/.temp/project-ref')),false,'must not be linked to a remote project');
  assert.equal(count(),25,'requires the fresh owned25 baseline');
  const raw=safeExec('supabase',['status','--workdir',workdir,'-o','env']);
  const env=Object.fromEntries(raw.split('\n').flatMap(line=>{const m=line.match(/^([A-Z_]+)=(.*)$/);return m?[[m[1],m[2].replace(/^"|"$/g,'')]]:[];}));
  assert.equal(env.API_URL,'http://127.0.0.1:55441');assert.ok(env.ANON_KEY&&env.SERVICE_ROLE_KEY);
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  const admin=createClient(env.API_URL,env.SERVICE_ROLE_KEY,options),owner=createClient(env.API_URL,env.ANON_KEY,options),other=createClient(env.API_URL,env.ANON_KEY,options),anon=createClient(env.API_URL,env.ANON_KEY,options);
  const users=[];const scopeId=randomUUID();let tripId;
  try{
    for(const client of [owner,other]){
      const email='vpj59-'+randomUUID()+'@local.test',password=randomBytes(24).toString('base64url');
      const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);assert.ok(created.data.user?.id);users.push(created.data.user.id);
      const login=await client.auth.signInWithPassword({email,password});assert.equal(login.error,null);assert.equal(login.data.user.id,created.data.user.id);
    }
    const made=await owner.from('trips').insert({owner_id:users[0],title:'Synthetic budget upgrade baseline'}).select('*').single();assert.equal(made.error,null);tripId=made.data.id;const before=made.data;
    copyFileSync(join('supabase/migrations',sqlFile),join(workdir,'supabase/migrations',sqlFile));
    const pushed=spawnSync('supabase',['db','push','--local','--skip-vault','--yes','--workdir',workdir],{encoding:'utf8',timeout:90000});assert.equal(pushed.status,0,'local append-only migration failed');assert.equal(count(),26);
    const after=await owner.from('trips').select('*').eq('id',tripId).single();assert.equal(after.error,null);assert.deepEqual(after.data,before);
    const hidden=await other.from('trips').select('id').eq('id',tripId);assert.equal(hidden.error,null);assert.deepEqual(hidden.data,[]);
    let ready=false;for(let i=0;i<20;i++){const result=await admin.from('model_budget_scopes').select('id').limit(1);if(!result.error){ready=true;break;}await new Promise(r=>setTimeout(r,100));}assert.equal(ready,true,'schema cache not ready');
    const scope=await admin.from('model_budget_scopes').insert({id:scopeId,owner_id:users[0],currency:'CNY',limit_micros:1000,task_limit_micros:1000,task_attempt_limit:3,concurrency_limit:1,enabled:true,expires_at:new Date(Date.now()+60000).toISOString()});assert.equal(scope.error,null);
    const provider=await admin.from('model_budget_provider_limits').insert({scope_id:scopeId,provider:'deepseek',model:'test-model',price_version:'test-price',limit_micros:1000,attempt_limit_micros:1000,enabled:true});assert.equal(provider.error,null);
    const a={scopeId,ownerId:users[0],taskId:randomUUID(),attemptId:randomUUID(),provider:'deepseek',model:'test-model',priceVersion:'test-price',reservedMicros:100,timeoutMs:1000};
    for(const client of [owner,other,anon]){
      assert.ok((await client.from('model_budget_scopes').select('id')).error,'ordinary ledger read must be denied');
      const denied=await client.rpc('dispatch_model_budget',{p_scope_id:scopeId,p_owner_id:users[0],p_attempt_id:a.attemptId});assert.ok(denied.error,'ordinary budget RPC must be denied');
    }
    let invoked=0;const result=await runWithDurableBudget(a,createSupabaseBudgetRpc(admin),async()=>{invoked++;return {value:'synthetic',actualMicros:20};},new AbortController().signal);
    assert.deepEqual(result,{kind:'completed',value:'synthetic',accounting:'settled'});assert.equal(invoked,1);
    const row=await admin.from('model_budget_attempts').select('status,actual_micros,reserved_micros').eq('scope_id',scopeId).single();assert.equal(row.error,null);assert.deepEqual(row.data,{status:'settled',actual_micros:20,reserved_micros:100});
  }finally{
    // Only this run UUIDs in this exclusively owned local stack. No remote cleanup or prefix delete.
    safeExec('docker',['exec','supabase_db_vpj59-full-local','psql','-U','postgres','-v','ON_ERROR_STOP=1','-c',`delete from public.model_budget_attempts where scope_id='${scopeId}'; delete from public.model_budget_provider_limits where scope_id='${scopeId}'; delete from public.model_budget_scopes where id='${scopeId}';`]);
    if(tripId)assert.equal((await admin.from('trips').delete().eq('id',tripId)).error,null);
    for(const id of users)assert.equal((await admin.auth.admin.deleteUser(id)).error,null);
  }
});
