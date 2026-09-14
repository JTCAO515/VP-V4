import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {query} from './transport.mjs';
const read=p=>JSON.parse(readFileSync(p,'utf8')),policy=JSON.parse(query("set role postgres;begin read only;select row_to_json(p) from turn_private.text_policies p where id='015d6710-82ec-4fc1-bb4f-a817b3f62873';rollback;"));
assert.equal(policy.context_mode,'knowledge_intent_v1');assert.equal(policy.revoked_at,null);assert.ok(Date.parse(policy.expires_at)>Date.now()+90*60000&&Date.parse(policy.terms_recheck_at)>Date.now()+90*60000);
const expiry=new Date(Date.now()+90*60000).toISOString();assert.ok(!existsSync('budget-window-before.json'));
const configs=['en','zh'].map(locale=>read('worker-'+locale+'.json'));
const lit=x=>"'"+String(x).replaceAll("'","''")+"'",ids=configs.map(c=>lit(c.budget.scopeId)).join(',');
const snapshot=`select json_build_object('scopes',(select jsonb_agg(to_jsonb(s) order by id) from public.model_budget_scopes s where id in (${ids})),'providers',(select jsonb_agg(to_jsonb(p) order by scope_id,provider) from public.model_budget_provider_limits p where scope_id in (${ids})),'attempts',(select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(a) order by scope_id,attempt_id),'[]')::text,'UTF8')),'hex') from public.model_budget_attempts a where scope_id in (${ids})));`;
const before=JSON.parse(query('set role postgres;begin read only;'+snapshot+'rollback;'));
assert.equal(before.scopes.length,2);for(const c of configs){const s=before.scopes.find(x=>x.id===c.budget.scopeId);assert.equal(s.owner_id,c.ownerId);assert.equal(s.limit_micros,70000000);assert.equal(s.enabled,true);assert.equal(s.frozen,false);assert.ok(Date.parse(s.expires_at)<Date.now()+65*60000);}
writeFileSync('budget-window-before.json',JSON.stringify(before,null,2)+'\n',{mode:0o600,flag:'wx'});
const result=query(`set role postgres;begin;set local lock_timeout='5s';select id from public.model_budget_scopes where id in (${ids}) order by id for update;do $$ begin if exists(select 1 from turn_private.work where state='leased') or exists(select 1 from public.model_budget_attempts where scope_id in (${ids}) and status not in ('settled','released')) or (select jsonb_agg(to_jsonb(s) order by id) from public.model_budget_scopes s where id in (${ids})) is distinct from ${lit(JSON.stringify(before.scopes))}::jsonb then raise exception 'Budget baseline changed';end if;end $$;update public.model_budget_scopes set expires_at=${lit(expiry)}::timestamptz where id in (${ids});${snapshot}commit;`);
const after=JSON.parse(result.split('\n').findLast(x=>x.startsWith('{')));
assert.equal(after.attempts,before.attempts);assert.deepEqual(after.providers,before.providers);
for(const s of after.scopes){assert.equal(Date.parse(s.expires_at),Date.parse(expiry));const old=before.scopes.find(x=>x.id===s.id);assert.deepEqual({...s,expires_at:old.expires_at},old);}
const receipt={at:new Date().toISOString(),status:'PASS',scope:'two existing controlled test budgets; expiry only',expiresAt:expiry,limitsUnchanged:true,spendingHistoryUnchanged:true,providerLimitsUnchanged:true,noAdditionalFunds:true,noUserCharge:true};
writeFileSync('budget-window-result.json',JSON.stringify(receipt,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(receipt));
