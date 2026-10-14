import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';

// Explicit initialization for a freshly migrated disposable fixture only.
// This is not restore evidence or target/operator activation. Existing/restored data refuses.
export const freshOpsScopes = Object.freeze([
  ['capability','planning_comparison_v1'], ['capability','planning_intake_comparison_v2'],
  ['capability','scoped_trip_edit_v1'], ['capability','text'],
  ['city','beijing'], ['city','chongqing'], ['city','guangzhou'], ['city','shanghai'],
  ['provider','amap'], ['provider','deepseek'], ['provider','glm'], ['provider','qwen'],
]);
const migration = 'supabase/migrations/20261012103151_vpj37_ops_control_w2.sql';
const sourceHash = '87f24b4714bb7538f50de85392541b2ac96d12ab59137762e0370dd45722b553';
const emptyJournal = JSON.stringify({ schemaVersion:'ops-control-restore/1', revision:0,
  controls:freshOpsScopes.map(([kind,key])=>({scope:{kind,key},stopRevision:0})),
  budgets:[], retiredOperations:[], erasedActors:[],
});
export function freshOpsBootstrapSQL() {
  const bytes=readFileSync(migration);
  if(createHash('sha256').update(bytes).digest('hex')!==sourceHash)throw Error('W2 fixture source changed: explicit review required');
  return `begin;
do $fresh_fixture$ declare
  u uuid:=gen_random_uuid();s uuid:=gen_random_uuid();x record;response_n jsonb;
  settings_enabled boolean;revision_n bigint;journal_n jsonb:='${emptyJournal}'::jsonb;
begin
  if session_user<>'postgres' or current_setting('role')<>'none' then raise exception 'W2_FIXTURE_ROLE_UNAVAILABLE';end if;
  if ops_control_private.installed_supported_v1() is not true then raise exception 'W2_FIXTURE_SOURCE_UNAVAILABLE';end if;
  if (select count(*) from ops_control_private.root_v1)<>1
    or not exists(select 1 from ops_control_private.root_v1 where singleton and revision=0 and recovery_manifest is null)
    or (select count(*) from ops_control_private.controls_v1)<>12
    or exists(select 1 from ops_control_private.controls_v1 where state<>'disabled' or revision<>0 or stop_revision<>0)
    or exists(select 1 from ops_control_private.operations_v1)
    or exists(select 1 from ops_control_private.budget_fences_v1)
    or exists(select 1 from public.model_budget_scopes)
    or exists(select 1 from public.model_budget_attempts)
    or exists(select 1 from public.turns)
    or exists(select 1 from turn_private.work)
    or exists(select 1 from auth.users)
    then raise exception 'W2_FIXTURE_NOT_PRISTINE';end if;
  if ops_control_private.recovery_ready_v1() then raise exception 'W2_FIXTURE_DEFAULT_DENIAL_LOST';end if;
  perform ops_control_private.reconcile_restore_v1(journal_n,encode(sha256(convert_to(journal_n::text,'UTF8')),'hex'));
  if ops_control_private.recovery_ready_v1() is not true then raise exception 'W2_FIXTURE_RECONCILIATION_FAILED';end if;
  select enabled into settings_enabled from knowledge_review_private.settings where singleton for update;
  update knowledge_review_private.settings set enabled=true where singleton;
  insert into auth.users(id) values(u);
  insert into identity_private.mobile_accounts(owner_id) values(u);
  insert into auth.sessions(id,user_id) values(s,u);
  insert into knowledge_review_private.members(actor_id,active) values(u,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',u,'session_id',s,'is_anonymous',false)::text,true);
  perform set_config('role','authenticated',true);
  response_n:=public.ops_control_operations_v1(jsonb_build_object('schemaVersion','ops-control/1','action','workspace'));
  revision_n:=(response_n->>'revision')::bigint;
  for x in select value from jsonb_array_elements(journal_n->'controls') loop
    response_n:=public.ops_control_operations_v1(jsonb_build_object('schemaVersion','ops-control/1','action','set',
      'operationId',gen_random_uuid(),'expectedRevision',revision_n,'scope',x.value->'scope','state','enabled'));
    if response_n->>'acknowledgement' is distinct from 'applied'
      or response_n->>'effect' is distinct from 'permits_fresh_authorization'
      or (response_n->>'revision')::bigint<>revision_n+1 then raise exception 'W2_FIXTURE_ENABLE_FAILED';end if;
    revision_n:=(response_n->>'revision')::bigint;
  end loop;
  perform set_config('role','none',true);
  perform set_config('request.jwt.claim.role','',true);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  update knowledge_review_private.settings set enabled=settings_enabled where singleton;
  delete from auth.users where id=u;
  if exists(select 1 from auth.sessions where user_id=u)
    or exists(select 1 from knowledge_review_private.members where actor_id=u)
    or exists(select 1 from identity_private.mobile_accounts where owner_id=u)
    or exists(select 1 from ops_control_private.operations_v1 where actor_id=u or not retired)
    or exists(select 1 from ops_control_private.controls_v1 where state<>'enabled')
    or ops_control_private.recovery_ready_v1() is not true then raise exception 'W2_FIXTURE_CLEANUP_FAILED';end if;
end $fresh_fixture$;
commit;`;
}
export async function initializeFreshOpsFixture(db) {
  await db(freshOpsBootstrapSQL());
}

// The caller has just created this owned temporary stack and copied product migrations.
// Keep initialization visibly separate from every product migration and its source bytes.
export function stageFreshOpsFixtureBootstrap(workdir) {
  if(!isAbsolute(workdir)||lstatSync(workdir).isSymbolicLink())throw Error('W2 fixture requires owned absolute temporary directory');
  const target=realpathSync(workdir),temp=realpathSync(tmpdir()),within=relative(temp,target);
  if(!within||within==='..'||within.startsWith('..'+sep)||isAbsolute(within))throw Error('W2 fixture directory outside temporary root');
  const folder=join(target,'supabase','migrations'),name='20990101000000_disposable_w2_fixture_initialization.sql';
  if(!existsSync(join(folder,migration.split('/').at(-1))))return false; // Historical pre-W2 prefix remains unchanged.
  const files=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
  const copied=readdirSync(folder).filter(f=>f.endsWith('.sql')).sort();
  if(JSON.stringify(files)!==JSON.stringify(copied))throw Error('W2 fixture copied migration inventory differs');
  for(const file of files)if(!readFileSync(join(folder,file)).equals(readFileSync(join('supabase/migrations',file))))throw Error('W2 fixture copied product source differs');
  writeFileSync(join(folder,name),freshOpsBootstrapSQL(),{flag:'wx',mode:0o600});
  return true;
}
