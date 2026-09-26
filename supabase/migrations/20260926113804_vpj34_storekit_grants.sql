-- VPJ-34 Q2. Only server-verified Sandbox transactions enter this ledger.
-- Keep transaction tombstones after account erasure so replay cannot issue a new grant.
create table public.storekit_grants (
  environment text not null check (environment = 'Sandbox'),
  transaction_id text not null,
  owner_id uuid,
  app_account_token uuid,
  product_id text not null,
  purchase_at timestamptz not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  catalog_version integer not null,
  policy_version text not null,
  capacity_snapshot jsonb not null,
  state text not null default 'active' check (state in ('active','revoked','erased')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (environment, transaction_id),
  check (ends_at = starts_at + interval '720 hours'),
  check (state <> 'erased' or owner_id is null)
);

create index storekit_grants_owner_interval on public.storekit_grants(owner_id, starts_at, ends_at);
alter table public.storekit_grants enable row level security;
create policy storekit_grants_owner_read on public.storekit_grants for select to authenticated
  using (owner_id = (select auth.uid()));
revoke all on public.storekit_grants from public, anon, authenticated;
grant select on public.storekit_grants to authenticated;
-- The service key can invoke only the reviewed RPCs, never edit ledger rows directly.
revoke all on public.storekit_grants from service_role;

create function public.storekit_apply_verified_v1(p_input jsonb) returns jsonb
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
revoke all on function public.storekit_apply_verified_v1(jsonb) from public, anon, authenticated;
grant execute on function public.storekit_apply_verified_v1(jsonb) to service_role;

-- Privacy workers can export the owner's rows and erase their ownership while preserving
-- transaction tombstones; the public read policy then exposes none of the erased rows.
create function public.storekit_export_owner_v1(p_owner uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_rows jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'FORBIDDEN'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'environment',environment,'transactionId',transaction_id,'productId',product_id,
    'purchaseAt',purchase_at,'startsAt',starts_at,'endsAt',ends_at,
    'catalogVersion',catalog_version,'policyVersion',policy_version,
    'capacitySnapshot',capacity_snapshot,'state',state,'revokedAt',revoked_at
  ) order by starts_at), '[]'::jsonb) into v_rows
  from public.storekit_grants where owner_id=p_owner;
  return v_rows;
end $$;
revoke all on function public.storekit_export_owner_v1(uuid) from public, anon, authenticated;
grant execute on function public.storekit_export_owner_v1(uuid) to service_role;

create function public.storekit_erase_owner_v1(p_owner uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'FORBIDDEN'; end if;
  update public.storekit_grants set owner_id=null,app_account_token=null,state='erased' where owner_id=p_owner;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.storekit_erase_owner_v1(uuid) from public, anon, authenticated;
grant execute on function public.storekit_erase_owner_v1(uuid) to service_role;
