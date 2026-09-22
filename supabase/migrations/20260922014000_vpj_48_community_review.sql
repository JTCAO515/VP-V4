-- VPJ-48 internal UGC only. No public read, Fact promotion, or Trip writer.
create schema community_private;
revoke all on schema community_private from public, anon, authenticated, service_role;
create table community_private.settings (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false
);
insert into community_private.settings(singleton) values(true);
-- Explicit community qualification, never inherited from knowledge Ops membership.
create table community_private.reviewers (
  actor_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default false
);
create table community_private.submissions (
  id uuid primary key,
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null check(length(title)<=160),
  content text not null check(length(content)<=4000),
  consent text not null check(consent='internal-review-v1'),
  author_identity text not null check(author_identity in ('registered_user','community_reviewer')),
  status text not null default 'pending' check(status in ('pending','published','rejected','withdrawn')),
  version integer not null default 1 check(version between 1 and 3),
  reviewer_id uuid,
  review_note text,
  created_at timestamptz not null default clock_timestamp(),
  reviewed_at timestamptz,
  withdrawn_at timestamptz,
  check((status='withdrawn' and title='' and content='' and withdrawn_at is not null)
    or (status<>'withdrawn' and length(btrim(title))>0 and length(btrim(content))>0 and withdrawn_at is null)),
  check((reviewer_id is null and reviewed_at is null and review_note is null)
    or (reviewer_id is not null and reviewer_id<>author_id and reviewed_at is not null and length(btrim(review_note)) between 1 and 400)),
  check((status='pending' and version=1 and reviewer_id is null)
    or (status in ('published','rejected') and version=2 and reviewer_id is not null)
    or (status='withdrawn' and version in (2,3)))
);
create index community_author_created on community_private.submissions(author_id,created_at desc,id);
create index community_queue_created on community_private.submissions(created_at desc,id) where status='pending';
create table community_private.audit (
  id bigint generated always as identity primary key,
  submission_id uuid not null references community_private.submissions(id) on delete cascade,
  actor_id uuid not null,
  action text not null check(action in ('submitted','reviewed','published','rejected','withdrawn')),
  version integer not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(submission_id,version,action)
);
-- Keep a digest and acknowledgement identity, never a second copy of content.
create table community_private.receipts (
  actor_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  input_digest text not null,
  submission_id uuid not null references community_private.submissions(id) on delete cascade,
  primary key(actor_id,operation_id)
);
alter table community_private.settings enable row level security;
alter table community_private.reviewers enable row level security;
alter table community_private.submissions enable row level security;
alter table community_private.audit enable row level security;
alter table community_private.receipts enable row level security;
revoke all on all tables in schema community_private from public,anon,authenticated,service_role;
revoke all on all sequences in schema community_private from public,anon,authenticated,service_role;

create function community_private.current_actor() returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); s uuid:=(auth.jwt()->>'session_id')::uuid;
begin
  if u is null or s is null or auth.jwt()->>'role' is distinct from 'authenticated'
    or (auth.jwt()->>'is_anonymous')::boolean is distinct from false then raise exception 'UNAUTHENTICATED'; end if;
  perform 1 from community_private.settings where singleton and enabled for share;
  if not found then raise exception 'COMMUNITY_DISABLED'; end if;
  perform 1 from auth.users where id=u and not coalesce(is_anonymous,false) for key share nowait;
  if not found then raise exception 'UNAUTHENTICATED'; end if;
  insert into identity_private.mobile_accounts(owner_id) values(u) on conflict do nothing;
  perform identity_private.guard_mobile_rpc_v2();
  perform 1 from auth.sessions where id=s and user_id=u for key share;
  if not found then raise exception 'UNAUTHENTICATED'; end if;
  return u;
end $$;

-- Called only after authorization; author projection deliberately omits internal review data.
create function community_private.submission_json(p_id uuid,p_internal boolean) returns jsonb
language sql security definer set search_path='' as $$
  select jsonb_build_object('id',c.id,'title',c.title,'content',c.content,'status',c.status,'version',c.version,
    'authorIdentity',c.author_identity,'createdAt',c.created_at,'withdrawnAt',c.withdrawn_at,
    'visibility','internal','publiclyVisible',false,'retrievalEligible',false)
    || case when p_internal then jsonb_build_object('authorId',c.author_id,'reviewerId',c.reviewer_id,
      'reviewNote',c.review_note,'reviewedAt',c.reviewed_at,
      'audit',coalesce((select jsonb_agg(jsonb_build_object('action',a.action,'version',a.version,'createdAt',a.created_at) order by a.id)
        from community_private.audit a where a.submission_id=c.id),'[]'::jsonb)) else '{}'::jsonb end
  from community_private.submissions c where c.id=p_id
$$;

create function public.community_workspace(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; action text; op uuid; cid uuid; internal boolean:=false; qualified boolean:=false;
  digest text; receipt community_private.receipts%rowtype; item community_private.submissions%rowtype;
begin
  u:=community_private.current_actor();
  if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'INVALID_INPUT'; end if;
  action:=p_input->>'action';
  if action is null or action not in ('mine','queue','submit','review','withdraw') then raise exception 'INVALID_INPUT'; end if;
  perform 1 from community_private.reviewers where actor_id=u and active for share;
  qualified:=found;
  internal:=action in ('queue','review');
  if internal and not qualified then raise exception 'COMMUNITY_FORBIDDEN'; end if;
  if action in ('mine','queue') then
    if (select count(*) from jsonb_object_keys(p_input))<>1 then raise exception 'INVALID_INPUT'; end if;
    return jsonb_build_object('submissions',coalesce((select jsonb_agg(community_private.submission_json(c.id,internal) order by c.created_at desc,c.id)
      from (select id,created_at from community_private.submissions
        where (action='mine' and author_id=u) or (action='queue' and status='pending')
        order by created_at desc,id limit 50) c),'[]'::jsonb));
  end if;
  if jsonb_typeof(p_input->'operationId') is distinct from 'string'
    or (p_input->>'operationId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(p_input->'submissionId') is distinct from 'string'
    or (p_input->>'submissionId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'INVALID_INPUT'; end if;
  op:=(p_input->>'operationId')::uuid; cid:=(p_input->>'submissionId')::uuid;
  if action='submit' then
    if (select count(*) from jsonb_object_keys(p_input))<>6
      or jsonb_typeof(p_input->'title') is distinct from 'string' or length(p_input->>'title')>160 or length(btrim(p_input->>'title'))<1
      or jsonb_typeof(p_input->'content') is distinct from 'string' or length(p_input->>'content')>4000 or length(btrim(p_input->>'content'))<1
      or p_input->>'consent' is distinct from 'internal-review-v1' then raise exception 'INVALID_INPUT'; end if;
  elsif action='review' then
    if (select count(*) from jsonb_object_keys(p_input))<>6 or p_input->'expectedVersion' is distinct from '1'::jsonb
      or jsonb_typeof(p_input->'decision') is distinct from 'string' or p_input->>'decision' not in ('approve','reject')
      or jsonb_typeof(p_input->'note') is distinct from 'string' or length(p_input->>'note')>400 or length(btrim(p_input->>'note'))<1 then raise exception 'INVALID_INPUT'; end if;
  else
    if (select count(*) from jsonb_object_keys(p_input))<>4 or (p_input->'expectedVersion' is distinct from '1'::jsonb and p_input->'expectedVersion' is distinct from '2'::jsonb) then raise exception 'INVALID_INPUT'; end if;
  end if;
  digest:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text||':'||op::text,48));
  select * into receipt from community_private.receipts where actor_id=u and operation_id=op;
  if found then
    if receipt.input_digest<>digest then raise exception 'COMMUNITY_CONFLICT'; end if;
    -- Read current state on retry: old submit/review acknowledgement cannot resurrect withdrawn text.
    return community_private.submission_json(receipt.submission_id,internal);
  end if;
  if action='submit' then
    insert into community_private.submissions(id,author_id,title,content,consent,author_identity)
      values(cid,u,btrim(p_input->>'title'),btrim(p_input->>'content'),'internal-review-v1',
        case when qualified then 'community_reviewer' else 'registered_user' end) on conflict do nothing;
    if not found then raise exception 'COMMUNITY_CONFLICT'; end if;
    insert into community_private.audit(submission_id,actor_id,action,version) values(cid,u,'submitted',1);
  else
    select * into item from community_private.submissions where id=cid for update;
    if not found then raise exception 'COMMUNITY_NOT_FOUND'; end if;
    if action='withdraw' and item.author_id<>u then raise exception 'COMMUNITY_NOT_FOUND'; end if;
    if action='review' and item.author_id=u then raise exception 'COMMUNITY_SELF_REVIEW'; end if;
    if item.version<>(p_input->>'expectedVersion')::integer or item.status='withdrawn' then raise exception 'COMMUNITY_CONFLICT'; end if;
    if action='review' then
      if item.status<>'pending' then raise exception 'COMMUNITY_CONFLICT'; end if;
      update community_private.submissions set status=case when p_input->>'decision'='approve' then 'published' else 'rejected' end,
        version=2,reviewer_id=u,review_note=btrim(p_input->>'note'),reviewed_at=clock_timestamp() where id=cid;
      insert into community_private.audit(submission_id,actor_id,action,version) values(cid,u,'reviewed',2);
      insert into community_private.audit(submission_id,actor_id,action,version)
        values(cid,u,case when p_input->>'decision'='approve' then 'published' else 'rejected' end,2);
    else
      update community_private.submissions set status='withdrawn',version=version+1,title='',content='',withdrawn_at=clock_timestamp() where id=cid;
      insert into community_private.audit(submission_id,actor_id,action,version) values(cid,u,'withdrawn',item.version+1);
    end if;
  end if;
  insert into community_private.receipts(actor_id,operation_id,input_digest,submission_id) values(u,op,digest,cid);
  return community_private.submission_json(cid,internal);
end $$;
revoke all on all functions in schema community_private from public,anon,authenticated,service_role;
revoke all on function public.community_workspace(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.community_workspace(jsonb) to authenticated;
