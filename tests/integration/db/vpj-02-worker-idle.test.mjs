import test from 'node:test';
import assert from 'node:assert/strict';
import { idleOnlyFetch } from '../../../scripts/db/vpj-02-worker-idle.mjs';
import { API } from '../../../scripts/db/vpj-02-verification-core.mjs';
const options = () => ({method:'POST',redirect:'manual',credentials:'omit',body:JSON.stringify({p_owner_id:'owner',p_policy_id:'policy'})});
test('idle worker guard forwards the one real response unchanged',async()=>{
  const seen={requests:0}, response=Response.json({kind:'empty'});
  const guarded=idleOnlyFetch('owner','policy',async()=>response,seen);
  assert.equal(await guarded(`${API}/rest/v1/rpc/claim_text_work`,options()),response);
  assert.equal(seen.requests,1);assert.equal(seen.status,200);
  await assert.rejects(()=>guarded(`${API}/rest/v1/rpc/claim_text_work`,options()));
});
test('idle worker guard denies global claim, other scopes, budget and provider URLs before transport',async()=>{
  const cases=[['https://other.test',options()],[`${API}/rest/v1/rpc/claim_turn_work`,options()],
    [`${API}/rest/v1/rpc/reserve_model_budget`,options()],
    [`${API}/rest/v1/rpc/claim_text_work`,{...options(),body:'{"p_owner_id":"other","p_policy_id":"policy"}'}],
    [`${API}/rest/v1/rpc/claim_text_work`,{...options(),redirect:'follow'}],
    [`${API}/rest/v1/rpc/claim_text_work`,{...options(),body:'bad-json'}]];
  for(const [url,init] of cases){let calls=0;const guarded=idleOnlyFetch('owner','policy',async()=>{calls++;},{});await assert.rejects(()=>guarded(url,init));assert.equal(calls,0);}
});
