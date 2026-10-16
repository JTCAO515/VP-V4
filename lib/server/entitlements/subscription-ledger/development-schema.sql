-- AGENT-009 development candidate. NOT APPLIED. Administrator fixture only.
-- This extends the entitlements domain; no admission/balance ledger or public RPC.
-- Only the pinned legacy function body gains the identity fence below. No ACL changes.
-- Fixed authored before pin. Unknown code/owner/ACL/flags must never be overwritten.
do $cross_ledger_before$
begin
 if not exists(select 1 from pg_proc p join pg_language l on l.oid=p.prolang
  where p.oid=to_regprocedure('public.storekit_apply_verified_v1(jsonb)')
   and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='69086826dd72e28c1d8cb32dfe06bad399042ffb4d209e52fdd45548b344824e'
   and encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='398e3c89c7f7563ffc05c39eed72f0030b83df79759f8c8079a3aa1a76cb54dc'
   and jsonb_build_object('owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'language',l.lanname,'kind',p.prokind,'volatility',p.provolatile,'parallel',p.proparallel,'securityDefiner',p.prosecdef,'strict',p.proisstrict,'leakproof',p.proleakproof,'returnsSet',p.proretset,'result',pg_get_function_result(p.oid),'arguments',pg_get_function_arguments(p.oid),'identity',pg_get_function_identity_arguments(p.oid),'config',p.proconfig,'cost',p.procost,'rows',p.prorows,'support',p.prosupport::text,'binary',p.probin,'sqlBody',p.prosqlbody::text)='{"acl":"{postgres=X/postgres,service_role=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","binary":null,"config":["search_path=\"\""],"result":"jsonb","strict":false,"sqlBody":null,"support":"-","identity":"p_input jsonb","language":"plpgsql","parallel":"u","arguments":"p_input jsonb","leakproof":false,"returnsSet":false,"volatility":"v","securityDefiner":true}'::jsonb
   and exists(select 1 from pg_roles owner_role where owner_role.oid=p.proowner and (owner_role.rolsuper or owner_role.rolbypassrls)))
 then raise exception 'CROSS_LEDGER_BEFORE_MISMATCH'; end if;
end $cross_ledger_before$;


create schema subscription_development;
revoke all on schema subscription_development from public, anon, authenticated, service_role;
create table subscription_development.families (
  environment text not null check(environment='Sandbox'),
  original_transaction_id text not null check(original_transaction_id ~ '^[0-9]{1,32}$'),
  owner_id uuid, app_account_token uuid,
  product_id text not null, subscription_group_id text not null,
  epoch bigint not null check(epoch>0), erased boolean not null default false,
  primary key(environment,original_transaction_id),
  check((erased and owner_id is null and app_account_token is null) or
        (not erased and owner_id is not null and app_account_token=owner_id))
);
create index subscription_family_owner on subscription_development.families(owner_id,environment,original_transaction_id);
create table subscription_development.periods (
  environment text not null, transaction_id text not null check(transaction_id ~ '^[0-9]{1,32}$'),
  original_transaction_id text not null,
  purchase_at timestamptz not null, expires_at timestamptz not null check(expires_at>purchase_at),
  transaction_reason text not null check(transaction_reason in ('PURCHASE','RENEWAL')),
  catalog_version integer not null check(catalog_version=3),
  policy_version text not null check(policy_version='subscription-development-policy/1'),
  capacity_snapshot jsonb not null check(capacity_snapshot='{"period":{"kind":"per_verified_period","quantity":80},"burst":{"kind":"account_rolling","hours":24,"quantity":12}}'::jsonb),
  signed_at timestamptz not null, checked_at timestamptz not null, revoked_at timestamptz,
  primary key(environment,transaction_id),
  unique(environment,original_transaction_id,purchase_at,expires_at),
  foreign key(environment,original_transaction_id) references subscription_development.families,
  check(signed_at>=purchase_at and checked_at>=signed_at),
  check(revoked_at is null or revoked_at between purchase_at and signed_at)
);
create index subscription_period_family on subscription_development.periods(environment,original_transaction_id,purchase_at desc,transaction_id);
create table subscription_development.receipts (
  environment text not null, transaction_id text not null,
  receipt_digest text not null check(receipt_digest ~ '^[0-9a-f]{64}$'),
  signed_at timestamptz not null, checked_at timestamptz not null, revoked_at timestamptz,
  source text not null check(source='apple_server_verified'),
  primary key(environment,transaction_id,receipt_digest),
  foreign key(environment,transaction_id) references subscription_development.periods
);
alter table subscription_development.families enable row level security;
alter table subscription_development.families force row level security;
alter table subscription_development.periods enable row level security;
alter table subscription_development.periods force row level security;
alter table subscription_development.receipts enable row level security;
alter table subscription_development.receipts force row level security;
revoke all on all tables in schema subscription_development from public, anon, authenticated, service_role;

-- No SECURITY DEFINER: only an explicitly composed administrator can exercise this candidate.
create function subscription_development.apply_period_v1(p jsonb, expected_epoch bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 f subscription_development.families%rowtype;
 old subscription_development.periods%rowtype;
 receipt subscription_development.receipts%rowtype;
 own uuid; token uuid; tx text; family text; product text; grp text;
 purchase timestamptz; expiry timestamptz; signed timestamptz; checked timestamptz; revoked timestamptz;
 replay boolean; stamp timestamptz := clock_timestamp(); next_epoch bigint;
begin
 if p is null or jsonb_typeof(p)<>'object' or pg_column_size(p)>16000
   or expected_epoch is null or expected_epoch<0 then raise exception 'INVALID_INPUT'; end if;
 if (select array_agg(k order by k) from jsonb_object_keys(p) k) is distinct from
    (select array_agg(k order by k) from unnest(array['schemaVersion','environment','source','ownerId','appAccountToken','transactionId','originalTransactionId','productId','subscriptionGroupId','purchaseAt','expiresAt','signedAt','checkedAt','revokedAt','transactionReason','receiptDigest','catalogVersion','policyVersion','capacitySnapshot']) k)
 then raise exception 'INVALID_INPUT'; end if;
 if exists(select 1 from jsonb_each(p) e where e.key not in ('catalogVersion','capacitySnapshot','revokedAt') and jsonb_typeof(e.value)<>'string')
   or jsonb_typeof(p->'catalogVersion')<>'number'
   or jsonb_typeof(p->'revokedAt') not in ('string','null') then raise exception 'INVALID_INPUT'; end if;
 begin
  own := (p->>'ownerId')::uuid; token := (p->>'appAccountToken')::uuid;
  purchase := (p->>'purchaseAt')::timestamptz; expiry := (p->>'expiresAt')::timestamptz;
  signed := (p->>'signedAt')::timestamptz; checked := (p->>'checkedAt')::timestamptz; revoked := (p->>'revokedAt')::timestamptz;
 exception when others then raise exception 'INVALID_INPUT'; end;
 tx:=p->>'transactionId'; family:=p->>'originalTransactionId'; product:=p->>'productId'; grp:=p->>'subscriptionGroupId';
 if p->>'schemaVersion' is distinct from 'subscription-verified-period/1' or p->>'environment' is distinct from 'Sandbox'
   or p->>'source' is distinct from 'apple_server_verified' or own is null or token is distinct from own
   or tx is null or tx !~ '^[0-9]{1,32}$' or family is null or family !~ '^[0-9]{1,32}$'
   or grp is null or grp !~ '^[0-9]{1,32}$' or product is null or length(product) not between 1 and 200 or product like 'dev.%'
   or p->>'transactionReason' not in ('PURCHASE','RENEWAL') or p->>'receiptDigest' !~ '^[0-9a-f]{64}$'
   or p->'catalogVersion' is distinct from '3'::jsonb or p->>'policyVersion' is distinct from 'subscription-development-policy/1'
   or p->'capacitySnapshot' is distinct from '{"period":{"kind":"per_verified_period","quantity":80},"burst":{"kind":"account_rolling","hours":24,"quantity":12}}'::jsonb
   or purchase is null or expiry is null or signed is null or checked is null
   or not isfinite(purchase) or not isfinite(expiry) or not isfinite(signed) or not isfinite(checked)
   or purchase<='1970-01-01Z'::timestamptz or expiry<=purchase or signed<purchase or checked<signed
   or checked>stamp or checked<stamp-interval '5 minutes' or purchase>stamp
   or revoked is not null and (not isfinite(revoked) or revoked<purchase or revoked>signed)
 then raise exception 'INVALID_INPUT'; end if;
 -- An empty FORCE-RLS scan is not proof of absence. Fail closed on visibility drift.
 if current_user<>'postgres' or not exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls))
 then raise exception 'ENTITLEMENT_VISIBILITY_UNAVAILABLE'; end if;
 -- Shared identity mutex precedes any owner/family/row lock in both actual writers.
 -- No legacy table SHARE lock: old INSERT RowExclusive must not invert this graph.
 perform pg_advisory_xact_lock(hashtextextended('entitlement-transaction:Sandbox:'||tx,226));
 if exists(select 1 from public.storekit_grants where environment='Sandbox' and transaction_id=tx)
 then raise exception 'ENTITLEMENT_TRANSACTION_CONFLICT'; end if;
 perform pg_advisory_xact_lock(hashtextextended('subscription-owner:'||own::text,226));
 perform pg_advisory_xact_lock(hashtextextended('subscription-family:'||family,226));
 select * into f from subscription_development.families where environment='Sandbox' and original_transaction_id=family for update;
 if found then
  if f.erased or f.owner_id is distinct from own or f.app_account_token is distinct from token
    or f.product_id is distinct from product or f.subscription_group_id is distinct from grp then raise exception 'FAMILY_CONFLICT'; end if;
  if f.epoch<>expected_epoch then raise exception 'EPOCH_CONFLICT'; end if;
 else
  if expected_epoch<>0 then raise exception 'EPOCH_CONFLICT'; end if;
  insert into subscription_development.families values('Sandbox',family,own,token,product,grp,1,false) returning * into f;
 end if;
 select * into old from subscription_development.periods where environment='Sandbox' and transaction_id=tx for update;
 replay:=found;
 if replay then
  if old.original_transaction_id<>family or old.purchase_at<>purchase or old.expires_at<>expiry
    or old.transaction_reason<>p->>'transactionReason' or old.catalog_version<>(p->>'catalogVersion')::integer
    or old.policy_version<>p->>'policyVersion' or old.capacity_snapshot<>p->'capacitySnapshot' then raise exception 'TRANSACTION_CONFLICT'; end if;
  select * into receipt from subscription_development.receipts where environment='Sandbox' and transaction_id=tx and receipt_digest=p->>'receiptDigest';
  if found and (receipt.signed_at<>signed or receipt.revoked_at is distinct from revoked) then raise exception 'RECEIPT_CONFLICT'; end if;
  if signed<old.signed_at then raise exception 'STALE_OBSERVATION'; end if;
  if signed=old.signed_at and old.revoked_at is distinct from revoked then raise exception 'OBSERVATION_CONFLICT'; end if;
  if old.revoked_at is not null and revoked is distinct from old.revoked_at then raise exception 'REVOCATION_CONFLICT'; end if;
  update subscription_development.periods set signed_at=signed,checked_at=greatest(checked_at,checked),revoked_at=coalesce(revoked_at,revoked)
    where environment='Sandbox' and transaction_id=tx;
 else
  if exists(select 1 from subscription_development.periods where environment='Sandbox' and original_transaction_id=family and purchase<expires_at and expiry>purchase_at)
  then raise exception 'PERIOD_CONFLICT'; end if;
  if p->>'transactionReason'='PURCHASE' and tx<>family then raise exception 'FAMILY_CONFLICT'; end if;
  insert into subscription_development.periods values('Sandbox',tx,family,purchase,expiry,p->>'transactionReason',3,p->>'policyVersion',p->'capacitySnapshot',signed,checked,revoked);
 end if;
 insert into subscription_development.receipts values('Sandbox',tx,p->>'receiptDigest',signed,checked,revoked,'apple_server_verified') on conflict do nothing;
 -- Exact repeated evidence/readback is not another entitlement epoch.
 next_epoch:=f.epoch;
 if expected_epoch<>0 and (not replay or old.signed_at<>signed or old.revoked_at is distinct from revoked) then
  update subscription_development.families set epoch=epoch+1 where environment='Sandbox' and original_transaction_id=family returning epoch into next_epoch;
 end if;
 return jsonb_build_object('schemaVersion','subscription-ledger-receipt/1','transactionId',tx,'descriptorId','Sandbox:'||tx,'epoch',next_epoch,'replayed',replay,'state',case when revoked is null then 'recorded' else 'revoked' end);
end $$;

create function subscription_development.read_owner_v1(own uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r record; body jsonb; state text; lifetime integer; stamp timestamptz:=clock_timestamp();
begin
 body:=jsonb_build_object('schemaVersion','subscription-entitlement/1','sourceEnvironment',null,'localTest',false,'ownerId',null,'catalogVersion',3,'policyVersion','subscription-development-policy/1','checkedAt',null,'lifetimeMs',0,'state','unavailable','period',null,'remainingCapacity',null,'purchaseEnabled',false,'runtimeCapacityEnabled',false);
 if own is null then return body; end if;
 -- The window count and chosen period share one READ COMMITTED statement snapshot.
 -- Separate SELECTs here could observe different concurrently committed families.
 select p.*,f.product_id,f.subscription_group_id,
  count(*) filter(where p.purchase_at<=stamp and p.expires_at>stamp and p.revoked_at is null) over() as active_family_count
  into r from subscription_development.periods p join subscription_development.families f using(environment,original_transaction_id)
  where f.owner_id=own and not f.erased
  order by (p.purchase_at<=stamp and p.expires_at>stamp and p.revoked_at is null) desc,p.purchase_at desc,p.transaction_id desc limit 1;
 if not found then return body||jsonb_build_object('sourceEnvironment','Sandbox','ownerId',own,'checkedAt',to_char(stamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'state','none'); end if;
 if r.active_family_count>1 then return body||jsonb_build_object('state','reconciliation_required'); end if;
 if r.purchase_at>stamp then return body||jsonb_build_object('state','reconciliation_required'); end if;
 state:=case when r.revoked_at is not null then 'revoked' when r.expires_at<=stamp then 'expired' else 'active' end;
 lifetime:=case when state='active' then greatest(0,floor(least(300000,extract(epoch from r.checked_at+interval '5 minutes'-stamp)*1000,extract(epoch from r.expires_at-stamp)*1000)))::integer else 0 end;
 if state='active' and lifetime<=0 then return body||jsonb_build_object('state','reconciliation_required'); end if;
 return body||jsonb_build_object('sourceEnvironment','Sandbox','ownerId',own,'checkedAt',to_char(r.checked_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'lifetimeMs',lifetime,'state',state,'period',jsonb_build_object(
  'transactionId',r.transaction_id,'originalTransactionId',r.original_transaction_id,'productId',r.product_id,'subscriptionGroupId',r.subscription_group_id,
  'purchaseAt',to_char(r.purchase_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'expiresAt',to_char(r.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'revokedAt',case when r.revoked_at is null then null else to_char(r.revoked_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
  'descriptorId','Sandbox:'||r.transaction_id,'catalogVersion',r.catalog_version,'policyVersion',r.policy_version));
end $$;

-- Explicit source candidate, NOT registered with old privacy executor/ordinary readers.
create function subscription_development.export_owner_v1(own uuid, after_tx text default null) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('schemaVersion','subscription-financial-export/1','items',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb),'pageLimit',100,
   'completion','requires_terminal_empty_page','retention','minimal_financial_fences','registeredWithPrivacy',false)
 from (select p.environment,p.transaction_id,p.original_transaction_id,p.purchase_at,p.expires_at,p.revoked_at,p.catalog_version,p.policy_version,p.capacity_snapshot,
   f.product_id,f.subscription_group_id,f.epoch from subscription_development.periods p join subscription_development.families f using(environment,original_transaction_id)
   where f.owner_id=own and not f.erased and (after_tx is null or p.transaction_id>after_tx) order by p.transaction_id limit 100) r;
$$;
create function subscription_development.erase_owner_v1(own uuid) returns integer
language plpgsql security invoker set search_path='' as $$
declare n integer; family text;
begin
 perform pg_advisory_xact_lock(hashtextextended('subscription-owner:'||own::text,226));
 -- Same order as apply's family locks; periods/receipts are retained and never reopened.
 for family in select original_transaction_id from subscription_development.families where owner_id=own order by original_transaction_id loop
  perform pg_advisory_xact_lock(hashtextextended('subscription-family:'||family,226));
 end loop;
 update subscription_development.families set owner_id=null,app_account_token=null,erased=true,epoch=epoch+1 where owner_id=own;
 get diagnostics n=row_count; return n;
end $$;
revoke all on all functions in schema subscription_development from public, anon, authenticated, service_role;

-- Explicit authored legacy body; no runtime text rewrite, wrapper or additional grant.
create or replace function public.storekit_apply_verified_v1(p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_token uuid;
  v_tx text;
  v_env text;
  v_product text;
  v_purchase timestamptz;
  v_snapshot jsonb;
  v_existing public.storekit_grants%rowtype;
  v_start timestamptz;
begin
  -- An empty FORCE-RLS scan is not proof of absence. Fail closed on visibility drift.
  if current_user<>'postgres' or not exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls))
  then raise exception 'ENTITLEMENT_VISIBILITY_UNAVAILABLE'; end if;
  -- Grant is service-role only; an authenticated client may never submit decoded claims.
  if (select auth.role()) is distinct from 'service_role' then raise exception 'FORBIDDEN'; end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' then raise exception 'INVALID_INPUT'; end if;
  begin
    v_owner := (p_input->>'ownerId')::uuid;
    v_token := (p_input->>'appAccountToken')::uuid;
    v_purchase := (p_input->>'purchaseAt')::timestamptz;
  exception when others then raise exception 'INVALID_INPUT'; end;
  v_tx := p_input->>'transactionId';
  v_env := p_input->>'environment';
  v_product := p_input->>'productId';
  v_snapshot := p_input->'capacitySnapshot';
  if v_owner is null or v_token is distinct from v_owner or v_env <> 'Sandbox'
    or v_tx is null or length(v_tx) not between 1 and 128
    or v_product is null or length(v_product) not between 1 and 200
    or v_purchase is null or v_purchase > clock_timestamp() + interval '5 minutes'
    or jsonb_typeof(v_snapshot) <> 'object'
    or (p_input->>'catalogVersion')::integer < 1
    or nullif(p_input->>'policyVersion','') is null then raise exception 'INVALID_INPUT'; end if;

  -- Candidate cross-domain fence: identity mutex precedes every owner/row lock.
  perform pg_advisory_xact_lock(hashtextextended('entitlement-transaction:'||v_env||':'||v_tx,226));
  if exists(select 1 from subscription_development.periods where environment=v_env and transaction_id=v_tx)
  then raise exception 'ENTITLEMENT_TRANSACTION_CONFLICT'; end if;

  -- The same owner's purchases serialize; later grants never move earlier intervals.
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 34));
  select * into v_existing from public.storekit_grants
    where environment = v_env and transaction_id = v_tx for update;
  if found then
    -- Preserve the original policy snapshot if code/catalog has since advanced.
    if v_existing.owner_id is distinct from v_owner or v_existing.app_account_token is distinct from v_token
      or v_existing.product_id is distinct from v_product or v_existing.purchase_at is distinct from v_purchase
      then raise exception 'TRANSACTION_CONFLICT'; end if;
    if p_input->>'revokedAt' is not null and v_existing.state = 'active' then
      update public.storekit_grants set state='revoked', revoked_at=(p_input->>'revokedAt')::timestamptz
      where environment=v_env and transaction_id=v_tx;
      v_existing.state := 'revoked';
    end if;
    return jsonb_build_object('transactionId',v_tx,'state',v_existing.state,'replayed',true,
      'startsAt',v_existing.starts_at,'endsAt',v_existing.ends_at);
  end if;
  if p_input->>'revokedAt' is not null then return jsonb_build_object('transactionId',v_tx,'state','revoked','replayed',false); end if;
  select greatest(v_purchase, coalesce(max(ends_at),v_purchase)) into v_start
    from public.storekit_grants where owner_id=v_owner;
  insert into public.storekit_grants(environment,transaction_id,owner_id,app_account_token,product_id,
    purchase_at,starts_at,ends_at,catalog_version,policy_version,capacity_snapshot)
  values(v_env,v_tx,v_owner,v_token,v_product,v_purchase,v_start,v_start+interval '720 hours',
    (p_input->>'catalogVersion')::integer,p_input->>'policyVersion',v_snapshot);
  return jsonb_build_object('transactionId',v_tx,'state','active','replayed',false,
    'startsAt',v_start,'endsAt',v_start+interval '720 hours');
end $$;

-- Fixed authored after pin. Unknown code/owner/ACL/flags must never be overwritten.
do $cross_ledger_after$
begin
 if not exists(select 1 from pg_proc p join pg_language l on l.oid=p.prolang
  where p.oid=to_regprocedure('public.storekit_apply_verified_v1(jsonb)')
   and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='958209af4650641aeb864bce01fb2cca783c7089fc0fccc477ef478691bcc95d'
   and encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='b03152ef41247b0d22955651cfdbc7794c22d09fc33c79e8feca9e8b2d0d40e2'
   and jsonb_build_object('owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'language',l.lanname,'kind',p.prokind,'volatility',p.provolatile,'parallel',p.proparallel,'securityDefiner',p.prosecdef,'strict',p.proisstrict,'leakproof',p.proleakproof,'returnsSet',p.proretset,'result',pg_get_function_result(p.oid),'arguments',pg_get_function_arguments(p.oid),'identity',pg_get_function_identity_arguments(p.oid),'config',p.proconfig,'cost',p.procost,'rows',p.prorows,'support',p.prosupport::text,'binary',p.probin,'sqlBody',p.prosqlbody::text)='{"acl":"{postgres=X/postgres,service_role=X/postgres}","cost":100,"kind":"f","rows":0,"owner":"postgres","binary":null,"config":["search_path=\"\""],"result":"jsonb","strict":false,"sqlBody":null,"support":"-","identity":"p_input jsonb","language":"plpgsql","parallel":"u","arguments":"p_input jsonb","leakproof":false,"returnsSet":false,"volatility":"v","securityDefiner":true}'::jsonb
   and exists(select 1 from pg_roles owner_role where owner_role.oid=p.proowner and (owner_role.rolsuper or owner_role.rolbypassrls)))
 then raise exception 'CROSS_LEDGER_AFTER_MISMATCH'; end if;
end $cross_ledger_after$;
