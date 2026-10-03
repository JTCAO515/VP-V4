-- VPJ17 source impact propagation only. No publication/source-policy/Trip edits,
-- provider/fetch/job activation, identity or EXECUTE grants.
create table knowledge_review_private.source_impact_sets(
 id uuid primary key default gen_random_uuid(),operation_id uuid unique not null,
 source_id uuid not null references knowledge_review_private.source_revisions(id),replacement_id uuid references knowledge_review_private.source_revisions(id),
 signal_kind text not null check(signal_kind in ('withdrawn','new_revision_available','observation_unavailable','parsing_difference')),
 source_snapshot jsonb not null,graph_snapshot jsonb not null,digest text not null check(digest ~ '^[a-f0-9]{64}$'),
 author_id uuid not null,status text not null default 'pending' check(status in ('pending','approved','rejected')),
 version bigint not null default 1 check(version>0),complete boolean not null default false,next_cursor text,item_count integer not null default 0 check(item_count between 0 and 1000),
 reviewer_id uuid,reviewer_member_revision bigint,review_base_version bigint,created_at timestamptz not null default clock_timestamp(),reviewed_at timestamptz,
 check(jsonb_typeof(graph_snapshot)='array' and jsonb_array_length(graph_snapshot)<=1000),
 check((status='pending')=(reviewer_id is null))
);
create table knowledge_review_private.source_impact_items(
 id uuid primary key default gen_random_uuid(),set_id uuid not null references knowledge_review_private.source_impact_sets(id) on delete cascade,
 target_key text not null,target jsonb not null,unique(set_id,target_key)
);
create table knowledge_review_private.source_impact_pages(
 set_id uuid not null references knowledge_review_private.source_impact_sets(id) on delete cascade,cursor_key text not null,base_version bigint not null,receipt jsonb not null,primary key(set_id,cursor_key)
);
create table knowledge_review_private.source_impact_outbox(
 id uuid primary key default gen_random_uuid(),set_id uuid not null references knowledge_review_private.source_impact_sets(id) on delete cascade,
 item_id uuid not null references knowledge_review_private.source_impact_items(id) on delete cascade,consumer text not null,
 review_version bigint not null,digest text not null,state text not null check(state in ('queued','leased','failed','acked','unsupported','exhausted')),
 attempt integer not null default 0 check(attempt between 0 and 8),lease_token uuid,expires_at timestamptz,next_attempt_at timestamptz not null default clock_timestamp(),error_code text,
 receipt_id uuid,created_at timestamptz not null default clock_timestamp(),acked_at timestamptz,unique(set_id,item_id,consumer)
);
create table knowledge_review_private.source_impact_projections(
 id uuid primary key default gen_random_uuid(),delivery_id uuid unique not null references knowledge_review_private.source_impact_outbox(id),
 set_id uuid not null references knowledge_review_private.source_impact_sets(id),target jsonb not null,source_snapshot jsonb not null,
 disposition text not null check(disposition='recheck_required'),review_version bigint not null,digest text not null,created_at timestamptz not null default clock_timestamp()
);
create table knowledge_review_private.source_impact_review_requests(
 delivery_id uuid primary key references knowledge_review_private.source_impact_outbox(id),projection_id uuid not null references knowledge_review_private.source_impact_projections(id),
 status text not null default 'pending' check(status='pending'),refresh_attempted boolean not null default false check(not refresh_attempted),cost_unknown boolean not null default true check(cost_unknown),cost_tokens bigint check(cost_tokens is null),created_at timestamptz not null default clock_timestamp()
);
create index source_impact_delivery_due on knowledge_review_private.source_impact_outbox(consumer,next_attempt_at,id) where state in ('queued','failed','leased');
create index source_impact_statement_source on knowledge_review_private.statement_sources(source_revision_id,candidate_id);
create index source_impact_wiki_sources on knowledge_review_private.wiki_page_revisions using gin(source_revision_ids);
create index source_impact_job_sources on knowledge_review_private.wiki_generation_jobs using gin(source_revision_ids);
do $$declare t text;begin foreach t in array array['source_impact_sets','source_impact_items','source_impact_pages','source_impact_outbox','source_impact_projections','source_impact_review_requests'] loop execute format('alter table knowledge_review_private.%I enable row level security',t);execute format('revoke all on knowledge_review_private.%I from public,anon,authenticated,service_role',t);end loop;end $$;

create function knowledge_review_private.impact_hash(p_data jsonb) returns text language sql immutable set search_path='' as $$select encode(sha256(convert_to(p_data::text,'UTF8')),'hex')$$;
create function knowledge_review_private.impact_source(p_source uuid,p_replacement uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s knowledge_review_private.source_revisions%rowtype;r knowledge_review_private.source_revisions%rowtype;
begin
 select * into s from knowledge_review_private.source_revisions where id=p_source for share nowait;if not found then return null;end if;
 if p_replacement is not null then select * into r from knowledge_review_private.source_revisions where id=p_replacement for share nowait;if not found or r.id=s.id or r.source_key<>s.source_key or r.created_at<=s.created_at then return null;end if;end if;
 return jsonb_build_object('id',s.id,'sourceKey',s.source_key,'revisionLabel',s.revision_label,'snippetHash',s.snippet_hash,'withdrawnAt',s.withdrawn_at,'submittedBy',s.submitted_by,
 'replacement',case when r.id is null then null else jsonb_build_object('id',r.id,'revisionLabel',r.revision_label,'snippetHash',r.snippet_hash,'withdrawnAt',r.withdrawn_at) end);
exception when lock_not_available then return null;end $$;

-- Actual relational metadata only; no private question/answer text or new Trip relationship.
create function knowledge_review_private.impact_graph(p_source uuid) returns jsonb language sql security definer set search_path='' as $$
 with linked as(select st.statement_id,st.revision,st.payload,p.fact_id,p.version publication_version,p.state publication_state from knowledge_review_private.statement_sources ss join knowledge_review_private.statements st on st.candidate_id=ss.candidate_id left join knowledge_review_private.publications p on p.candidate_id=st.candidate_id where ss.source_revision_id=p_source),
 targets as(
 select 'wiki_revision:'||r.id||':'||r.version key,jsonb_build_object('kind','wiki_revision','id',r.id,'version',r.version,'payloadHash',knowledge_review_private.impact_hash(jsonb_build_object('draft',r.draft_content,'sources',r.source_revision_ids,'statements',r.statement_refs,'validation',r.validation_status,'pageVersion',p.version)),'claimRefs','[]'::jsonb) target
 from knowledge_review_private.wiki_page_revisions r join knowledge_review_private.wiki_pages p on p.id=r.page_id where r.source_revision_ids @> array[p_source]
 union all
 select 'wiki_job:'||j.id||':1',jsonb_build_object('kind','wiki_job','id',j.id,'version',1,'payloadHash',knowledge_review_private.impact_hash(jsonb_build_object('status',j.status,'inputDigest',j.input_digest,'sources',j.source_revision_ids,'startedAt',j.started_at,'costTokens',j.cost_tokens,'costUnknown',j.cost_unknown)),'claimRefs','[]'::jsonb)
 from knowledge_review_private.wiki_generation_jobs j where j.source_revision_ids @> array[p_source] and j.status in('queued','running')
 union all
 select 'statement:'||l.statement_id||':'||coalesce(l.publication_version,l.revision),jsonb_build_object('kind','statement','id',l.statement_id,'version',coalesce(l.publication_version,l.revision),'payloadHash',knowledge_review_private.impact_hash(jsonb_build_object('payloadHash',knowledge_review_private.impact_hash(l.payload),'publicationVersion',l.publication_version,'publicationState',l.publication_state)),'claimRefs',case when l.fact_id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('factId',l.fact_id,'assertionId',l.statement_id,'revision',l.revision,'payloadHash',knowledge_review_private.impact_hash(l.payload))) end) from linked l
 union all
 select 'historical_answer:'||g.turn_id||':'||g.scope_version,jsonb_build_object('kind','historical_answer','id',g.turn_id,'version',g.scope_version,'payloadHash',knowledge_review_private.impact_hash(jsonb_build_object('publications',g.basis->'publications','completedAt',g.completed_at)),
 'claimRefs',(select coalesce(jsonb_agg(b order by b->>'factId'),'[]'::jsonb) from jsonb_array_elements(g.basis->'publications') b join linked l on b->>'factId'=l.fact_id::text and b->>'assertionId'=l.statement_id::text and b->>'revision'=l.revision::text))
 from turn_private.grounded_turns g where g.completed_at is not null and jsonb_typeof(g.basis->'publications')='array' and exists(select 1 from jsonb_array_elements(g.basis->'publications') b join linked l on b->>'factId'=l.fact_id::text and b->>'assertionId'=l.statement_id::text and b->>'revision'=l.revision::text)
 ),bounded as(select * from targets order by key limit 1001)
 select coalesce(jsonb_agg(jsonb_build_object('key',key,'target',target) order by key),'[]'::jsonb) from bounded
$$;
create function knowledge_review_private.impact_current(p_set uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare s knowledge_review_private.source_impact_sets%rowtype;source jsonb;graph jsonb;
begin
 select * into s from knowledge_review_private.source_impact_sets where id=p_set;if not found then return false;end if;
 source:=knowledge_review_private.impact_source(s.source_id,s.replacement_id);if source is null or source is distinct from s.source_snapshot then return false;end if;
 graph:=knowledge_review_private.impact_graph(s.source_id);if jsonb_array_length(graph)>1000 or graph is distinct from s.graph_snapshot then return false;end if;
 return s.digest=knowledge_review_private.impact_hash(jsonb_build_object('source',source,'kind',s.signal_kind,'graph',graph));
end $$;
create function knowledge_review_private.impact_receipt(p_set uuid) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('kind','captured','setId',id,'version',version,'digest',digest,'complete',complete,'itemCount',item_count,'nextCursor',next_cursor) from knowledge_review_private.source_impact_sets where id=p_set
$$;

create function public.capture_source_impact_v1(p_operation uuid,p_source uuid,p_expected_label text,p_expected_hash text,p_expected_withdrawn_at timestamptz,p_kind text,p_replacement uuid default null,p_limit integer default 100) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=knowledge_review_private.current_actor();src jsonb;graph jsonb;s knowledge_review_private.source_impact_sets%rowtype;part jsonb;last_key text;
begin
 if p_operation is null or p_source is null or p_limit is null or p_limit not between 1 and 100 or p_kind is null or p_kind not in('withdrawn','new_revision_available','observation_unavailable','parsing_difference') then return jsonb_build_object('kind','blocked');end if;
 src:=knowledge_review_private.impact_source(p_source,p_replacement);if src is null or src->>'revisionLabel' is distinct from p_expected_label or src->>'snippetHash' is distinct from p_expected_hash or (src->>'withdrawnAt')::timestamptz is distinct from p_expected_withdrawn_at or p_kind='withdrawn' and p_expected_withdrawn_at is null or p_kind='new_revision_available' and p_replacement is null or p_kind<>'new_revision_available' and p_replacement is not null then return jsonb_build_object('kind','stale');end if;
 select * into s from knowledge_review_private.source_impact_sets where operation_id=p_operation for update nowait;
 if found then if s.author_id<>u or s.source_id<>p_source or s.replacement_id is distinct from p_replacement or s.signal_kind<>p_kind or s.source_snapshot is distinct from src then return jsonb_build_object('kind','conflict');end if;if not knowledge_review_private.impact_current(s.id) then return jsonb_build_object('kind','stale');end if;return(select receipt from knowledge_review_private.source_impact_pages where set_id=s.id and cursor_key='');end if;
 graph:=knowledge_review_private.impact_graph(p_source);if jsonb_array_length(graph)>1000 then return jsonb_build_object('kind','blocked','reason','capacity');end if;
 insert into knowledge_review_private.source_impact_sets(operation_id,source_id,replacement_id,signal_kind,source_snapshot,graph_snapshot,digest,author_id)
 values(p_operation,p_source,p_replacement,p_kind,src,graph,knowledge_review_private.impact_hash(jsonb_build_object('source',src,'kind',p_kind,'graph',graph)),u) returning * into s;
 select coalesce(jsonb_agg(x order by x->>'key'),'[]'::jsonb) into part from(select value x from jsonb_array_elements(graph) with ordinality a(value,n) where n<=p_limit) a;
 insert into knowledge_review_private.source_impact_items(set_id,target_key,target) select s.id,x->>'key',x->'target' from jsonb_array_elements(part) x;
 select x->>'key' into last_key from jsonb_array_elements(part) x order by x->>'key' desc limit 1;
 update knowledge_review_private.source_impact_sets set item_count=jsonb_array_length(part),complete=jsonb_array_length(graph)<=p_limit,next_cursor=case when jsonb_array_length(graph)>p_limit then last_key else null end where id=s.id;
 insert into knowledge_review_private.source_impact_pages values(s.id,'',0,knowledge_review_private.impact_receipt(s.id));return knowledge_review_private.impact_receipt(s.id);
exception when lock_not_available or unique_violation then return jsonb_build_object('kind','conflict');end $$;

create function public.append_source_impact_v1(p_set uuid,p_expected_version bigint,p_expected_digest text,p_cursor text,p_limit integer default 100) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=knowledge_review_private.current_actor();s knowledge_review_private.source_impact_sets%rowtype;prior knowledge_review_private.source_impact_pages%rowtype;part jsonb;last_key text;remaining integer;
begin
 if p_cursor is null or length(p_cursor)>200 or p_limit is null or p_limit not between 1 and 100 then return jsonb_build_object('kind','blocked');end if;
 select * into s from knowledge_review_private.source_impact_sets where id=p_set for update nowait;if not found or s.author_id<>u then return jsonb_build_object('kind','blocked');end if;
 if not knowledge_review_private.impact_current(s.id) then return jsonb_build_object('kind','stale');end if;
 select * into prior from knowledge_review_private.source_impact_pages where set_id=s.id and cursor_key=p_cursor;if found then if prior.base_version is distinct from p_expected_version or s.digest is distinct from p_expected_digest then return jsonb_build_object('kind','conflict');end if;return prior.receipt;end if;
 if s.status<>'pending' or s.complete or s.version is distinct from p_expected_version or s.digest is distinct from p_expected_digest or s.next_cursor is distinct from p_cursor then return jsonb_build_object('kind','conflict');end if;
 select count(*) into remaining from jsonb_array_elements(s.graph_snapshot) x where x->>'key'>p_cursor;
 select coalesce(jsonb_agg(x order by x->>'key'),'[]'::jsonb) into part from(select value x from jsonb_array_elements(s.graph_snapshot) a(value) where value->>'key'>p_cursor order by value->>'key' limit p_limit) a;
 insert into knowledge_review_private.source_impact_items(set_id,target_key,target) select s.id,x->>'key',x->'target' from jsonb_array_elements(part) x;
 select x->>'key' into last_key from jsonb_array_elements(part) x order by x->>'key' desc limit 1;
 update knowledge_review_private.source_impact_sets set item_count=item_count+jsonb_array_length(part),version=version+1,complete=remaining<=p_limit,next_cursor=case when remaining>p_limit then last_key else null end where id=s.id;
 insert into knowledge_review_private.source_impact_pages values(s.id,p_cursor,p_expected_version,knowledge_review_private.impact_receipt(s.id));return knowledge_review_private.impact_receipt(s.id);
exception when lock_not_available or unique_violation then return jsonb_build_object('kind','conflict');end $$;

create function public.review_source_impact_v1(p_set uuid,p_expected_version bigint,p_expected_digest text,p_decision text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=knowledge_review_private.current_actor();s knowledge_review_private.source_impact_sets%rowtype;mr bigint;
begin
 select * into s from knowledge_review_private.source_impact_sets where id=p_set for update nowait;if not found or p_decision is null or p_decision not in('approve','reject') then return jsonb_build_object('kind','blocked');end if;
 if u=s.author_id or u::text=s.source_snapshot->>'submittedBy' then return jsonb_build_object('kind','blocked');end if;
 if not knowledge_review_private.impact_current(s.id) then return jsonb_build_object('kind','stale');end if;
 if s.status<>'pending' then if s.reviewer_id=u and s.review_base_version=p_expected_version and s.digest=p_expected_digest and s.status=(case p_decision when 'approve' then 'approved' else 'rejected' end) then return jsonb_build_object('kind','reviewed','setId',s.id,'version',s.version,'decision',p_decision,'digest',s.digest);else return jsonb_build_object('kind','conflict');end if;end if;
 if not s.complete or s.version is distinct from p_expected_version or s.digest is distinct from p_expected_digest then return jsonb_build_object('kind','conflict');end if;
 select revision into mr from knowledge_review_private.members where actor_id=u and active for share nowait;
 update knowledge_review_private.source_impact_sets set status=case p_decision when 'approve' then 'approved' else 'rejected' end,version=version+1,reviewer_id=u,reviewer_member_revision=mr,review_base_version=p_expected_version,reviewed_at=clock_timestamp() where id=s.id returning * into s;
 if s.status='approved' then insert into knowledge_review_private.source_impact_outbox(set_id,item_id,consumer,review_version,digest,state)
 select s.id,i.id,c.consumer,s.version,s.digest,case when c.consumer='knowledge_recheck_projection' then 'queued' else 'unsupported' end from knowledge_review_private.source_impact_items i cross join unnest(array['knowledge_recheck_projection','retrieval_index','cache','media','explore','seo','trip_item_support']) c(consumer) where i.set_id=s.id;end if;
 return jsonb_build_object('kind','reviewed','setId',s.id,'version',s.version,'decision',p_decision,'digest',s.digest);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;

create function public.read_source_impact_v1(p_set uuid,p_cursor text default null,p_limit integer default 100) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=knowledge_review_private.current_actor();s knowledge_review_private.source_impact_sets%rowtype;page jsonb;next_key text;more boolean;
begin
 if p_limit is null or p_limit not between 1 and 100 or p_cursor is not null and length(p_cursor)>200 then return jsonb_build_object('kind','blocked');end if;
 select * into s from knowledge_review_private.source_impact_sets where id=p_set;if not found then return jsonb_build_object('kind','blocked');end if;
 if p_cursor is not null and not exists(select 1 from knowledge_review_private.source_impact_items where set_id=s.id and target_key=p_cursor) then return jsonb_build_object('kind','conflict');end if;
 select coalesce(jsonb_agg(jsonb_build_object('key',target_key,'target',target) order by target_key),'[]'::jsonb) into page from(select target_key,target from knowledge_review_private.source_impact_items where set_id=s.id and (p_cursor is null or target_key>p_cursor) order by target_key limit p_limit) x;
 select x->>'key' into next_key from jsonb_array_elements(page) x order by x->>'key' desc limit 1;
 more:=next_key is not null and exists(select 1 from knowledge_review_private.source_impact_items where set_id=s.id and target_key>next_key);
 return jsonb_build_object('kind','set','setId',s.id,'version',s.version,'digest',s.digest,'status',s.status,'items',page,'nextCursor',case when more then next_key else null end,'complete',s.complete,'unsupportedConsumers',jsonb_build_array('retrieval_index','cache','media','explore','seo','trip_item_support'));
end $$;
create function knowledge_review_private.impact_review_current(p_set uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare valid boolean;
begin
 select true into valid from knowledge_review_private.source_impact_sets s join knowledge_review_private.members m on m.actor_id=s.reviewer_id where s.id=p_set and s.status='approved' and s.complete and m.active and m.revision=s.reviewer_member_revision for share of m nowait;
 if valid is distinct from true then return false;end if;return knowledge_review_private.impact_current(p_set);
exception when lock_not_available then return false;end $$;
create function knowledge_review_private.impact_delivery_wire(p_delivery uuid) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('kind','delivery','deliveryId',o.id,'setId',o.set_id,'reviewVersion',o.review_version,'sourceDigest',o.digest,'target',i.target,'state',o.state,'leaseToken',o.lease_token,'attempt',o.attempt,'receiptId',o.receipt_id) from knowledge_review_private.source_impact_outbox o join knowledge_review_private.source_impact_items i on i.id=o.item_id where o.id=p_delivery
$$;
create function public.claim_source_impact_delivery_v1(p_consumer text,p_limit integer default 1,p_lease_ms integer default 15000) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=knowledge_review_private.current_actor();o knowledge_review_private.source_impact_outbox%rowtype;target jsonb;
begin
 if p_consumer is null or p_limit is distinct from 1 or p_lease_ms is null or p_lease_ms not between 1 and 15000 then return jsonb_build_object('kind','blocked');end if;
 if p_consumer<>'knowledge_recheck_projection' then return jsonb_build_object('kind','unsupported');end if;
 update knowledge_review_private.source_impact_outbox set state='exhausted',error_code='attempt_limit' where consumer=p_consumer and state='leased' and expires_at<=clock_timestamp() and attempt=8;
 for o in select * from knowledge_review_private.source_impact_outbox where consumer=p_consumer and attempt<8 and ((state in('queued','failed') and next_attempt_at<=clock_timestamp()) or (state='leased' and expires_at<=clock_timestamp())) order by next_attempt_at,id limit 100 for update skip locked loop
  if not knowledge_review_private.impact_review_current(o.set_id) then continue;end if;
  update knowledge_review_private.source_impact_outbox set state='leased',attempt=attempt+1,lease_token=gen_random_uuid(),expires_at=clock_timestamp()+p_lease_ms*interval '1 millisecond',error_code=null where id=o.id returning * into o;
  select i.target into target from knowledge_review_private.source_impact_items i where i.id=o.item_id;
  return jsonb_build_object('kind','leased','deliveryId',o.id,'setId',o.set_id,'reviewVersion',o.review_version,'sourceDigest',o.digest,'target',target,'leaseToken',o.lease_token,'attempt',o.attempt);
 end loop;return jsonb_build_object('kind','idle');
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
create function public.apply_source_impact_projection_v1(p_delivery uuid,p_lease uuid,p_expected_attempt integer,p_expected_digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=knowledge_review_private.current_actor();o knowledge_review_private.source_impact_outbox%rowtype;s knowledge_review_private.source_impact_sets%rowtype;i knowledge_review_private.source_impact_items%rowtype;receipt uuid;
begin
 select * into o from knowledge_review_private.source_impact_outbox where id=p_delivery for update nowait;
 if not found or o.consumer<>'knowledge_recheck_projection' or o.lease_token is distinct from p_lease or o.attempt is distinct from p_expected_attempt or o.digest is distinct from p_expected_digest then return jsonb_build_object('kind','blocked');end if;
 if not knowledge_review_private.impact_review_current(o.set_id) then return jsonb_build_object('kind','stale');end if;
 select * into s from knowledge_review_private.source_impact_sets where id=o.set_id;if s.version<>o.review_version or s.digest<>o.digest then return jsonb_build_object('kind','stale');end if;
 if o.state='acked' and o.receipt_id is not null then return jsonb_build_object('kind','applied','deliveryId',o.id,'receiptId',o.receipt_id,'digest',o.digest);end if;
 if o.state<>'leased' or o.expires_at<=clock_timestamp() then return jsonb_build_object('kind','blocked');end if;
 select * into i from knowledge_review_private.source_impact_items where id=o.item_id;
 insert into knowledge_review_private.source_impact_projections(delivery_id,set_id,target,source_snapshot,disposition,review_version,digest) values(o.id,s.id,i.target,s.source_snapshot,'recheck_required',o.review_version,o.digest) returning id into receipt;
 insert into knowledge_review_private.source_impact_review_requests(delivery_id,projection_id) values(o.id,receipt);
 -- Projection effect, manual review request, immutable receipt ID and ACK commit together.
 update knowledge_review_private.source_impact_outbox set state='acked',receipt_id=receipt,acked_at=clock_timestamp() where id=o.id;
 return jsonb_build_object('kind','applied','deliveryId',o.id,'receiptId',receipt,'digest',o.digest);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
create function public.fail_source_impact_delivery_v1(p_delivery uuid,p_lease uuid,p_expected_attempt integer,p_expected_digest text,p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=knowledge_review_private.current_actor();o knowledge_review_private.source_impact_outbox%rowtype;s knowledge_review_private.source_impact_sets%rowtype;
begin
 if p_code is null or p_code not in('apply_ack_unknown','consumer_unavailable','stale_target','stale_source','transient_error') then return jsonb_build_object('kind','blocked');end if;
 select * into o from knowledge_review_private.source_impact_outbox where id=p_delivery for update nowait;
 if not found or o.consumer<>'knowledge_recheck_projection' or o.state<>'leased' or o.lease_token is distinct from p_lease or o.attempt is distinct from p_expected_attempt or o.digest is distinct from p_expected_digest then return jsonb_build_object('kind','blocked');end if;
 select * into s from knowledge_review_private.source_impact_sets where id=o.set_id;if s.status<>'approved' or s.version<>o.review_version or s.digest<>o.digest then return jsonb_build_object('kind','blocked');end if;
 update knowledge_review_private.source_impact_outbox set state=case when attempt=8 then 'exhausted' else 'failed' end,error_code=p_code,next_attempt_at=clock_timestamp()+least(power(2,attempt-1),3600)*interval '1 second' where id=o.id returning * into o;
 return jsonb_build_object('kind','failed','deliveryId',o.id,'nextAttemptAt',o.next_attempt_at);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
create function public.read_source_impact_delivery_v1(p_delivery uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=knowledge_review_private.current_actor();o knowledge_review_private.source_impact_outbox%rowtype;
begin
 select * into o from knowledge_review_private.source_impact_outbox where id=p_delivery;if not found then return jsonb_build_object('kind','blocked');end if;
 if not knowledge_review_private.impact_review_current(o.set_id) then return jsonb_build_object('kind','stale');end if;
 return knowledge_review_private.impact_delivery_wire(o.id);
end $$;
create function knowledge_review_private.immutable_source_impact_effect() returns trigger language plpgsql set search_path='' as $$begin raise exception 'IMMUTABLE_SOURCE_IMPACT_EFFECT';end $$;
create trigger immutable_source_impact_projection before update on knowledge_review_private.source_impact_projections for each row execute function knowledge_review_private.immutable_source_impact_effect();
create trigger immutable_source_impact_review_request before update on knowledge_review_private.source_impact_review_requests for each row execute function knowledge_review_private.immutable_source_impact_effect();
create trigger immutable_source_impact_item before update on knowledge_review_private.source_impact_items for each row execute function knowledge_review_private.immutable_source_impact_effect();
create trigger immutable_source_impact_page before update on knowledge_review_private.source_impact_pages for each row execute function knowledge_review_private.immutable_source_impact_effect();
revoke all on function knowledge_review_private.impact_hash(jsonb),knowledge_review_private.impact_source(uuid,uuid),knowledge_review_private.impact_graph(uuid),knowledge_review_private.impact_current(uuid),knowledge_review_private.impact_receipt(uuid),knowledge_review_private.impact_review_current(uuid),knowledge_review_private.impact_delivery_wire(uuid),knowledge_review_private.immutable_source_impact_effect() from public,anon,authenticated,service_role;
revoke all on function public.capture_source_impact_v1(uuid,uuid,text,text,timestamptz,text,uuid,integer),public.append_source_impact_v1(uuid,bigint,text,text,integer),public.read_source_impact_v1(uuid,text,integer),public.review_source_impact_v1(uuid,bigint,text,text),public.claim_source_impact_delivery_v1(text,integer,integer),public.apply_source_impact_projection_v1(uuid,uuid,integer,text),public.fail_source_impact_delivery_v1(uuid,uuid,integer,text,text),public.read_source_impact_delivery_v1(uuid) from public,anon,authenticated,service_role;
