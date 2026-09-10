-- VPJ-14: private local candidate review. No Fact publication or customer grants.
create schema knowledge_review_private;
revoke all on schema knowledge_review_private from public, anon, authenticated, service_role;
create table knowledge_review_private.settings (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false
);
insert into knowledge_review_private.settings(singleton) values(true);
create table knowledge_review_private.members (
  actor_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default false,
  revision bigint not null default 1 check(revision>0)
);
create table knowledge_review_private.candidates (
  id uuid primary key,
  author_id uuid not null,
  title text not null check(length(btrim(title)) between 1 and 160),
  content text not null check(length(btrim(content)) between 1 and 4000),
  status text not null default 'pending' check(status in ('pending','reviewed','rejected')),
  version integer not null default 1 check(version in (1,2)),
  reviewer_id uuid,
  review_note text,
  created_at timestamptz not null default clock_timestamp(),
  reviewed_at timestamptz,
  check((status='pending' and version=1 and reviewer_id is null and review_note is null and reviewed_at is null)
    or (status<>'pending' and version=2 and reviewer_id<>author_id and reviewer_id is not null
      and review_note is not null and length(btrim(review_note)) between 1 and 400 and reviewed_at is not null))
);
create table knowledge_review_private.audit (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references knowledge_review_private.candidates(id),
  actor_id uuid not null,
  action text not null check(action in ('submitted','reviewed','rejected')),
  version integer not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(candidate_id,version)
);
create table knowledge_review_private.receipts (
  actor_id uuid not null,
  operation_id uuid not null,
  input jsonb not null,
  result jsonb not null,
  primary key(actor_id,operation_id)
);
-- Defense in depth: only explicit definer RPCs access these private tables.
alter table knowledge_review_private.settings enable row level security;
alter table knowledge_review_private.members enable row level security;
alter table knowledge_review_private.candidates enable row level security;
alter table knowledge_review_private.audit enable row level security;
alter table knowledge_review_private.receipts enable row level security;
revoke all on all tables in schema knowledge_review_private from public, anon, authenticated, service_role;

create function knowledge_review_private.current_actor()
returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); s uuid:=(auth.jwt()->>'session_id')::uuid;
begin
  if u is null or s is null then raise exception 'UNAUTHENTICATED'; end if;
  perform 1 from knowledge_review_private.settings where singleton and enabled for share;
  if not found then raise exception 'OPS_DISABLED'; end if;
  -- Lock auth root before mobile/session rows, following the current identity contract.
  perform 1 from auth.users where id=u for key share nowait;
  if not found then raise exception 'UNAUTHENTICATED'; end if;
  insert into identity_private.mobile_accounts(owner_id) values(u) on conflict do nothing;
  perform identity_private.guard_mobile_rpc_v2();
  perform 1 from auth.sessions where id=s and user_id=u for key share;
  if not found then raise exception 'UNAUTHENTICATED'; end if;
  perform 1 from knowledge_review_private.members where actor_id=u and active for share;
  if not found then raise exception 'OPS_FORBIDDEN'; end if;
  return u;
end $$;

create function knowledge_review_private.candidate_json(p_id uuid)
returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object('id',c.id,'authorId',c.author_id,'title',c.title,'content',c.content,
    'status',c.status,'version',c.version,'reviewerId',c.reviewer_id,'reviewNote',c.review_note,
    'createdAt',c.created_at,'reviewedAt',c.reviewed_at,'published',false,'retrievalEligible',false,
    'audit',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'actorId',a.actor_id,'action',a.action,
      'version',a.version,'createdAt',a.created_at) order by a.version) from knowledge_review_private.audit a where a.candidate_id=c.id),'[]'::jsonb))
  from knowledge_review_private.candidates c where c.id=p_id
$$;

create function public.ops_review_workspace(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; op uuid; cid uuid; action text; result jsonb;
  receipt knowledge_review_private.receipts%rowtype;
  candidate knowledge_review_private.candidates%rowtype;
begin
  -- Revalidate live session and membership BEFORE any read or idempotency replay.
  u:=knowledge_review_private.current_actor();
  if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'INVALID_INPUT'; end if;
  action:=p_input->>'action';
  if action='list' then
    if p_input<>'{"action":"list"}'::jsonb then raise exception 'INVALID_INPUT'; end if;
    return jsonb_build_object('actorId',u,'candidates',coalesce((select jsonb_agg(knowledge_review_private.candidate_json(c.id) order by c.created_at desc,c.id)
      from (select id,created_at from knowledge_review_private.candidates order by created_at desc,id limit 50) c),'[]'::jsonb));
  end if;
  if action is null or action not in ('submit','review') then raise exception 'INVALID_INPUT'; end if;
  if jsonb_typeof(p_input->'operationId') is distinct from 'string'
    or (p_input->>'operationId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(p_input->'candidateId') is distinct from 'string'
    or (p_input->>'candidateId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'INVALID_INPUT'; end if;
  op:=(p_input->>'operationId')::uuid; cid:=(p_input->>'candidateId')::uuid;
  if action='submit' then
    if (select count(*) from jsonb_object_keys(p_input))<>5
      or jsonb_typeof(p_input->'title') is distinct from 'string' or jsonb_typeof(p_input->'content') is distinct from 'string'
      or length(btrim(p_input->>'title')) not between 1 and 160 or length(btrim(p_input->>'content')) not between 1 and 4000 then raise exception 'INVALID_INPUT'; end if;
  else
    if (select count(*) from jsonb_object_keys(p_input))<>6
      or (p_input->'expectedVersion') is distinct from '1'::jsonb
      or jsonb_typeof(p_input->'decision') is distinct from 'string' or (p_input->>'decision') not in ('reviewed','rejected')
      or jsonb_typeof(p_input->'note') is distinct from 'string' or length(btrim(p_input->>'note')) not between 1 and 400 then raise exception 'INVALID_INPUT'; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text||':'||op::text,14));
  select * into receipt from knowledge_review_private.receipts where actor_id=u and operation_id=op;
  if found then
    if receipt.input<>p_input then raise exception 'OPS_CONFLICT'; end if;
    return receipt.result;
  end if;
  if action='submit' then
    insert into knowledge_review_private.candidates(id,author_id,title,content)
      values(cid,u,btrim(p_input->>'title'),btrim(p_input->>'content')) on conflict do nothing;
    if not found then raise exception 'OPS_CONFLICT'; end if;
    insert into knowledge_review_private.audit(candidate_id,actor_id,action,version) values(cid,u,'submitted',1);
  else
    select * into candidate from knowledge_review_private.candidates where id=cid for update;
    if not found then raise exception 'OPS_NOT_FOUND'; end if;
    if candidate.author_id=u then raise exception 'OPS_SELF_REVIEW'; end if;
    if candidate.status<>'pending' or candidate.version<>1 then raise exception 'OPS_CONFLICT'; end if;
    update knowledge_review_private.candidates set status=p_input->>'decision',version=2,reviewer_id=u,
      review_note=btrim(p_input->>'note'),reviewed_at=clock_timestamp() where id=cid;
    insert into knowledge_review_private.audit(candidate_id,actor_id,action,version) values(cid,u,p_input->>'decision',2);
  end if;
  result:=knowledge_review_private.candidate_json(cid);
  insert into knowledge_review_private.receipts(actor_id,operation_id,input,result) values(u,op,p_input,result);
  return result;
end $$;
revoke all on all functions in schema knowledge_review_private from public,anon,authenticated,service_role;
revoke all on function public.ops_review_workspace(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ops_review_workspace(jsonb) to authenticated;
