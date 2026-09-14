import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {query} from './transport.mjs';
const root='/Users/jtcao/Library/Caches/visepanda/place-v7-staging-20260914';
const lit=x=>{assert.match(x,/^[a-f0-9-]{36}$/);return "'"+x+"'";};
const result=[];
for(const locale of ['en','zh']){
 const c=JSON.parse(readFileSync(root+'/worker-'+locale+'.json','utf8'));
 const r=JSON.parse(query(`set role postgres;begin read only;select json_build_object('ownerMatches',s.owner_id=${lit(c.ownerId)},'enabled',s.enabled,'frozen',s.frozen,'unexpired',s.expires_at>clock_timestamp()+interval '65 minutes','currency',s.currency,'scopeLimit',s.limit_micros,'taskLimit',s.task_limit_micros,'taskAttempts',s.task_attempt_limit,'providerEnabled',p.enabled,'model',p.model,'priceVersion',p.price_version,'providerLimit',p.limit_micros,'attemptLimit',p.attempt_limit_micros,'used',(select coalesce(sum(case when a.status='settled' then a.actual_micros when a.status='released' then 0 else a.reserved_micros end),0) from public.model_budget_attempts a where a.scope_id=s.id),'unresolved',(select count(*) from public.model_budget_attempts a where a.scope_id=s.id and a.status not in ('settled','released'))) from public.model_budget_scopes s join public.model_budget_provider_limits p on p.scope_id=s.id and p.provider='qwen' where s.id=${lit(c.budget.scopeId)};rollback;`));
 writeFileSync(root+'/budget-observed-'+locale+'.json',JSON.stringify(r,null,2)+'\n',{mode:0o600});
 assert.ok(r.ownerMatches&&r.enabled&&!r.frozen&&r.unexpired&&r.providerEnabled);assert.equal(r.currency,'CNY');assert.equal(r.model,'qwen3.7-plus-2026-05-26');assert.equal(r.priceVersion,c.budget.priceVersion);assert.equal(r.unresolved,0);assert.ok(r.taskAttempts>=2&&r.attemptLimit>=c.budget.reservedMicros);assert.ok(Math.min(r.scopeLimit-r.used,r.providerLimit-r.used,r.taskLimit)>=2*c.budget.reservedMicros);result.push({locale,...r});
}
writeFileSync(root+'/budget-preflight.json',JSON.stringify({at:new Date().toISOString(),status:'PASS',scope:'next admission plus headroom only; sequential full plan may stop at unchanged database cap',fullPlanWorstCaseFunded:false,plannedCallsPerOwner:66,rows:result},null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({status:'PASS',scope:'two existing budgets; next admission headroom, not132 worst-case reservations',fullPlanWorstCaseFunded:false,unresolved:0,configurationChanged:false}));
