import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const pins=JSON.parse(readFileSync(new URL('../../../lib/server/entitlements/subscription-ledger/cross-ledger-pins.json',import.meta.url),'utf8'));
const sha=s=>createHash('sha256').update(s).digest('hex');
test('fixed legacy pins preserve metadata and permit only authored visibility and identity-fence body additions',()=>{
 const visibility=`  -- An empty FORCE-RLS scan is not proof of absence. Fail closed on visibility drift.
  if current_user<>'postgres' or not exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls))
  then raise exception 'ENTITLEMENT_VISIBILITY_UNAVAILABLE'; end if;
`;
 const fence=`  -- Candidate cross-domain fence: identity mutex precedes every owner/row lock.
  perform pg_advisory_xact_lock(hashtextextended('entitlement-transaction:'||v_env||':'||v_tx,226));
  if exists(select 1 from subscription_development.periods where environment=v_env and transaction_id=v_tx)
  then raise exception 'ENTITLEMENT_TRANSACTION_CONFLICT'; end if;

`;
 assert.equal(pins.after.definition.split(visibility).length,2);assert.equal(pins.after.definition.split(fence).length,2);
 assert.equal(pins.after.definition.replace(visibility,'').replace(fence,''),pins.before.definition);
 assert.deepEqual(pins.after.metadata,pins.before.metadata);
 for(const p of [pins.before,pins.after]){
  assert.equal(sha(p.definition),p.definition_sha256);
  assert.equal(sha(p.definition.split('AS $function$')[1].split('$function$')[0]),p.source_sha256);
 }
});
test('known-before pin matches accepted legacy source bytes; candidate uses the explicit pinned body',()=>{
 const source=readFileSync(new URL('../../../supabase/migrations/20260926113804_vpj34_storekit_grants.sql',import.meta.url),'utf8');
 const segment=source.split('create function public.storekit_apply_verified_v1(p_input jsonb) returns jsonb')[1];
 assert.equal(sha(segment.split('as $$')[1].split('$$;')[0]),pins.before.source_sha256);
 const sql=readFileSync(new URL('../../../lib/server/entitlements/subscription-ledger/development-schema.sql',import.meta.url),'utf8');
 const body=sql.split('create or replace function public.storekit_apply_verified_v1(')[1].split('as $$')[1].split('$$;')[0];
 assert.equal(sha(body),pins.after.source_sha256);
});
