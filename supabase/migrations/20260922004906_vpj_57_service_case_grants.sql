-- VPJ-57: request recording and explicit, replaceable, task-scoped access.
-- No employee is enabled by this migration. No Trip or profile is projected.
create schema service_cases_private;
revoke all on schema service_cases_private from public, anon, authenticated, service_role;
create table service_cases_private.staff (
  actor_id uuid primary key references auth.users(id) on delete cascade,
  label text not null check(length(btrim(label)) between 1 and 80),
  active boolean not null default false
);
create table service_cases_private.cases (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  category text not null check(category in ('transport','accommodation','on_trip','general')),
  problem text not null check(length(btrim(problem)) between 1 and 1000),
  created_at timestamptz not null default clock_timestamp(),
  revision integer not null default 0 check(revision>=0),
  recipient_id uuid,
  expires_at timestamptz,
  revoked boolean not null default true,
  check(revoked or (recipient_id is not null and expires_at is not null))
);
create index service_cases_owner on service_cases_private.cases(owner_id,created_at desc);
create table service_cases_private.audit (
  case_id uuid not null references service_cases_private.cases(id) on delete cascade,
  revision integer not null,
  action text not null check(action in ('created','granted','revoked')),
  actor_id uuid not null,
  recipient_id uuid,
  expires_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  primary key(case_id,revision)
);
alter table service_cases_private.staff enable row level security;
alter table service_cases_private.cases enable row level security;
alter table service_cases_private.audit enable row level security;
revoke all on all tables in schema service_cases_private from public, anon, authenticated, service_role;

create function service_cases_private.actor()
returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); s uuid:=(auth.jwt()->>'session_id')::uuid;
begin
  if u is null or s is null or auth.jwt()->>'role' is distinct from 'authenticated'
    or (auth.jwt()->>'is_anonymous')::boolean is distinct from false then raise exception 'UNAUTHENTICATED'; end if;
  perform 1 from auth.users where id=u for key share nowait;
  if not found then raise exception 'UNAUTHENTICATED'; end if;
  insert into identity_private.mobile_accounts(owner_id) values(u) on conflict do nothing;
  perform identity_private.guard_mobile_rpc_v2();
  perform 1 from auth.sessions where id=s and user_id=u for key share;
  if not found then raise exception 'UNAUTHENTICATED'; end if;
  return u;
end $$;

create function service_cases_private.owner_json(c service_cases_private.cases)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('caseId',c.id,'category',c.category,'problem',c.problem,
 'status','requested','accepted',false,'grantRevision',c.revision,'recipientId',c.recipient_id,
 'expiresAt',c.expires_at,'grantState',case when c.revoked then 'revoked' when c.expires_at<=clock_timestamp() then 'expired' else 'active' end,
 'sharedFields',case when c.revoked then '[]'::jsonb else '["problem"]'::jsonb end)
$$;

create function service_cases_private.execute(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; a text; c service_cases_private.cases%rowtype; cid uuid; recipient uuid; expiry timestamptz; n integer;
begin
 u:=service_cases_private.actor();
 if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'INVALID_INPUT'; end if;
 a:=p_input->>'action'; n:=(select count(*) from jsonb_object_keys(p_input));
 if a='list' then
   if not (n=1 or (n=2 and p_input ? 'offset' and jsonb_typeof(p_input->'offset')='number' and (p_input->>'offset') ~ '^[0-9]{1,7}$')) then raise exception 'INVALID_INPUT'; end if;
   return jsonb_build_object('cases',coalesce((select jsonb_agg(service_cases_private.owner_json(q::service_cases_private.cases)) from
     (select * from service_cases_private.cases where owner_id=u order by created_at desc,id limit 50 offset coalesce((p_input->>'offset')::integer,0)) q),'[]'::jsonb),
     'staff',coalesce((select jsonb_agg(jsonb_build_object('id',s.actor_id,'label',s.label) order by s.label,s.actor_id)
      from service_cases_private.staff s where s.active and s.actor_id<>u),'[]'::jsonb));
 end if;
 if a is null or a not in ('create','grant','revoke','read') or jsonb_typeof(p_input->'caseId') is distinct from 'string'
 or (p_input->>'caseId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'INVALID_INPUT'; end if;
 cid:=(p_input->>'caseId')::uuid;
 if a='create' then
   if n<>4 or jsonb_typeof(p_input->'category') is distinct from 'string' or p_input->>'category' not in ('transport','accommodation','on_trip','general')
   or jsonb_typeof(p_input->'problem') is distinct from 'string' or length(btrim(p_input->>'problem')) not between 1 and 1000 then raise exception 'INVALID_INPUT'; end if;
   insert into service_cases_private.cases(id,owner_id,category,problem) values(cid,u,p_input->>'category',btrim(p_input->>'problem')) on conflict do nothing;
   if found then insert into service_cases_private.audit(case_id,revision,action,actor_id) values(cid,0,'created',u); end if;
 end if;
 -- A common row lock serializes grant replacement/revocation and employee reads.
 select * into c from service_cases_private.cases where id=cid for update;
 if not found then raise exception 'CASE_FORBIDDEN'; end if;
 if a='read' then
   if n<>3 or jsonb_typeof(p_input->'expectedRevision') is distinct from 'number' then raise exception 'INVALID_INPUT'; end if;
   perform 1 from service_cases_private.staff where actor_id=u and active for share;
   if not found or c.recipient_id is distinct from u or c.revoked or c.expires_at<=clock_timestamp()
     or p_input->'expectedRevision' is distinct from to_jsonb(c.revision) then raise exception 'CASE_FORBIDDEN'; end if;
   return jsonb_build_object('caseId',c.id,'grantRevision',c.revision,'problem',c.problem,'expiresAt',c.expires_at,'status','requested','accepted',false);
 end if;
 if c.owner_id<>u then raise exception 'CASE_FORBIDDEN'; end if;
 if a='create' then
   if c.category<>p_input->>'category' or c.problem<>btrim(p_input->>'problem') then raise exception 'CASE_CONFLICT'; end if;
   return service_cases_private.owner_json(c);
 end if;
 if jsonb_typeof(p_input->'expectedRevision') is distinct from 'number' then raise exception 'INVALID_INPUT'; end if;
 if p_input->'expectedRevision' is distinct from to_jsonb(c.revision) then raise exception 'CASE_CONFLICT'; end if;
 if a='grant' then
   if n<>6 or p_input->'sharedFields' is distinct from '["problem"]'::jsonb
     or jsonb_typeof(p_input->'recipientId') is distinct from 'string'
     or (p_input->>'recipientId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or p_input->'durationMinutes' not in ('15'::jsonb,'60'::jsonb,'1440'::jsonb) or not(p_input ? 'durationMinutes') then raise exception 'INVALID_INPUT'; end if;
   recipient:=(p_input->>'recipientId')::uuid;
   perform 1 from service_cases_private.staff where actor_id=recipient and active and actor_id<>u for share;
   if not found then raise exception 'CASE_FORBIDDEN'; end if;
   expiry:=clock_timestamp()+make_interval(mins=>(p_input->>'durationMinutes')::integer);
   update service_cases_private.cases set recipient_id=recipient,expires_at=expiry,revoked=false,revision=revision+1 where id=cid returning * into c;
 else
   if n<>3 then raise exception 'INVALID_INPUT'; end if;
   update service_cases_private.cases set revoked=true,revision=revision+1 where id=cid returning * into c;
 end if;
 insert into service_cases_private.audit(case_id,revision,action,actor_id,recipient_id,expires_at)
 values(cid,c.revision,case when a='grant' then 'granted' else 'revoked' end,u,c.recipient_id,c.expires_at);
 return service_cases_private.owner_json(c);
end $$;
revoke all on all functions in schema service_cases_private from public, anon, authenticated, service_role;
-- Public wrapper is the only authenticated entrypoint; the private definer enforces all actors/actions.
create function public.service_case_v1(p_input jsonb)
returns jsonb language sql security definer set search_path='' as $$ select service_cases_private.execute(p_input) $$;
revoke all on function public.service_case_v1(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.service_case_v1(jsonb) to authenticated;
