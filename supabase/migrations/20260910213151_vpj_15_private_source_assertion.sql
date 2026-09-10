-- Private source material declarations and pending address assertions only.
-- No source fetch, licence grant, grounded claim, Fact publication or retrieval.
create table knowledge_review_private.source_revisions (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  revision_label text not null,
  declaration jsonb not null,
  snippet_hash text not null check(snippet_hash ~ '^[0-9a-f]{64}$'),
  submitted_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(source_key,revision_label)
);
create table knowledge_review_private.candidate_assertions (
  candidate_id uuid primary key references knowledge_review_private.candidates(id),
  assertion_id uuid not null unique default gen_random_uuid(),
  revision integer not null default 1 check(revision=1),
  source_revision_id uuid not null references knowledge_review_private.source_revisions(id),
  assertion jsonb not null,
  expressions jsonb not null
);
alter table knowledge_review_private.source_revisions enable row level security;
alter table knowledge_review_private.candidate_assertions enable row level security;
revoke all on knowledge_review_private.source_revisions,knowledge_review_private.candidate_assertions from public,anon,authenticated,service_role;

create or replace function knowledge_review_private.candidate_json(p_id uuid)
returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object('id',c.id,'authorId',c.author_id,'title',c.title,'content',c.content,
    'status',c.status,'version',c.version,'reviewerId',c.reviewer_id,'reviewNote',c.review_note,
    'createdAt',c.created_at,'reviewedAt',c.reviewed_at,'published',false,'retrievalEligible',false,
    'audit',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'actorId',a.actor_id,'action',a.action,
      'version',a.version,'createdAt',a.created_at) order by a.version) from knowledge_review_private.audit a where a.candidate_id=c.id),'[]'::jsonb))
    || coalesce((select jsonb_build_object('structured',jsonb_build_object(
      'source',s.declaration||jsonb_build_object('revisionId',s.id,'snippetHash',s.snippet_hash,'locatorStatus','unverified','usageStatus','unverified'),
      'assertion',a.assertion||jsonb_build_object('assertionId',a.assertion_id,'revision',a.revision,'expressions',a.expressions)))
      from knowledge_review_private.candidate_assertions a join knowledge_review_private.source_revisions s on s.id=a.source_revision_id where a.candidate_id=c.id),'{}'::jsonb)
  from knowledge_review_private.candidates c where c.id=p_id
$$;

-- Preserve the original transaction/identity/review implementation and remove its public reachability.
alter function public.ops_review_workspace(jsonb) set schema knowledge_review_private;
revoke all on function knowledge_review_private.ops_review_workspace(jsonb) from public,anon,authenticated,service_role;

create function knowledge_review_private.bounded_text(p_value jsonb,p_max integer)
returns boolean language sql immutable set search_path='' as $$
  select jsonb_typeof(p_value)='string' and length(p_value#>>'{}') between 1 and p_max and length(btrim(p_value#>>'{}'))>0
$$;

create function public.ops_review_workspace(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; op uuid; cid uuid; source_id uuid; s jsonb; a jsonb; v jsonb; e jsonb; outcome jsonb;
  prior_source jsonb; receipt knowledge_review_private.receipts%rowtype;
begin
  if p_input->>'action' is distinct from 'submit_assertion' then
    return knowledge_review_private.ops_review_workspace(p_input);
  end if;
  u:=knowledge_review_private.current_actor();
  s:=p_input->'source'; a:=p_input->'assertion'; e:=p_input->'expressions'; v:=a->'value';
  if jsonb_typeof(p_input) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_input))<>7
    or octet_length(p_input::text)>24000
    or jsonb_typeof(p_input->'operationId') is distinct from 'string'
    or (p_input->>'operationId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(p_input->'candidateId') is distinct from 'string'
    or (p_input->>'candidateId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or knowledge_review_private.bounded_text(p_input->'title',160) is distinct from true
    then raise exception 'INVALID_INPUT'; end if;
  if jsonb_typeof(s) is distinct from 'object' or (select count(*) from jsonb_object_keys(s))<>7
    or knowledge_review_private.bounded_text(s->'sourceKey',128) is distinct from true or (s->>'sourceKey') !~ '^[a-z][a-z0-9_-]{0,127}$'
    or knowledge_review_private.bounded_text(s->'revisionLabel',120) is distinct from true
    or knowledge_review_private.bounded_text(s->'publisher',160) is distinct from true
    or knowledge_review_private.bounded_text(s->'uri',1000) is distinct from true
    or (s->>'uri') !~ '^(https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[^?#[:space:]\\]*)?|urn:vpj15:synthetic:[a-z0-9:_-]+)$'
    or knowledge_review_private.bounded_text(s->'locator',240) is distinct from true
    or knowledge_review_private.bounded_text(s->'snippet',2000) is distinct from true
    or knowledge_review_private.bounded_text(s->'usageDeclaration',500) is distinct from true
    then raise exception 'INVALID_INPUT'; end if;
  if jsonb_typeof(a) is distinct from 'object' or (select count(*) from jsonb_object_keys(a))<>3
    or knowledge_review_private.bounded_text(a->'subjectId',128) is distinct from true or (a->>'subjectId') !~ '^[a-z][a-z0-9_-]{0,127}$'
    or a->>'claimType' is distinct from 'address' or jsonb_typeof(v) is distinct from 'object'
    then raise exception 'INVALID_INPUT'; end if;
  if exists(select 1 from jsonb_object_keys(v) k where k not in ('lines','locality','countryCode'))
    or jsonb_typeof(v->'lines') is distinct from 'array'
    or knowledge_review_private.bounded_text(v->'countryCode',2) is distinct from true or (v->>'countryCode') !~ '^[A-Z]{2}$'
    or (v ? 'locality' and knowledge_review_private.bounded_text(v->'locality',120) is distinct from true)
    then raise exception 'INVALID_INPUT'; end if;
  if jsonb_array_length(v->'lines') not between 1 and 3
    or exists(select 1 from jsonb_array_elements(v->'lines') line where knowledge_review_private.bounded_text(line,160) is distinct from true)
    or jsonb_typeof(e) is distinct from 'object' or (select count(*) from jsonb_object_keys(e))<>2
    or knowledge_review_private.bounded_text(e->'zh',1000) is distinct from true
    or knowledge_review_private.bounded_text(e->'en',1000) is distinct from true
    then raise exception 'INVALID_INPUT'; end if;
  op:=(p_input->>'operationId')::uuid; cid:=(p_input->>'candidateId')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text||':'||op::text,14));
  select * into receipt from knowledge_review_private.receipts where actor_id=u and operation_id=op;
  if found then
    if receipt.input<>p_input then raise exception 'OPS_CONFLICT'; end if;
    return receipt.result;
  end if;
  insert into knowledge_review_private.source_revisions(source_key,revision_label,declaration,snippet_hash,submitted_by)
    values(s->>'sourceKey',s->>'revisionLabel',s,encode(extensions.digest(convert_to(s->>'snippet','UTF8'),'sha256'),'hex'),u)
    on conflict(source_key,revision_label) do nothing;
  select id,declaration into source_id,prior_source from knowledge_review_private.source_revisions
    where source_key=s->>'sourceKey' and revision_label=s->>'revisionLabel' for share;
  if prior_source is distinct from s then raise exception 'OPS_CONFLICT'; end if;
  -- The original RPC remains responsible for candidate, actor-derived author, audit and receipt.
  perform knowledge_review_private.ops_review_workspace(jsonb_build_object('action','submit','operationId',op,
    'candidateId',cid,'title',p_input->>'title','content',e->>'en'));
  insert into knowledge_review_private.candidate_assertions(candidate_id,source_revision_id,assertion,expressions) values(cid,source_id,a,e);
  outcome:=knowledge_review_private.candidate_json(cid);
  update knowledge_review_private.receipts set input=p_input,result=outcome where actor_id=u and operation_id=op;
  if not found then raise exception 'OPS_CONFLICT'; end if;
  return outcome;
end $$;
revoke all on function knowledge_review_private.bounded_text(jsonb,integer) from public,anon,authenticated,service_role;
revoke all on function public.ops_review_workspace(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ops_review_workspace(jsonb) to authenticated;
