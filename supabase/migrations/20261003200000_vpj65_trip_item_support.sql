-- Support sidecar only. Never a second Trip writer, new source publisher,
-- role/grant, supplier fetch/fee or implicit ordinary-confirm support issuer.
create schema trip_support_private;
revoke all on schema trip_support_private from public,anon,authenticated,service_role;
create table trip_support_private.entity_mappings(
 id uuid primary key default gen_random_uuid(),operation_id uuid unique not null,request_digest text not null,
 canonical_poi_id uuid not null references public.canonical_pois(id) on delete cascade,
 statement_id uuid not null references knowledge_review_private.statements(statement_id),claim_revision integer not null,payload_hash text not null,source_digest text not null,
 source_refs jsonb not null,canonical_hash text not null,basis_metadata jsonb not null,author_id uuid not null,
 version bigint not null default 1,status text not null default 'pending' check(status in('pending','approved','rejected')),
 reviewer_id uuid,reviewer_member_revision bigint,reviewed_at timestamptz,created_at timestamptz not null default clock_timestamp(),
 check(version>0 and claim_revision>0 and payload_hash ~ '^[a-f0-9]{64}$' and source_digest ~ '^[a-f0-9]{64}$'),
 check(jsonb_typeof(source_refs)='array' and jsonb_array_length(source_refs) between 1 and 8)
);
create table trip_support_private.preparations(
 id uuid primary key default gen_random_uuid(),operation_id uuid not null,owner_id uuid not null references auth.users(id) on delete cascade,
 trip_id uuid not null references public.trips(id) on delete cascade,proposal_id uuid not null references public.trip_proposals(id) on delete cascade,
 place_reference_id uuid not null references public.trip_place_references(id) on delete cascade,mapping_id uuid not null references trip_support_private.entity_mappings(id),mapping_version bigint not null,
 proposal_revision integer not null,base_version integer not null,proposal_digest text not null,day_id text not null,item_id text not null,item_digest text not null,
 scope text not null check(scope in('address_reference','opening_window_reference')),applicability text not null check(applicability in('unverified','matched')),
 city text not null,scene text not null,locale text not null,statement_id uuid not null,claim_revision integer not null,payload_hash text not null,
 source_digest text not null,source_refs jsonb not null,typed_claim jsonb not null,request_digest text not null,
 version bigint not null default 1,status text not null default 'prepared' check(status in('prepared','revoked','consumed')),expires_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),
 unique(owner_id,operation_id),check(day_id ~ '^[A-Za-z0-9_-]{1,64}$' and item_id ~ '^[A-Za-z0-9_-]{1,64}$')
);
create table trip_support_private.confirm_proofs(
 transaction_id xid8 not null,owner_id uuid not null references auth.users(id) on delete cascade,
 trip_id uuid not null references public.trips(id) on delete cascade,proposal_id uuid not null references public.trip_proposals(id) on delete cascade,
 proposal_revision integer not null,base_version integer not null,proposal_digest text not null,selection jsonb not null,
 primary key(transaction_id,proposal_id),check(jsonb_typeof(selection)='array' and jsonb_array_length(selection) between 1 and 8)
);
create table trip_support_private.item_supports(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 trip_id uuid not null references public.trips(id) on delete cascade,proposal_id uuid not null references public.trip_proposals(id) on delete cascade,
 event_id uuid not null references public.trip_events(id) on delete cascade,receipt_id uuid unique not null references trip_support_private.preparations(id) on delete cascade,
 resulting_trip_version integer not null,day_id text not null,item_id text not null,item_digest text not null,
 scope text not null,applicability text not null,status text not null check(status in('reference_current','recheck_required','blocked','revoked')),
 version bigint not null default 1,claim_revision integer not null,payload_hash text not null,source_digest text not null,source_refs jsonb not null,
 created_at timestamptz not null default clock_timestamp(),check(day_id ~ '^[A-Za-z0-9_-]{1,64}$' and item_id ~ '^[A-Za-z0-9_-]{1,64}$')
);
create table trip_support_private.support_receipts(
 id uuid primary key default gen_random_uuid(),support_id uuid not null references trip_support_private.item_supports(id) on delete cascade,
 version bigint not null,action text not null check(action in('bound','recheck','renewed','revoked')),source_digest text not null,
 created_at timestamptz not null default clock_timestamp(),unique(support_id,version)
);
do $$declare t text;begin foreach t in array array['entity_mappings','preparations','confirm_proofs','item_supports','support_receipts'] loop execute format('alter table trip_support_private.%I enable row level security',t);execute format('revoke all on trip_support_private.%I from public,anon,authenticated,service_role',t);end loop;end $$;

create function trip_support_private.hash(p_value jsonb) returns text language sql immutable set search_path='' as $$select encode(sha256(convert_to(p_value::text,'UTF8')),'hex')$$;
create function trip_support_private.owner() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();sess uuid:=(auth.jwt()->>'session_id')::uuid;
begin
 if u is null or sess is null then raise exception 'UNAUTHENTICATED';end if;
 perform 1 from auth.users where id=u for key share nowait;if not found then raise exception 'UNAUTHENTICATED';end if;
 perform identity_private.guard_mobile_rpc_v2();perform 1 from auth.sessions where id=sess and user_id=u for share nowait;if not found then raise exception 'UNAUTHENTICATED';end if;return u;
end $$;
-- Mint from currently qualified real publication, never caller C0 JSON/boolean.
create function trip_support_private.claim_basis(p_statement uuid,p_revision integer,p_hash text,p_city text,p_scene text,p_locale text) returns jsonb language plpgsql security definer set search_path='' as $$
declare st knowledge_review_private.statements%rowtype;p knowledge_review_private.publications%rowtype;c knowledge_review_private.candidates%rowtype;readback jsonb;found_fact jsonb;sources jsonb;
begin
 select * into st from knowledge_review_private.statements where statement_id=p_statement for share nowait;if not found or st.revision is distinct from p_revision or trip_support_private.hash(st.payload) is distinct from p_hash then return null;end if;
 select * into p from knowledge_review_private.publications where candidate_id=st.candidate_id for share nowait;if not found or p.state<>'published' or p.expires_at<=clock_timestamp() then return null;end if;
 select * into c from knowledge_review_private.candidates where id=st.candidate_id for share nowait;if not found or c.status<>'reviewed' then return null;end if;
 readback:=public.knowledge_read_v1(jsonb_build_object('city',p_city,'scene',p_scene,'locale',p_locale));
 select x into found_fact from jsonb_array_elements(readback->'statements') x where x->>'factId'=p.fact_id::text and x->>'assertionId'=st.statement_id::text and x->>'assertionRevision'=st.revision::text;
 if found_fact is null then return null;end if;
 select coalesce(jsonb_agg(jsonb_build_object('sourceRevisionId',r.id,'revisionLabel',r.revision_label,'snippetHash',r.snippet_hash,'submittedBy',r.submitted_by) order by r.id),'[]'::jsonb) into sources from knowledge_review_private.statement_sources ss join knowledge_review_private.source_revisions r on r.id=ss.source_revision_id where ss.candidate_id=st.candidate_id and r.withdrawn_at is null;
 if jsonb_array_length(sources) not between 1 and 8 or jsonb_array_length(sources)<>(select count(*) from knowledge_review_private.statement_sources where candidate_id=st.candidate_id) then return null;end if;
 return jsonb_build_object('statementId',st.statement_id,'claimRevision',st.revision,'payloadHash',p_hash,'payload',st.payload,'sourceRefs',sources,'sourceDigest',trip_support_private.hash(sources),'receipt',jsonb_build_object('kind','fact','factId',p.fact_id,'version',p.version,'reviewedAt',c.reviewed_at,'expiresAt',p.expires_at));
exception when lock_not_available then return null;end $$;
revoke all on function trip_support_private.hash(jsonb),trip_support_private.owner(),trip_support_private.claim_basis(uuid,integer,text,text,text,text) from public,anon,authenticated,service_role;

create function public.submit_trip_support_entity_mapping_v1(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=knowledge_review_private.current_actor();basis jsonb;poi public.canonical_pois%rowtype;m trip_support_private.entity_mappings%rowtype;digest text;
begin
 if not knowledge_review_private.closed_object(p_input,array['operationId','canonicalPoiId','statementId','expectedClaimRevision','expectedPayloadHash','expectedSourceDigest','basisMetadata']) or not knowledge_review_private.closed_object(p_input->'basisMetadata',array['city','scene','locale','sourceRefs']) then return jsonb_build_object('kind','blocked');end if;
 select * into poi from public.canonical_pois where id=(p_input->>'canonicalPoiId')::uuid for share nowait;if not found then return jsonb_build_object('kind','blocked');end if;
 basis:=trip_support_private.claim_basis((p_input->>'statementId')::uuid,(p_input->>'expectedClaimRevision')::integer,p_input->>'expectedPayloadHash',p_input->'basisMetadata'->>'city',p_input->'basisMetadata'->>'scene',p_input->'basisMetadata'->>'locale');
 if basis is null or basis->>'sourceDigest' is distinct from p_input->>'expectedSourceDigest' or basis->'sourceRefs' is distinct from p_input->'basisMetadata'->'sourceRefs' or basis->'payload'->'assertion'->>'predicate' not in('located_at','opens_during') then return jsonb_build_object('kind','stale');end if;
 digest:=trip_support_private.hash(p_input);select * into m from trip_support_private.entity_mappings where operation_id=(p_input->>'operationId')::uuid for update nowait;
 if found then if m.author_id<>u or m.request_digest<>digest then return jsonb_build_object('kind','conflict');end if;return jsonb_build_object('kind','mapping_candidate','mappingId',m.id,'version',m.version,'digest',m.request_digest,'status',m.status);end if;
 insert into trip_support_private.entity_mappings(operation_id,request_digest,canonical_poi_id,statement_id,claim_revision,payload_hash,source_digest,source_refs,canonical_hash,basis_metadata,author_id)
 values((p_input->>'operationId')::uuid,digest,poi.id,(p_input->>'statementId')::uuid,(p_input->>'expectedClaimRevision')::integer,p_input->>'expectedPayloadHash',p_input->>'expectedSourceDigest',basis->'sourceRefs',trip_support_private.hash(to_jsonb(poi)),p_input->'basisMetadata',u) returning * into m;
 return jsonb_build_object('kind','mapping_candidate','mappingId',m.id,'version',m.version,'digest',m.request_digest,'status',m.status);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
create function trip_support_private.mapping_basis(p_mapping uuid,p_require_approved boolean default true) returns jsonb language plpgsql security definer set search_path='' as $$
declare m trip_support_private.entity_mappings%rowtype;p public.canonical_pois%rowtype;basis jsonb;member_revision bigint;
begin
 select * into m from trip_support_private.entity_mappings where id=p_mapping;if not found or p_require_approved and m.status<>'approved' then return null;end if;
 select * into p from public.canonical_pois where id=m.canonical_poi_id for share nowait;if not found or trip_support_private.hash(to_jsonb(p))<>m.canonical_hash then return null;end if;
 if p_require_approved then select revision into member_revision from knowledge_review_private.members where actor_id=m.reviewer_id and active for share nowait;if member_revision is distinct from m.reviewer_member_revision then return null;end if;end if;
 basis:=trip_support_private.claim_basis(m.statement_id,m.claim_revision,m.payload_hash,m.basis_metadata->>'city',m.basis_metadata->>'scene',m.basis_metadata->>'locale');if basis is null or basis->>'sourceDigest'<>m.source_digest or basis->'sourceRefs' is distinct from m.source_refs then return null;end if;
 return basis||jsonb_build_object('mappingId',m.id,'mappingVersion',m.version,'mappingDigest',m.request_digest,'canonicalPoiId',m.canonical_poi_id);
exception when lock_not_available then return null;end $$;
create function public.review_trip_support_entity_mapping_v1(p_mapping uuid,p_expected_version bigint,p_expected_digest text,p_decision text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=knowledge_review_private.current_actor();m trip_support_private.entity_mappings%rowtype;basis jsonb;member_revision bigint;
begin
 if p_decision is null or p_decision not in('approve','reject') then return jsonb_build_object('kind','blocked');end if;
 select * into m from trip_support_private.entity_mappings where id=p_mapping for update nowait;if not found or m.author_id=u or exists(select 1 from jsonb_array_elements(m.source_refs) x where x->>'submittedBy'=u::text) then return jsonb_build_object('kind','blocked');end if;
 if m.status<>'pending' or m.version is distinct from p_expected_version or m.request_digest is distinct from p_expected_digest then return jsonb_build_object('kind','conflict');end if;
 basis:=trip_support_private.mapping_basis(m.id,false);if basis is null then return jsonb_build_object('kind','stale');end if;
 select revision into member_revision from knowledge_review_private.members where actor_id=u and active for share nowait;
 update trip_support_private.entity_mappings set status=case p_decision when 'approve' then 'approved' else 'rejected' end,version=version+1,reviewer_id=u,reviewer_member_revision=member_revision,reviewed_at=clock_timestamp() where id=m.id returning * into m;
 return jsonb_build_object('kind','mapping_reviewed','mappingId',m.id,'version',m.version,'digest',m.request_digest,'status',m.status);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
-- Extract an exact user-created case-sensitive item; never infer a place from title.
create function trip_support_private.item(p_content jsonb,p_day text,p_item text) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('day',d-'items','item',i) from jsonb_array_elements(p_content->'days') d cross join lateral jsonb_array_elements(d->'items') i where d->>'id'=p_day and i->>'id'=p_item
$$;
create function trip_support_private.typed_claim(p_basis jsonb,p_scope text) returns jsonb language plpgsql immutable set search_path='' as $$
declare payload jsonb:=p_basis->'payload';kind text;value jsonb;
begin
 if p_scope='address_reference' and payload->'assertion'->>'predicate'='located_at' and payload->'assertion'->>'objectId'='place_address' then kind:='address';
 elsif p_scope='opening_window_reference' and payload->'assertion'->>'predicate'='opens_during' and payload->'assertion'->>'objectId'='opening_hours' then kind:='time_window';else return null;end if;
 value:=payload->'value';if jsonb_typeof(value) is distinct from 'object' then return null;end if;
 return jsonb_build_object('claimType',kind,'subjectId',payload->'assertion'->>'subjectId','value',value,'asOf',p_basis->'receipt'->'reviewedAt','evidence',jsonb_build_array(p_basis->'receipt'));
end $$;
revoke all on function public.submit_trip_support_entity_mapping_v1(jsonb),public.review_trip_support_entity_mapping_v1(uuid,bigint,text,text),trip_support_private.mapping_basis(uuid,boolean),trip_support_private.item(jsonb,text,text),trip_support_private.typed_claim(jsonb,text) from public,anon,authenticated,service_role;

create function public.prepare_trip_item_support_v1(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=trip_support_private.owner();t public.trips%rowtype;p public.trip_proposals%rowtype;r public.trip_place_references%rowtype;m trip_support_private.entity_mappings%rowtype;s trip_support_private.preparations%rowtype;basis jsonb;content jsonb;item jsonb;claim jsonb;fingerprint text;request_hash text;
begin
 if not knowledge_review_private.closed_object(p_input,array['operationId','tripId','placeReferenceId','dayId','itemId','proposalId','expectedProposalRevision','expectedBaseVersion','expectedProposalDigest','expectedItemDigest','mappingId','expectedMappingVersion','expectedMappingDigest','city','scene','locale','scope','expectedClaimRevision','expectedPayloadHash','expectedSourceDigest']) or p_input->>'dayId' !~ '^[A-Za-z0-9_-]{1,64}$' or p_input->>'itemId' !~ '^[A-Za-z0-9_-]{1,64}$' or p_input->>'scope' not in('address_reference','opening_window_reference') then return jsonb_build_object('kind','blocked');end if;
 select * into t from public.trips where id=(p_input->>'tripId')::uuid and owner_id=u for update nowait;if not found then return jsonb_build_object('kind','blocked');end if;
 select * into p from public.trip_proposals where id=(p_input->>'proposalId')::uuid and trip_id=t.id and owner_id=u for update nowait;
 if not found or p.status<>'pending' or p.expires_at<=clock_timestamp() or p.revision is distinct from (p_input->>'expectedProposalRevision')::integer or p.base_trip_version is distinct from (p_input->>'expectedBaseVersion')::integer or t.head_version<>p.base_trip_version then return jsonb_build_object('kind','stale');end if;
 select digest into fingerprint from public.read_trip_proposal_v2(p.id);if fingerprint is distinct from p_input->>'expectedProposalDigest' then return jsonb_build_object('kind','stale');end if;
 select * into r from public.trip_place_references where id=(p_input->>'placeReferenceId')::uuid and trip_id=t.id and owner_id=u and reference_kind='canonical' for share nowait;if not found then return jsonb_build_object('kind','blocked');end if;
 select * into m from trip_support_private.entity_mappings where id=(p_input->>'mappingId')::uuid and canonical_poi_id=r.canonical_poi_id;
 if not found or m.version is distinct from (p_input->>'expectedMappingVersion')::bigint or m.request_digest is distinct from p_input->>'expectedMappingDigest' or m.claim_revision is distinct from (p_input->>'expectedClaimRevision')::integer or m.payload_hash is distinct from p_input->>'expectedPayloadHash' or m.source_digest is distinct from p_input->>'expectedSourceDigest' then return jsonb_build_object('kind','stale');end if;
 basis:=trip_support_private.mapping_basis(m.id);if basis is null then return jsonb_build_object('kind','stale');end if;claim:=trip_support_private.typed_claim(basis,p_input->>'scope');if claim is null then return jsonb_build_object('kind','blocked');end if;
 if p.rollback_snapshot_version is not null then select snapshot.content into content from public.trip_version_snapshots snapshot where snapshot.trip_id=t.id and snapshot.version=p.rollback_snapshot_version;
 else content:=public.apply_trip_content_patch(public.trip_content_snapshot(t.id,t.title),p.patch);end if;
 item:=trip_support_private.item(content,p_input->>'dayId',p_input->>'itemId');if item is null or trip_support_private.hash(item) is distinct from p_input->>'expectedItemDigest' then return jsonb_build_object('kind','stale');end if;
 request_hash:=trip_support_private.hash(p_input);select * into s from trip_support_private.preparations where owner_id=u and operation_id=(p_input->>'operationId')::uuid for update nowait;
 if found then if s.request_digest<>request_hash or s.status<>'prepared' then return jsonb_build_object('kind','conflict');end if;
 else
 insert into trip_support_private.preparations(operation_id,owner_id,trip_id,proposal_id,place_reference_id,mapping_id,mapping_version,proposal_revision,base_version,proposal_digest,day_id,item_id,item_digest,scope,applicability,city,scene,locale,statement_id,claim_revision,payload_hash,source_digest,source_refs,typed_claim,request_digest,expires_at)
 values((p_input->>'operationId')::uuid,u,t.id,p.id,r.id,m.id,m.version,p.revision,p.base_trip_version,fingerprint,p_input->>'dayId',p_input->>'itemId',p_input->>'expectedItemDigest',p_input->>'scope',trip_support_private.applicability(item,p_input->>'scope',claim),p_input->>'city',p_input->>'scene',p_input->>'locale',m.statement_id,m.claim_revision,m.payload_hash,m.source_digest,m.source_refs,claim,request_hash,least(p.expires_at,(basis->'receipt'->>'expiresAt')::timestamptz)) returning * into s;
 end if;
 return jsonb_build_object('kind','prepared','receiptId',s.id,'version',s.version,'tripId',s.trip_id,'proposalId',s.proposal_id,'proposalRevision',s.proposal_revision,'baseVersion',s.base_version,'dayId',s.day_id,'itemId',s.item_id,'scope',s.scope,'applicability',s.applicability,'claim',claim,'sourceDigest',s.source_digest,'expiresAt',s.expires_at);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
create function public.revoke_trip_item_support_preparation_v1(p_receipt uuid,p_expected_version bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=trip_support_private.owner();s trip_support_private.preparations%rowtype;
begin
 select * into s from trip_support_private.preparations where id=p_receipt and owner_id=u for update nowait;if not found then return jsonb_build_object('kind','blocked');end if;
 if s.version is distinct from p_expected_version or s.status<>'prepared' then return jsonb_build_object('kind','conflict');end if;
 update trip_support_private.preparations set status='revoked',version=version+1 where id=s.id returning * into s;return jsonb_build_object('kind','revoked','receiptId',s.id,'version',s.version);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
create function trip_support_private.bind_confirmed_event() returns trigger language plpgsql security definer set search_path='' as $$
declare proof trip_support_private.confirm_proofs%rowtype;p public.trip_proposals%rowtype;s trip_support_private.preparations%rowtype;selected jsonb;content jsonb;item jsonb;current_basis jsonb;support uuid;state text;
begin
 select * into proof from trip_support_private.confirm_proofs where transaction_id=pg_current_xact_id() and proposal_id=NEW.proposal_id;if not found then return null;end if;
 select * into p from public.trip_proposals where id=NEW.proposal_id;if p.owner_id<>proof.owner_id or p.trip_id<>proof.trip_id or p.revision<>proof.proposal_revision or p.base_trip_version<>proof.base_version or NEW.resulting_version<>proof.base_version+1 then raise exception 'SUPPORT_CONFIRM_IDENTITY';end if;
 select snap.content into content from public.trip_version_snapshots snap where snap.trip_id=NEW.trip_id and snap.version=NEW.resulting_version and snap.owner_id=NEW.owner_id;if content is null then raise exception 'SUPPORT_SNAPSHOT_MISSING';end if;
 for selected in select value from jsonb_array_elements(proof.selection) loop
  select * into s from trip_support_private.preparations where id=(selected->>'receiptId')::uuid for update nowait;
  if not found or s.owner_id<>NEW.owner_id or s.proposal_id<>p.id or s.proposal_revision<>p.revision or s.base_version<>p.base_trip_version or s.version is distinct from (selected->>'version')::bigint or s.source_digest is distinct from selected->>'sourceDigest' or s.status<>'prepared' then raise exception 'SUPPORT_SELECTION_MISMATCH';end if;
  item:=trip_support_private.item(content,s.day_id,s.item_id);if item is null or trip_support_private.hash(item)<>s.item_digest then raise exception 'SUPPORT_ITEM_CHANGED';end if;
  current_basis:=trip_support_private.mapping_basis(s.mapping_id);state:=case when current_basis is not null and current_basis->>'mappingVersion'=s.mapping_version::text and current_basis->>'sourceDigest'=s.source_digest and s.expires_at>clock_timestamp() then 'reference_current' else 'recheck_required' end;
  insert into trip_support_private.item_supports(owner_id,trip_id,proposal_id,event_id,receipt_id,resulting_trip_version,day_id,item_id,item_digest,scope,applicability,status,claim_revision,payload_hash,source_digest,source_refs)
  values(NEW.owner_id,NEW.trip_id,p.id,NEW.id,s.id,NEW.resulting_version,s.day_id,s.item_id,s.item_digest,s.scope,s.applicability,state,s.claim_revision,s.payload_hash,s.source_digest,s.source_refs) returning id into support;
  insert into trip_support_private.support_receipts(support_id,version,action,source_digest) values(support,1,'bound',s.source_digest);
  update trip_support_private.preparations set status='consumed' where id=s.id;
 end loop;return null;
end $$;
create constraint trigger trip_support_confirmed_event after insert on public.trip_events deferrable initially deferred for each row execute function trip_support_private.bind_confirmed_event();
create function public.confirm_and_apply_supported_trip_proposal_v1(p_proposal_id uuid,p_idempotency_key text,p_digest text,p_support_selection jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=trip_support_private.owner();p public.trip_proposals%rowtype;t public.trips%rowtype;s trip_support_private.preparations%rowtype;chosen jsonb;result record;supports jsonb;
begin
 if jsonb_typeof(p_support_selection) is distinct from 'array' or jsonb_array_length(p_support_selection) not between 1 and 8 or (select count(distinct x->>'receiptId') from jsonb_array_elements(p_support_selection) x)<>jsonb_array_length(p_support_selection) then return jsonb_build_object('kind','blocked');end if;
 select * into p from public.trip_proposals where id=p_proposal_id and owner_id=u;if not found then return jsonb_build_object('kind','blocked');end if;
 select * into t from public.trips where id=p.trip_id and owner_id=u for update nowait;select * into p from public.trip_proposals where id=p_proposal_id and owner_id=u for update nowait;
 for chosen in select value from jsonb_array_elements(p_support_selection) order by value->>'receiptId' loop
  if not knowledge_review_private.closed_object(chosen,array['receiptId','version','sourceDigest']) then return jsonb_build_object('kind','blocked');end if;
  select * into s from trip_support_private.preparations where id=(chosen->>'receiptId')::uuid and owner_id=u for update nowait;
  if not found or s.proposal_id<>p.id or s.trip_id<>t.id or s.proposal_revision<>p.revision or s.base_version<>p.base_trip_version or s.proposal_digest is distinct from p_digest or s.version is distinct from (chosen->>'version')::bigint or s.source_digest is distinct from chosen->>'sourceDigest' or s.status not in('prepared','consumed') then return jsonb_build_object('kind','stale');end if;
 end loop;
 insert into trip_support_private.confirm_proofs(transaction_id,owner_id,trip_id,proposal_id,proposal_revision,base_version,proposal_digest,selection) values(pg_current_xact_id(),u,t.id,p.id,p.revision,p.base_trip_version,p_digest,p_support_selection);
 select * into result from public.confirm_and_apply_trip_proposal(p_proposal_id,p_idempotency_key,p_digest);
 set constraints trip_support_confirmed_event immediate;
 select coalesce(jsonb_agg(jsonb_build_object('supportId',id,'receiptId',receipt_id,'version',version,'status',status) order by id),'[]'::jsonb) into supports from trip_support_private.item_supports where proposal_id=p.id and owner_id=u;
 return jsonb_build_object('kind','confirmed','outcome',result.outcome,'tripId',t.id,'proposalId',p.id,'resultingVersion',result.resulting_version,'supports',supports);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
revoke all on function public.prepare_trip_item_support_v1(jsonb),public.revoke_trip_item_support_preparation_v1(uuid,bigint),trip_support_private.bind_confirmed_event(),public.confirm_and_apply_supported_trip_proposal_v1(uuid,text,text,jsonb) from public,anon,authenticated,service_role;

create function public.read_trip_item_support_v1(p_trip uuid,p_expected_trip_version integer,p_day text,p_item text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=trip_support_private.owner();t public.trips%rowtype;content jsonb;item jsonb;s trip_support_private.item_supports%rowtype;r trip_support_private.preparations%rowtype;basis jsonb;entries jsonb:='[]';status text;
begin
 if p_day is null or p_item is null or p_day !~ '^[A-Za-z0-9_-]{1,64}$' or p_item !~ '^[A-Za-z0-9_-]{1,64}$' then return jsonb_build_object('kind','blocked');end if;
 select * into t from public.trips where id=p_trip and owner_id=u for share nowait;if not found then return jsonb_build_object('kind','blocked');end if;
 if t.head_version is distinct from p_expected_trip_version then return jsonb_build_object('kind','stale');end if;
 select snap.content into content from public.trip_version_snapshots snap where snap.trip_id=t.id and snap.owner_id=u and snap.version=t.head_version;item:=trip_support_private.item(content,p_day,p_item);if item is null then return jsonb_build_object('kind','blocked');end if;
 for s in select * from trip_support_private.item_supports where trip_id=t.id and owner_id=u and day_id=p_day and item_id=p_item order by created_at desc,id limit 8 loop
  select * into r from trip_support_private.preparations where id=s.receipt_id;
  basis:=trip_support_private.mapping_basis(r.mapping_id);status:=s.status;
  if status='reference_current' and (basis is null or basis->>'mappingVersion' is distinct from r.mapping_version::text or basis->>'sourceDigest' is distinct from s.source_digest or trip_support_private.hash(item)<>s.item_digest or r.expires_at<=clock_timestamp()) then status:='recheck_required';end if;
  entries:=entries||jsonb_build_array(jsonb_build_object('supportId',s.id,'receiptId',r.id,'version',s.version,'scope',s.scope,'applicability',s.applicability,'status',status,'claimRevision',s.claim_revision,'payloadHash',s.payload_hash,'sourceDigest',s.source_digest,'claim',case when status='reference_current' then trip_support_private.typed_claim(basis,s.scope) else null end));
 end loop;return jsonb_build_object('kind','support','tripId',t.id,'tripVersion',t.head_version,'dayId',p_day,'itemId',p_item,'entries',entries);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
create function public.apply_trip_item_source_impact_v1(p_support uuid,p_expected_version bigint,p_source uuid,p_expected_source_digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=trip_support_private.owner();s trip_support_private.item_supports%rowtype;receipt uuid;
begin
 select * into s from trip_support_private.item_supports where id=p_support and owner_id=u for update nowait;
 if not found or s.version is distinct from p_expected_version or s.source_digest is distinct from p_expected_source_digest or not exists(select 1 from jsonb_array_elements(s.source_refs) x where x->>'sourceRevisionId'=p_source::text) then return jsonb_build_object('kind','blocked');end if;
 if not exists(select 1 from knowledge_review_private.source_revisions where id=p_source and withdrawn_at is not null) then return jsonb_build_object('kind','stale');end if;
 if s.status='recheck_required' then select id into receipt from trip_support_private.support_receipts where support_id=s.id and version=s.version;return jsonb_build_object('kind','rechecked','supportId',s.id,'version',s.version,'receiptId',receipt);end if;
 update trip_support_private.item_supports set status='recheck_required',version=version+1 where id=s.id returning * into s;
 insert into trip_support_private.support_receipts(support_id,version,action,source_digest) values(s.id,s.version,'recheck',s.source_digest) returning id into receipt;
 return jsonb_build_object('kind','rechecked','supportId',s.id,'version',s.version,'receiptId',receipt);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
create function public.renew_trip_item_support_v1(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=trip_support_private.owner();s trip_support_private.item_supports%rowtype;r trip_support_private.preparations%rowtype;t public.trips%rowtype;m trip_support_private.entity_mappings%rowtype;basis jsonb;content jsonb;item jsonb;receipt uuid;new_receipt uuid;
begin
 if not knowledge_review_private.closed_object(p_input,array['operationId','supportId','expectedVersion','tripVersion','dayId','itemId','mappingId','expectedMappingVersion','expectedMappingDigest','expectedClaimRevision','expectedPayloadHash','expectedSourceDigest']) then return jsonb_build_object('kind','blocked');end if;
 select trip_id into t.id from trip_support_private.item_supports where id=(p_input->>'supportId')::uuid and owner_id=u;
 select * into t from public.trips where id=t.id and owner_id=u for update nowait;if not found or t.head_version is distinct from (p_input->>'tripVersion')::integer then return jsonb_build_object('kind','stale');end if;
 select * into s from trip_support_private.item_supports where id=(p_input->>'supportId')::uuid and owner_id=u for update nowait;
 if not found or s.version is distinct from (p_input->>'expectedVersion')::bigint or s.day_id is distinct from p_input->>'dayId' or s.item_id is distinct from p_input->>'itemId' then return jsonb_build_object('kind','conflict');end if;
 select * into r from trip_support_private.preparations where id=s.receipt_id;
 select * into m from trip_support_private.entity_mappings where id=(p_input->>'mappingId')::uuid;
 if not found or m.version is distinct from (p_input->>'expectedMappingVersion')::bigint or m.request_digest is distinct from p_input->>'expectedMappingDigest' or m.claim_revision is distinct from (p_input->>'expectedClaimRevision')::integer or m.payload_hash is distinct from p_input->>'expectedPayloadHash' or m.source_digest is distinct from p_input->>'expectedSourceDigest' or m.canonical_poi_id is distinct from (select canonical_poi_id from public.trip_place_references where id=r.place_reference_id and owner_id=u and trip_id=t.id) then return jsonb_build_object('kind','stale');end if;
 basis:=trip_support_private.mapping_basis(m.id);if basis is null or trip_support_private.typed_claim(basis,s.scope) is null then return jsonb_build_object('kind','stale');end if;
 select snap.content into content from public.trip_version_snapshots snap where snap.trip_id=t.id and snap.version=t.head_version;item:=trip_support_private.item(content,s.day_id,s.item_id);if item is null or trip_support_private.hash(item)<>s.item_digest then return jsonb_build_object('kind','stale');end if;
 -- A reviewed current replacement receipt renews support only, never Trip content.
 update trip_support_private.item_supports set version=version+1,status='reference_current',claim_revision=m.claim_revision,payload_hash=m.payload_hash,source_digest=m.source_digest,source_refs=m.source_refs where id=s.id returning * into s;
 insert into trip_support_private.preparations(operation_id,owner_id,trip_id,proposal_id,place_reference_id,mapping_id,mapping_version,proposal_revision,base_version,proposal_digest,day_id,item_id,item_digest,scope,applicability,city,scene,locale,statement_id,claim_revision,payload_hash,source_digest,source_refs,typed_claim,request_digest,status,expires_at)
 values((p_input->>'operationId')::uuid,u,r.trip_id,r.proposal_id,r.place_reference_id,m.id,m.version,r.proposal_revision,r.base_version,r.proposal_digest,r.day_id,r.item_id,r.item_digest,r.scope,r.applicability,r.city,r.scene,r.locale,m.statement_id,m.claim_revision,m.payload_hash,m.source_digest,m.source_refs,trip_support_private.typed_claim(basis,s.scope),trip_support_private.hash(p_input),'consumed',(basis->'receipt'->>'expiresAt')::timestamptz) returning id into new_receipt;
 update trip_support_private.item_supports set receipt_id=new_receipt where id=s.id;
 insert into trip_support_private.support_receipts(support_id,version,action,source_digest) values(s.id,s.version,'renewed',s.source_digest) returning id into receipt;
 return jsonb_build_object('kind','renewed','supportId',s.id,'version',s.version,'receiptId',receipt);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
revoke all on function public.read_trip_item_support_v1(uuid,integer,text,text),public.apply_trip_item_source_impact_v1(uuid,bigint,uuid,text),public.renew_trip_item_support_v1(jsonb) from public,anon,authenticated,service_role;


create function trip_support_private.applicability(p_item jsonb,p_scope text,p_claim jsonb) returns text language plpgsql immutable set search_path='' as $$
declare value jsonb:=p_claim->'value';first_at timestamptz;last_at timestamptz;zone text;
begin
 -- Entity linkage is already independently reviewed and explicitly selected.
 if p_scope='address_reference' then return 'matched';end if;
 if p_scope<>'opening_window_reference' or p_item->'day'->>'date' is null or p_item->'day'->>'timeZone' is null or p_item->'item'->>'startsAt' is null or p_item->'item'->>'endsAt' is null then return 'unverified';end if;
 zone:=value->>'timeZone';if zone is distinct from p_item->'day'->>'timeZone' or zone<>'Asia/Shanghai' then return 'unverified';end if;
 first_at:=(p_item->'item'->>'startsAt')::timestamptz;last_at:=(p_item->'item'->>'endsAt')::timestamptz;
 if last_at<=first_at or first_at<(value->>'startsAt')::timestamptz or last_at>(value->>'endsAt')::timestamptz or (first_at at time zone zone)::date::text is distinct from p_item->'day'->>'date' then return 'unverified';end if;return 'matched';
exception when invalid_datetime_format or datetime_field_overflow then return 'unverified';end $$;
revoke all on function trip_support_private.applicability(jsonb,text,jsonb) from public,anon,authenticated,service_role;
