-- VPJ-15: immutable bilingual statements, explicit publication and request-scoped first-party reads.
-- Existing probe fact_records and all previous candidate/source/receipt rows remain unchanged.
create table knowledge_review_private.statements (
  candidate_id uuid primary key references knowledge_review_private.candidates(id),
  statement_id uuid not null unique default gen_random_uuid(),
  revision integer not null default 1 check(revision=1),
  payload jsonb not null
);
create table knowledge_review_private.statement_sources (
  candidate_id uuid not null references knowledge_review_private.statements(candidate_id),
  source_revision_id uuid not null references knowledge_review_private.source_revisions(id),
  primary key(candidate_id,source_revision_id)
);
create table knowledge_review_private.publications (
  candidate_id uuid primary key references knowledge_review_private.statements(candidate_id),
  fact_id uuid not null unique default gen_random_uuid(),
  state text not null check(state in ('published','revoked')),
  version integer not null check(version in (1,2)),
  published_by uuid not null,
  published_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  use_basis text not null check(use_basis in ('original_factual_summary','explicit_licence')),
  use_note text not null,
  revoked_at timestamptz,
  check((state='published' and version=1 and revoked_at is null) or (state='revoked' and version=2 and revoked_at is not null)),
  check(expires_at>published_at)
);
create table knowledge_review_private.publication_audit (
  candidate_id uuid not null references knowledge_review_private.publications(candidate_id),
  version integer not null,
  actor_id uuid not null,
  action text not null check(action in ('published','revoked')),
  note text not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(candidate_id,version)
);
create table knowledge_review_private.publication_settings (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false
);
insert into knowledge_review_private.publication_settings(singleton) values(true);
alter table knowledge_review_private.statements enable row level security;
alter table knowledge_review_private.statement_sources enable row level security;
alter table knowledge_review_private.publications enable row level security;
alter table knowledge_review_private.publication_audit enable row level security;
alter table knowledge_review_private.publication_settings enable row level security;
revoke all on knowledge_review_private.statements,knowledge_review_private.statement_sources,
  knowledge_review_private.publications,knowledge_review_private.publication_audit,knowledge_review_private.publication_settings
  from public,anon,authenticated,service_role;

create function knowledge_review_private.closed_object(v jsonb,keys text[])
returns boolean language sql immutable set search_path='' as $$
  select case when jsonb_typeof(v)='object' then (select count(*) from jsonb_object_keys(v))=cardinality(keys) and v ?& keys else false end
$$;
create function knowledge_review_private.identifier_list(v jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(v) is distinct from 'array' then return false; end if;
  return jsonb_array_length(v)<=12
    and not exists(select 1 from jsonb_array_elements(v) x where jsonb_typeof(x) is distinct from 'string' or (x#>>'{}')!~'^[a-z][a-z0-9_-]{0,127}$')
    and (select count(distinct x) from jsonb_array_elements(v) x)=jsonb_array_length(v);
end $$;
create function knowledge_review_private.source_valid(s jsonb)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(knowledge_review_private.closed_object(s,array['sourceKey','revisionLabel','publisher','uri','locator','snippet','usageDeclaration'])
 and knowledge_review_private.bounded_text(s->'sourceKey',128) and (s->>'sourceKey')~'^[a-z][a-z0-9_-]{0,127}$'
 and knowledge_review_private.bounded_text(s->'revisionLabel',120) and knowledge_review_private.bounded_text(s->'publisher',160)
 and knowledge_review_private.bounded_text(s->'uri',1000)
 and (s->>'uri')~'^(https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[^?#[:space:]\\]*)?|urn:vpj15:synthetic:[a-z0-9:_-]+)$'
 and knowledge_review_private.bounded_text(s->'locator',240) and knowledge_review_private.bounded_text(s->'snippet',2000)
 and knowledge_review_private.bounded_text(s->'usageDeclaration',500),false)
$$;
create function knowledge_review_private.statement_valid(v jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare a jsonb:=v->'assertion'; s jsonb:=v->'scope'; e jsonb:=v->'expressions'; lang text; projection jsonb; kind text;
begin
 if not knowledge_review_private.closed_object(v,array['schemaVersion','assertion','scope','expressions','sources']) or v->>'schemaVersion' is distinct from 'knowledge-statement/1'
 or not knowledge_review_private.closed_object(a,array['subjectId','predicate','objectId','conditions','exclusions'])
 or knowledge_review_private.bounded_text(a->'subjectId',128) is distinct from true or (a->>'subjectId')!~'^[a-z][a-z0-9_-]{0,127}$'
 or knowledge_review_private.bounded_text(a->'objectId',128) is distinct from true or (a->>'objectId')!~'^[a-z][a-z0-9_-]{0,127}$'
 or coalesce(a->>'predicate','') not in ('offers_procedure','accepts_method','requires_document','requires_action','connects_to','provides_contact','permits_admission')
 or not knowledge_review_private.identifier_list(a->'conditions') or not knowledge_review_private.identifier_list(a->'exclusions')
 or not knowledge_review_private.closed_object(s,array['cities','scene','audience']) or s->>'audience' is distinct from 'international_independent_traveler'
 or coalesce(s->>'scene','') not in ('arrival','airport_transport','payment','connectivity','public_transport','taxi','rail','attraction','accommodation','emergency')
 or jsonb_typeof(s->'cities') is distinct from 'array'
 or not knowledge_review_private.closed_object(e,array['zh','en']) or jsonb_typeof(v->'sources') is distinct from 'array'
 then return false; end if;
 foreach lang in array array['zh','en'] loop
  projection:=e->lang;
  if not knowledge_review_private.closed_object(projection,array['text','conditions','exclusions']) or knowledge_review_private.bounded_text(projection->'text',1000) is distinct from true then return false; end if;
  foreach kind in array array['conditions','exclusions'] loop
   if jsonb_typeof(projection->kind) is distinct from 'array' then return false; end if;
   if jsonb_array_length(projection->kind)<>jsonb_array_length(a->kind) or exists(select 1 from jsonb_array_elements(projection->kind) x where knowledge_review_private.bounded_text(x,240) is distinct from true) then return false; end if;
  end loop;
 end loop;
 return jsonb_array_length(s->'cities') between 1 and 4
 and (select count(distinct x) from jsonb_array_elements(s->'cities') x)=jsonb_array_length(s->'cities')
 and not exists(select 1 from jsonb_array_elements(s->'cities') x where jsonb_typeof(x) is distinct from 'string' or x#>>'{}' not in ('shanghai','beijing','guangzhou','chongqing'))
 and jsonb_array_length(v->'sources') between 1 and 3
 and not exists(select 1 from jsonb_array_elements(v->'sources') x where not knowledge_review_private.source_valid(x))
 and (select count(distinct (x->>'sourceKey',x->>'revisionLabel')) from jsonb_array_elements(v->'sources') x)=jsonb_array_length(v->'sources');
end $$;

create or replace function knowledge_review_private.candidate_json(p_id uuid)
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'authorId',c.author_id,'title',c.title,'content',c.content,
 'status',c.status,'version',c.version,'reviewerId',c.reviewer_id,'reviewNote',c.review_note,'createdAt',c.created_at,'reviewedAt',c.reviewed_at,
 'published',coalesce(p.state='published',false),'retrievalEligible',false,
 'audit',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'actorId',a.actor_id,'action',a.action,'version',a.version,'createdAt',a.created_at) order by a.version) from knowledge_review_private.audit a where a.candidate_id=c.id),'[]'::jsonb))
 || coalesce((select jsonb_build_object('structured',jsonb_build_object('source',s.declaration||jsonb_build_object('revisionId',s.id,'snippetHash',s.snippet_hash,'locatorStatus','unverified','usageStatus','unverified'),
 'assertion',a.assertion||jsonb_build_object('assertionId',a.assertion_id,'revision',a.revision,'expressions',a.expressions))) from knowledge_review_private.candidate_assertions a join knowledge_review_private.source_revisions s on s.id=a.source_revision_id where a.candidate_id=c.id),'{}'::jsonb)
 || case when t.candidate_id is null then '{}'::jsonb else jsonb_build_object('statement',t.payload) end
 || case when p.candidate_id is null then '{}'::jsonb else jsonb_build_object('publication',jsonb_build_object('state',p.state,'version',p.version,'expiresAt',p.expires_at)) end
 from knowledge_review_private.candidates c left join knowledge_review_private.statements t on t.candidate_id=c.id left join knowledge_review_private.publications p on p.candidate_id=c.id where c.id=p_id
$$;
-- Retain the existing source producer and its precise legacy receipts.
alter function public.ops_review_workspace(jsonb) rename to ops_review_workspace_source_v1;
alter function public.ops_review_workspace_source_v1(jsonb) set schema knowledge_review_private;
revoke all on function knowledge_review_private.ops_review_workspace_source_v1(jsonb) from public,anon,authenticated,service_role;
create function public.ops_review_workspace(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; op uuid; cid uuid; act text; v jsonb; src jsonb; sid uuid; prior jsonb; out jsonb; expiry timestamptz;
 c knowledge_review_private.candidates%rowtype; receipt knowledge_review_private.receipts%rowtype; pub knowledge_review_private.publications%rowtype;
begin
 act:=p_input->>'action';
 if act is null or act not in ('submit_statement','publish_statement','revoke_statement') then return knowledge_review_private.ops_review_workspace_source_v1(p_input); end if;
 u:=knowledge_review_private.current_actor();
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>24000
 or jsonb_typeof(p_input->'operationId') is distinct from 'string' or (p_input->>'operationId')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 or jsonb_typeof(p_input->'candidateId') is distinct from 'string' or (p_input->>'candidateId')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'INVALID_INPUT'; end if;
 op:=(p_input->>'operationId')::uuid; cid:=(p_input->>'candidateId')::uuid;
 if act='submit_statement' then
  if not knowledge_review_private.closed_object(p_input,array['action','operationId','candidateId','title','statement']) or knowledge_review_private.bounded_text(p_input->'title',160) is distinct from true or not knowledge_review_private.statement_valid(p_input->'statement') then raise exception 'INVALID_INPUT'; end if;
 elsif act='publish_statement' then
  if not knowledge_review_private.closed_object(p_input,array['action','operationId','candidateId','expectedVersion','expiresAt','useBasis','useNote']) or p_input->'expectedVersion' is distinct from '2'::jsonb
   or coalesce(p_input->>'useBasis','') not in ('original_factual_summary','explicit_licence') or knowledge_review_private.bounded_text(p_input->'useNote',1000) is distinct from true
   or jsonb_typeof(p_input->'expiresAt') is distinct from 'string' or (p_input->>'expiresAt')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$' then raise exception 'INVALID_INPUT'; end if;
  begin expiry:=(p_input->>'expiresAt')::timestamptz; exception when invalid_datetime_format or datetime_field_overflow then raise exception 'INVALID_INPUT'; end;
 else
  if not knowledge_review_private.closed_object(p_input,array['action','operationId','candidateId','expectedPublicationVersion','note']) or p_input->'expectedPublicationVersion' is distinct from '1'::jsonb or knowledge_review_private.bounded_text(p_input->'note',400) is distinct from true then raise exception 'INVALID_INPUT'; end if;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text||':'||op::text,14));
 select * into receipt from knowledge_review_private.receipts where actor_id=u and operation_id=op;
 if found then
  if receipt.input<>p_input then raise exception 'OPS_CONFLICT'; end if;
  -- A receipt describes the historical operation; clients must refresh for current state.
  return receipt.result;
 end if;
 if act='submit_statement' then
  v:=p_input->'statement';
  perform knowledge_review_private.ops_review_workspace(jsonb_build_object('action','submit','operationId',op,'candidateId',cid,'title',p_input->>'title','content',v->'expressions'->'en'->>'text'));
  insert into knowledge_review_private.statements(candidate_id,payload) values(cid,v);
  -- Stable lock order for candidates sharing several immutable source revisions.
  for src in select x from jsonb_array_elements(v->'sources') x order by x->>'sourceKey',x->>'revisionLabel' loop
   insert into knowledge_review_private.source_revisions(source_key,revision_label,declaration,snippet_hash,submitted_by)
   values(src->>'sourceKey',src->>'revisionLabel',src,encode(extensions.digest(convert_to(src->>'snippet','UTF8'),'sha256'),'hex'),u) on conflict(source_key,revision_label) do nothing;
   select id,declaration into sid,prior from knowledge_review_private.source_revisions where source_key=src->>'sourceKey' and revision_label=src->>'revisionLabel' for share;
   if prior is distinct from src then raise exception 'OPS_CONFLICT'; end if;
   insert into knowledge_review_private.statement_sources(candidate_id,source_revision_id) values(cid,sid);
  end loop;
  out:=knowledge_review_private.candidate_json(cid);
  update knowledge_review_private.receipts set input=p_input,result=out where actor_id=u and operation_id=op;
  return out;
 end if;
 select * into c from knowledge_review_private.candidates where id=cid for update;
 if not found or not exists(select 1 from knowledge_review_private.statements where candidate_id=cid) then raise exception 'OPS_NOT_FOUND'; end if;
 select * into pub from knowledge_review_private.publications where candidate_id=cid for update;
 if act='publish_statement' then
  if c.author_id=u then raise exception 'OPS_SELF_REVIEW'; end if;
  if c.status<>'reviewed' or c.version<>2 or c.reviewer_id<>u or pub.candidate_id is not null then raise exception 'OPS_CONFLICT'; end if;
  if expiry<=clock_timestamp() or expiry>clock_timestamp()+interval '90 days' then raise exception 'INVALID_INPUT'; end if;
  insert into knowledge_review_private.publications(candidate_id,state,version,published_by,expires_at,use_basis,use_note) values(cid,'published',1,u,expiry,p_input->>'useBasis',p_input->>'useNote');
  insert into knowledge_review_private.publication_audit(candidate_id,version,actor_id,action,note) values(cid,1,u,'published',p_input->>'useNote');
  out:=jsonb_build_object('operationId',op,'candidateId',cid,'operationOutcome','published','publicationVersion',1);
 else
  if pub.candidate_id is null or pub.state<>'published' or pub.version<>1 then raise exception 'OPS_CONFLICT'; end if;
  update knowledge_review_private.publications set state='revoked',version=2,revoked_at=clock_timestamp() where candidate_id=cid;
  insert into knowledge_review_private.publication_audit(candidate_id,version,actor_id,action,note) values(cid,2,u,'revoked',p_input->>'note');
  out:=jsonb_build_object('operationId',op,'candidateId',cid,'operationOutcome','revoked','publicationVersion',2);
 end if;
 insert into knowledge_review_private.receipts(actor_id,operation_id,input,result) values(u,op,p_input,out);
 return out;
end $$;

-- The product obtains only the bilingual projection and provenance, never source snippets or editor notes.
create function public.knowledge_read_v1(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); sess uuid:=(auth.jwt()->>'session_id')::uuid; instant timestamptz; result jsonb;
begin
 if u is null or sess is null then raise exception 'UNAUTHENTICATED'; end if;
 perform 1 from auth.users where id=u for key share nowait;
 if not found then raise exception 'UNAUTHENTICATED'; end if;
 insert into identity_private.mobile_accounts(owner_id) values(u) on conflict do nothing;
 perform identity_private.guard_mobile_rpc_v2();
 perform 1 from auth.sessions where id=sess and user_id=u for key share;
 if not found then raise exception 'UNAUTHENTICATED'; end if;
 if not knowledge_review_private.closed_object(p_input,array['city','scene','locale'])
  or coalesce(p_input->>'city','') not in ('shanghai','beijing','guangzhou','chongqing')
  or coalesce(p_input->>'scene','') not in ('arrival','airport_transport','payment','connectivity','public_transport','taxi','rail','attraction','accommodation','emergency')
  or coalesce(p_input->>'locale','') not in ('zh','en') then raise exception 'INVALID_INPUT'; end if;
 perform 1 from knowledge_review_private.publication_settings where singleton and enabled for share;
 if not found then raise exception 'KNOWLEDGE_DISABLED'; end if;
 -- Serialize each read with a committed revocation; a receipt is never permanent eligibility.
 perform p.candidate_id from knowledge_review_private.publications p join knowledge_review_private.statements s on s.candidate_id=p.candidate_id
 where p.state='published' and s.payload->'scope'->'cities' ? (p_input->>'city') and s.payload->'scope'->>'scene'=p_input->>'scene' order by p.candidate_id for share of p;
 instant:=clock_timestamp();
 select coalesce(jsonb_agg(x.row order by x.id),'[]'::jsonb) into result from (
  select p.fact_id id,jsonb_build_object('factId',p.fact_id,'version',1,'assertionId',s.statement_id,'assertionRevision',s.revision,
   'assertion',s.payload->'assertion','scope',s.payload->'scope','text',s.payload->'expressions'->(p_input->>'locale')->>'text',
   'conditions',s.payload->'expressions'->(p_input->>'locale')->'conditions','exclusions',s.payload->'expressions'->(p_input->>'locale')->'exclusions',
   'reviewedAt',c.reviewed_at,'publishedAt',p.published_at,'expiresAt',p.expires_at,
   'sources',(select jsonb_agg(jsonb_build_object('sourceRevisionId',r.id,'sourceKey',r.source_key,'revisionLabel',r.revision_label,'publisher',r.declaration->>'publisher','uri',r.declaration->>'uri','locator',r.declaration->>'locator') order by r.source_key,r.revision_label) from knowledge_review_private.statement_sources ss join knowledge_review_private.source_revisions r on r.id=ss.source_revision_id where ss.candidate_id=c.id)) row
  from knowledge_review_private.publications p join knowledge_review_private.statements s on s.candidate_id=p.candidate_id join knowledge_review_private.candidates c on c.id=p.candidate_id
  where p.state='published' and p.expires_at>instant and c.status='reviewed' and s.payload->'scope'->'cities' ? (p_input->>'city') and s.payload->'scope'->>'scene'=p_input->>'scene'
  order by p.fact_id limit 50
 ) x;
 return jsonb_build_object('schemaVersion','knowledge-read/1','evaluatedAt',instant,'scope',p_input,
  'purpose','trip_planning','recipient','first_party','territory','CN-mainland','status',case when jsonb_array_length(result)>0 then 'available' else 'no_eligible_content' end,'statements',result);
end $$;
revoke all on all functions in schema knowledge_review_private from public,anon,authenticated,service_role;
revoke all on function public.ops_review_workspace(jsonb),public.knowledge_read_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ops_review_workspace(jsonb),public.knowledge_read_v1(jsonb) to authenticated;
