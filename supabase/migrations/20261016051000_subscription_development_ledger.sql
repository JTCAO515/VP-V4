-- AGENT-009 development candidate. NOT APPLIED. Administrator fixture only.
-- This extends the entitlements domain; no admission/balance ledger or public RPC.
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
 -- Read-only compatibility fence. Blocks legacy inserts for this transaction's check/commit.
 -- Reverse-direction old writer guard still needs Main integration before enablement.
 lock table public.storekit_grants in share mode;
 if exists(select 1 from public.storekit_grants where environment='Sandbox' and transaction_id=tx)
 then raise exception 'LEGACY_TRANSACTION_CONFLICT'; end if;
 -- Serialize privacy erasure/new families for the same owner, then tx/family.
 perform pg_advisory_xact_lock(hashtextextended('subscription-owner:'||own::text,226));
 -- Stable lock order: transaction then family. No ownership-claim fallback.
 perform pg_advisory_xact_lock(hashtextextended('subscription-tx:'||tx,226));
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
declare r record; n integer; body jsonb; state text; stamp timestamptz:=clock_timestamp();
begin
 body:=jsonb_build_object('schemaVersion','subscription-entitlement/1','sourceEnvironment',null,'localTest',false,'ownerId',null,'catalogVersion',3,'policyVersion','subscription-development-policy/1','state','unavailable','period',null,'remainingCapacity',null,'purchaseEnabled',false,'runtimeCapacityEnabled',false);
 if own is null then return body; end if;
 select count(*) into n from subscription_development.periods p join subscription_development.families f using(environment,original_transaction_id)
  where f.owner_id=own and not f.erased and p.purchase_at<=stamp and p.expires_at>stamp and p.revoked_at is null;
 if n>1 then return body||jsonb_build_object('state','reconciliation_required'); end if;
 select p.*,f.product_id,f.subscription_group_id into r from subscription_development.periods p join subscription_development.families f using(environment,original_transaction_id)
  where f.owner_id=own and not f.erased
  order by (p.purchase_at<=stamp and p.expires_at>stamp and p.revoked_at is null) desc,p.purchase_at desc,p.transaction_id desc limit 1;
 if not found then return body||jsonb_build_object('sourceEnvironment','Sandbox','ownerId',own,'state','none'); end if;
 if r.purchase_at>stamp then return body||jsonb_build_object('state','reconciliation_required'); end if;
 state:=case when r.revoked_at is not null then 'revoked' when r.expires_at<=stamp then 'expired' else 'active' end;
 if state='active' and r.checked_at<stamp-interval '5 minutes' then return body||jsonb_build_object('state','reconciliation_required'); end if;
 return body||jsonb_build_object('sourceEnvironment','Sandbox','ownerId',own,'state',state,'period',jsonb_build_object(
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
