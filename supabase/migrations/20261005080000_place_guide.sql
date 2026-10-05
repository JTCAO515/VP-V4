-- #218: current published practical facts, independently reviewed per-use rights.
-- Default deny; no role, policy, supplier, Trip writer or content seed.
create schema guide_private;
revoke all on schema guide_private from public,anon,authenticated,service_role;

create function guide_private.utf16(v text) returns integer language sql immutable set search_path='' as $$
 select coalesce(sum(case when ascii(c)>65535 then 2 else 1 end),0)::integer from regexp_split_to_table(v,'') c
$$;
create function guide_private.hash(v jsonb) returns text language sql immutable set search_path='' as $$select encode(sha256(convert_to(v::text,'UTF8')),'hex')$$;
create function guide_private.instant(v timestamptz) returns text language sql immutable set search_path='' as $$select to_char(v at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')$$;
create function guide_private.strict_integer(v jsonb) returns boolean language sql immutable set search_path='' as $$select jsonb_typeof(v)='number' and v::numeric=trunc(v::numeric) and v::numeric between 0 and 9007199254740991$$;
create function guide_private.unavailable(reason text) returns jsonb language sql immutable set search_path='' as $$select jsonb_build_object('kind','unavailable','reason',reason,'fallback','explore')$$;
revoke all on all functions in schema guide_private from public,anon,authenticated,service_role;

create table guide_private.uses_v1(
 id uuid primary key default gen_random_uuid(),operation_id uuid unique not null,request_digest text not null,
 mapping_id uuid not null references trip_support_private.entity_mappings(id) on delete cascade,
 proof jsonb not null,author_id uuid not null,reviewer_id uuid,reviewer_member_revision bigint,
 revision bigint not null default 1 check(revision between 1 and 9007199254740990),
 state text not null default 'pending' check(state in('pending','approved','revoked')),
 display boolean not null default false,tts boolean not null default false,cache boolean not null default false,prompt boolean not null default false,
 use_basis text not null,locator text not null,expires_at timestamptz not null,reviewed_at timestamptz
);
create index guide_uses_mapping on guide_private.uses_v1(mapping_id);
create table guide_private.progress_v1(
 owner_id uuid not null references auth.users(id) on delete cascade,session_id uuid not null references auth.sessions(id) on delete cascade,
 trip_id uuid not null references public.trips(id) on delete cascade,reference_id uuid not null references public.trip_place_references(id) on delete cascade,
 canonical_poi_id uuid not null references public.canonical_pois(id) on delete cascade,
 locale text not null,interest text not null,digest text not null,rights_revision bigint not null,
 completed_ids jsonb not null,expires_at timestamptz not null,updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,reference_id,locale,interest)
);
create index guide_progress_trip on guide_private.progress_v1(trip_id);
create index guide_progress_session on guide_private.progress_v1(session_id);
create table guide_private.bindings_v1(
 turn_id uuid primary key references turn_private.text_content(turn_id) on delete cascade deferrable initially deferred,owner_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,trip_id uuid not null,
 reference_id uuid not null,trip_version integer not null,
 locale text not null,interest text not null,digest text not null,operation_id uuid not null,command_digest text not null,
 thread_id uuid not null,task_id uuid not null,parent_turn_id uuid,completed_ids jsonb not null,
 canonical_poi_id uuid not null,rights_revision bigint not null,expires_at timestamptz not null,position_expires_at timestamptz not null,
 invalidated boolean not null default false,unique(owner_id,operation_id)
);
create index guide_bindings_trip on guide_private.bindings_v1(trip_id);
create index guide_bindings_session on guide_private.bindings_v1(session_id);
do $$declare t text;begin foreach t in array array['uses_v1','progress_v1','bindings_v1'] loop execute format('alter table guide_private.%I enable row level security',t);end loop;end$$;
revoke all on all tables in schema guide_private from public,anon,authenticated,service_role;

-- Worker checks cannot call knowledge_read_v1 (that requires the owner's JWT).
-- Reproduce its eligibility and the mapping_basis identity/reviewer/source proof
-- from locked original relations, under the original worker's lease authority.
create function guide_private.mapping_v1(mid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare m trip_support_private.entity_mappings%rowtype;p public.canonical_pois%rowtype;st knowledge_review_private.statements%rowtype;
 pub knowledge_review_private.publications%rowtype;c knowledge_review_private.candidates%rowtype;refs jsonb;rev bigint;
begin
 select * into m from trip_support_private.entity_mappings where id=mid and status='approved' for share nowait;if not found then return null;end if;
 select * into p from public.canonical_pois where id=m.canonical_poi_id for share nowait;if not found or trip_support_private.hash(to_jsonb(p))<>m.canonical_hash then return null;end if;
 select revision into rev from knowledge_review_private.members where actor_id=m.reviewer_id and active for share nowait;if rev is distinct from m.reviewer_member_revision then return null;end if;
 perform 1 from knowledge_review_private.publication_settings where singleton and enabled for share nowait;if not found then return null;end if;
 select * into st from knowledge_review_private.statements where statement_id=m.statement_id for share nowait;if not found or st.revision<>m.claim_revision or trip_support_private.hash(st.payload)<>m.payload_hash then return null;end if;
 select * into pub from knowledge_review_private.publications where candidate_id=st.candidate_id for share nowait;if not found or pub.state<>'published' or pub.expires_at<=clock_timestamp() then return null;end if;
 select * into c from knowledge_review_private.candidates where id=st.candidate_id for share nowait;if not found or c.status<>'reviewed' then return null;end if;
 if not (st.payload->'scope'->'cities' ? (m.basis_metadata->>'city')) or st.payload->'scope'->>'scene' is distinct from m.basis_metadata->>'scene' or m.basis_metadata->>'locale' not in('zh','en') then return null;end if;
 if not ((st.payload->'assertion'->>'predicate'='located_at' and st.payload->'assertion'->>'objectId'='place_address') or(st.payload->'assertion'->>'predicate'='opens_during' and st.payload->'assertion'->>'objectId'='opening_hours')) then return null;end if;
 perform r.id from knowledge_review_private.source_revisions r join knowledge_review_private.statement_sources ss on ss.source_revision_id=r.id where ss.candidate_id=st.candidate_id order by r.id for share of r nowait;
 select coalesce(jsonb_agg(jsonb_build_object('sourceRevisionId',r.id,'revisionLabel',r.revision_label,'snippetHash',r.snippet_hash,'submittedBy',r.submitted_by) order by r.id),'[]') into refs from knowledge_review_private.statement_sources ss join knowledge_review_private.source_revisions r on r.id=ss.source_revision_id where ss.candidate_id=st.candidate_id and r.withdrawn_at is null;
 if jsonb_array_length(refs) not between 1 and 3 or jsonb_array_length(refs)<>(select count(*) from knowledge_review_private.statement_sources where candidate_id=st.candidate_id) or refs is distinct from m.source_refs or trip_support_private.hash(refs)<>m.source_digest then return null;end if;
 return jsonb_build_object('mappingId',m.id,'mappingVersion',m.version,'mappingDigest',m.request_digest,'canonicalPoiId',m.canonical_poi_id,'canonicalHash',m.canonical_hash,
 'mappingReviewer',m.reviewer_id,'mappingMemberRevision',m.reviewer_member_revision,'statementId',st.statement_id,'claimRevision',st.revision,'payloadHash',m.payload_hash,
 'factId',pub.fact_id,'factVersion',pub.version,'publicationHash',guide_private.hash(to_jsonb(pub)),'candidateHash',guide_private.hash(to_jsonb(c)),
 'sourceDigest',m.source_digest,'sourceRefs',refs,'sourceMetadataHash',(select guide_private.hash(jsonb_agg(to_jsonb(sr) order by sr.id)) from knowledge_review_private.source_revisions sr where sr.id in(select (x->>'sourceRevisionId')::uuid from jsonb_array_elements(refs)x)),'basisMetadata',m.basis_metadata,
 'payload',st.payload,'reviewedAt',c.reviewed_at,'expiresAt',pub.expires_at);
exception when lock_not_available then return null;end$$;
create function guide_private.proof_v1(b jsonb) returns jsonb language sql immutable set search_path='' as $$select b-array['payload','reviewedAt','expiresAt']$$;

create function public.submit_guide_use_v1(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=knowledge_review_private.current_actor();b jsonb;r guide_private.uses_v1%rowtype;h text;
begin
 if not knowledge_review_private.closed_object(p_input,array['operationId','mappingId','expectedProof','display','tts','cache','prompt','useBasis','locator','expiresAt'])
 or not place_actions_private.uuid_v1(p_input->'operationId') or not place_actions_private.uuid_v1(p_input->'mappingId')
 or exists(select 1 from unnest(array['display','tts','cache','prompt']) k where jsonb_typeof(p_input->k) is distinct from 'boolean')
 or not knowledge_review_private.bounded_text(p_input->'useBasis',600) or not knowledge_review_private.bounded_text(p_input->'locator',240) then raise exception 'INVALID_INPUT';end if;
 b:=guide_private.mapping_v1((p_input->>'mappingId')::uuid);if b is null or guide_private.proof_v1(b) is distinct from p_input->'expectedProof' then return jsonb_build_object('kind','stale');end if;
 if (p_input->>'expiresAt')::timestamptz<=clock_timestamp() or (p_input->>'expiresAt')::timestamptz>(b->>'expiresAt')::timestamptz then raise exception 'INVALID_INPUT';end if;
 h:=guide_private.hash(p_input);select * into r from guide_private.uses_v1 where operation_id=(p_input->>'operationId')::uuid for update nowait;
 if found then if r.author_id<>u or r.request_digest<>h then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;else
 insert into guide_private.uses_v1(operation_id,request_digest,mapping_id,proof,author_id,display,tts,cache,prompt,use_basis,locator,expires_at)
 values((p_input->>'operationId')::uuid,h,(p_input->>'mappingId')::uuid,p_input->'expectedProof',u,(p_input->>'display')::boolean,(p_input->>'tts')::boolean,(p_input->>'cache')::boolean,(p_input->>'prompt')::boolean,p_input->>'useBasis',p_input->>'locator',(p_input->>'expiresAt')::timestamptz) returning * into r;end if;
 return jsonb_build_object('kind','use_candidate','id',r.id,'revision',r.revision,'digest',r.request_digest,'state',r.state);
end$$;
create function public.review_guide_use_v1(p_id uuid,p_revision bigint,p_digest text,p_decision text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=knowledge_review_private.current_actor();r guide_private.uses_v1%rowtype;b jsonb;rev bigint;m trip_support_private.entity_mappings%rowtype;c knowledge_review_private.candidates%rowtype;
begin
 if p_decision not in('approve','revoke') then raise exception 'INVALID_INPUT';end if;
 select * into r from guide_private.uses_v1 where id=p_id for update nowait;if not found or r.revision is distinct from p_revision or r.request_digest is distinct from p_digest then return jsonb_build_object('kind','conflict');end if;
 select * into m from trip_support_private.entity_mappings where id=r.mapping_id;
 select c0.* into c from knowledge_review_private.candidates c0 join knowledge_review_private.statements st on st.candidate_id=c0.id where st.statement_id=m.statement_id;
 if u=r.author_id or u=m.author_id or u=c.author_id or exists(select 1 from jsonb_array_elements(m.source_refs)x where x->>'submittedBy'=u::text) then return jsonb_build_object('kind','blocked');end if;
 b:=guide_private.mapping_v1(r.mapping_id);
 if p_decision='approve' and (r.state<>'pending' or b is null or r.proof is distinct from guide_private.proof_v1(b) or r.expires_at<=clock_timestamp()) then return jsonb_build_object('kind','stale');end if;
 select revision into rev from knowledge_review_private.members where actor_id=u and active for share nowait;
 update guide_private.uses_v1 set state=case p_decision when 'approve' then 'approved' else 'revoked' end,revision=revision+1,reviewer_id=u,reviewer_member_revision=rev,reviewed_at=clock_timestamp() where id=r.id returning * into r;
 return jsonb_build_object('kind','use_reviewed','id',r.id,'revision',r.revision,'state',r.state);
end$$;
create function guide_private.use_current_v1(r guide_private.uses_v1,b jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare rev bigint;begin
 select revision into rev from knowledge_review_private.members where actor_id=r.reviewer_id and active for share nowait;
 return coalesce(r.state='approved' and r.display and r.expires_at>clock_timestamp() and b is not null and r.proof=guide_private.proof_v1(b) and rev=r.reviewer_member_revision,false);
exception when lock_not_available then return false;end$$;

create function guide_private.projection_v1(u uuid,t uuid,ref uuid,head integer,loc text,interest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare tr public.trips%rowtype;pr public.trip_place_references%rowtype;p public.canonical_pois%rowtype;
 m trip_support_private.entity_mappings%rowtype;r guide_private.uses_v1%rowtype;b jsonb;e jsonb;sources jsonb;
 rows jsonb:='[]';proofs jsonb:='[]';expiry timestamptz;rights_rev bigint:=1;tts boolean:=true;cache boolean:=true;prompt boolean:=true;
 cap text:='';h text;v jsonb;current_ids jsonb:='[]';n integer:=0;has_mapping boolean:=false;has_locale boolean:=false;found_use boolean;words integer;cjk integer;
begin
 select * into tr from public.trips where id=t and owner_id=u for share nowait;if not found then return guide_private.unavailable('not_covered');end if;
 if tr.head_version is distinct from head or exists(select 1 from privacy_private.trip_deletions where trip_id=t) or exists(select 1 from public.trip_archives where trip_id=t) then return guide_private.unavailable('source_changed');end if;
 select * into pr from public.trip_place_references where id=ref and trip_id=t and owner_id=u for share nowait;
 if not found or pr.reference_kind<>'canonical' or pr.freshness<>'current' then return guide_private.unavailable('not_covered');end if;
 select * into p from public.canonical_pois where id=pr.canonical_poi_id for share nowait;
 if not found or not knowledge_review_private.bounded_text(to_jsonb(p.primary_name_en),160) or not knowledge_review_private.bounded_text(to_jsonb(p.primary_name_zh),160) then return guide_private.unavailable('not_covered');end if;
 for m in select * from trip_support_private.entity_mappings where canonical_poi_id=p.id and status='approved' order by id limit 65 for share nowait loop
  n:=n+1;if n>64 then return guide_private.unavailable('capacity');end if;has_mapping:=true;
  if m.basis_metadata->>'locale'<>loc then continue;end if;has_locale:=true;
  b:=guide_private.mapping_v1(m.id);if b is null then continue;end if;
  if interest='address' and b->'payload'->'assertion'->>'predicate'<>'located_at' or interest='opening_hours' and b->'payload'->'assertion'->>'predicate'<>'opens_during' then continue;end if;
  found_use:=false;
  -- Multiple current rights decisions are ambiguous; never rank away a denial.
  for r in select * from guide_private.uses_v1 where mapping_id=m.id and state='approved' order by id limit 2 for share nowait loop
   if not guide_private.use_current_v1(r,b) then continue;end if;
   if found_use then return guide_private.unavailable('rights_unavailable');end if;found_use:=true;
   e:=b->'payload'->'expressions'->loc;
   if not knowledge_review_private.closed_object(e,array['text','conditions','exclusions']) or not knowledge_review_private.bounded_text(e->'text',1000)
   or jsonb_typeof(e->'conditions')<>'array' or jsonb_typeof(e->'exclusions')<>'array' or jsonb_array_length(e->'conditions')>12 or jsonb_array_length(e->'exclusions')>12
   or guide_private.utf16(e->>'text')>1000 or exists(select 1 from jsonb_array_elements((e->'conditions')||(e->'exclusions'))x where not knowledge_review_private.bounded_text(x,240) or guide_private.utf16(x#>>'{}')>240) then return guide_private.unavailable('unsupported_language');end if;
   select jsonb_agg(jsonb_build_object('sourceRevisionId',sr.id,'revisionLabel',sr.revision_label,'publisher',sr.declaration->>'publisher','uri',sr.declaration->>'uri','locator',sr.declaration->>'locator') order by sr.id) into sources from knowledge_review_private.source_revisions sr where sr.id in(select (x->>'sourceRevisionId')::uuid from jsonb_array_elements(b->'sourceRefs')x);
   v:=jsonb_build_object('id',m.statement_id,'kind','fact','subjectId',b->'payload'->'assertion'->>'subjectId','predicate',b->'payload'->'assertion'->>'predicate',
    'factId',b->'factId','factVersion',b->'factVersion','assertionId',m.statement_id,'assertionRevision',m.claim_revision,
    'text',e->'text','conditions',e->'conditions','exclusions',e->'exclusions','reviewedAt',guide_private.instant((b->>'reviewedAt')::timestamptz),
    'expiresAt',guide_private.instant(least(r.expires_at,(b->>'expiresAt')::timestamptz)),'sources',sources);
   -- One exact mapped assertion once, even if two mapping rows refer to it.
   if exists(select 1 from jsonb_array_elements(rows)x where x->>'id'=m.statement_id::text) then return guide_private.unavailable('capacity');end if;
   rows:=rows||jsonb_build_array(v);proofs:=proofs||jsonb_build_array(guide_private.proof_v1(b)||jsonb_build_object('useId',r.id,'rightsRevision',r.revision,'useHash',guide_private.hash(to_jsonb(r))));
   expiry:=least(expiry,r.expires_at,(b->>'expiresAt')::timestamptz);rights_rev:=greatest(rights_rev,r.revision);tts:=tts and r.tts;cache:=cache and r.cache;prompt:=prompt and r.prompt;
  end loop;
 end loop;
 if jsonb_array_length(rows)=0 then return guide_private.unavailable(case when not has_mapping then 'not_covered' when not has_locale then 'unsupported_language' else 'rights_unavailable' end);end if;
 if jsonb_array_length(rows)>4 then return guide_private.unavailable('capacity');end if;
 select string_agg(x->>'text'||coalesce((select E'\n'||string_agg(q#>>'{}',E'\n') from jsonb_array_elements((x->'conditions')||(x->'exclusions'))q),''),E'\n' order by ord) into cap from jsonb_array_elements(rows) with ordinality a(x,ord);
 select count(*) into cjk from regexp_split_to_table(cap,'')c where c ~ '[一-鿿ぁ-ゟァ-ヿ]';
 select count(*) into words from regexp_split_to_table(regexp_replace(cap,'[一-鿿ぁ-ゟァ-ヿ]',' ','g'),'[[:space:]]+')w where w<>'';
 if guide_private.utf16(cap)>2400 or cjk::numeric/4+words::numeric/2>120 or loc='zh' and char_length(cap)>480 then return guide_private.unavailable('capacity');end if;
 h:=guide_private.hash(jsonb_build_array(t,head,ref,p.id,loc,interest,rows,proofs));
 if cache then select completed_ids into current_ids from guide_private.progress_v1 where owner_id=u and reference_id=ref and locale=loc and progress_v1.interest=projection_v1.interest and session_id=(auth.jwt()->>'session_id')::uuid and digest=h and expires_at>clock_timestamp();end if;
 return jsonb_build_object('kind','ready','version',1,'tripId',t,'tripVersion',head,'placeReferenceId',ref,'canonicalPoiId',p.id,'place',jsonb_build_object('en',p.primary_name_en,'zh',p.primary_name_zh),
 'locale',loc,'interest',interest,'digest',h,'evaluatedAt',guide_private.instant(clock_timestamp()),'expiresAt',guide_private.instant(expiry),
 'rights',jsonb_build_object('revision',rights_rev,'display',true,'tts',tts,'cache',cache,'prompt',prompt),'segments',rows,'completedSegmentIds',coalesce(current_ids,'[]'),
 'replayAskUnits',0,'narration','published_facts','unsupportedNarratives',jsonb_build_array('history','legend'),'generationCost',null);
exception when lock_not_available then return guide_private.unavailable('source_changed');end$$;

create function guide_private.valid_command_v1(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text[]:=array['action','expectedTripVersion','placeReferenceId','locale','interest'];a text:=v->>'action';s jsonb:=v->'serviceTask';begin
 if guide_private.strict_integer(v->'expectedTripVersion') is distinct from true or not place_actions_private.uuid_v1(v->'placeReferenceId') or v->>'locale' not in('zh','en') or v->>'interest' not in('general','address','opening_hours') then return false;end if;
 if a in('read','export') then return knowledge_review_private.closed_object(v,k);end if;
 if a='forget' then return knowledge_review_private.closed_object(v,k||array['operationId']) and place_actions_private.uuid_v1(v->'operationId');end if;
 if a not in('replay','progress','follow_up') or jsonb_typeof(v->'expectedDigest') is distinct from 'string' or v->>'expectedDigest' !~ '^[a-f0-9]{64}$' then return false;end if;k:=k||array['expectedDigest'];
 if a='replay' then return knowledge_review_private.closed_object(v,k);end if;
 if not place_actions_private.uuid_v1(v->'operationId') then return false;end if;k:=k||array['operationId'];
 if a='progress' then return knowledge_review_private.closed_object(v,k||array['completedSegmentIds']) and jsonb_typeof(v->'completedSegmentIds')='array' and jsonb_array_length(v->'completedSegmentIds')<=4 and (select count(distinct x) from jsonb_array_elements(v->'completedSegmentIds')x)=jsonb_array_length(v->'completedSegmentIds') and not exists(select 1 from jsonb_array_elements(v->'completedSegmentIds')x where not place_actions_private.uuid_v1(x));end if;
 return knowledge_review_private.closed_object(v,k||array['question','threadId','turnId','policyId','serviceTask','completedSegmentIds']) and knowledge_review_private.bounded_text(v->'question',600) and guide_private.utf16(v->>'question')<=600
 and jsonb_typeof(v->'completedSegmentIds')='array' and jsonb_array_length(v->'completedSegmentIds')<=4 and (select count(distinct x) from jsonb_array_elements(v->'completedSegmentIds')x)=jsonb_array_length(v->'completedSegmentIds') and not exists(select 1 from jsonb_array_elements(v->'completedSegmentIds')x where not place_actions_private.uuid_v1(x))
 and place_actions_private.uuid_v1(v->'threadId') and place_actions_private.uuid_v1(v->'turnId') and place_actions_private.uuid_v1(v->'policyId')
 and knowledge_review_private.closed_object(s,array['id','scopeVersion','relationship','parentTurnId']) and place_actions_private.uuid_v1(s->'id') and s->'id'<>v->'turnId' and s->'scopeVersion'='1'::jsonb and s->>'relationship' in('new_goal','clarification','repair') and (s->'parentTurnId'='null'::jsonb or place_actions_private.uuid_v1(s->'parentTurnId')) and ((s->>'relationship'='new_goal')=(s->'parentTurnId'='null'::jsonb));
end$$;

create function public.guide_place_v1(p_trip uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=place_actions_private.actor_v1();ref uuid;t public.trips%rowtype;pr public.trip_place_references%rowtype;a text:=p_input->>'action';v jsonb;ids jsonb;records jsonb;bindings jsonb;b guide_private.bindings_v1%rowtype;submitted jsonb;city text;h text;
begin
 if p_trip is null or guide_private.valid_command_v1(p_input) is distinct from true then raise exception 'INVALID_INPUT';end if;ref:=(p_input->>'placeReferenceId')::uuid;
 select * into t from public.trips where id=p_trip and owner_id=u for share nowait;if not found then raise exception 'FORBIDDEN';end if;
 select * into pr from public.trip_place_references where id=ref and trip_id=p_trip and owner_id=u for share nowait;if not found then raise exception 'FORBIDDEN';end if;
 -- Cleanup is exact owner/object scoped even when the head/source/rights is stale.
 if a='forget' then
  delete from guide_private.progress_v1 where owner_id=u and reference_id=ref and locale=p_input->>'locale' and interest=p_input->>'interest';
  update guide_private.bindings_v1 set invalidated=true,completed_ids='[]' where owner_id=u and reference_id=ref and locale=p_input->>'locale' and interest=p_input->>'interest';
  return jsonb_build_object('kind','forgotten','operationId',p_input->'operationId');end if;
 if a<>'export' and (p_input->>'expectedTripVersion')::numeric>2147483647 then return guide_private.unavailable('source_changed');end if;
 v:=guide_private.projection_v1(u,p_trip,ref,case when a='export' then t.head_version else (p_input->>'expectedTripVersion')::numeric::integer end,p_input->>'locale',p_input->>'interest');
 delete from guide_private.progress_v1 where owner_id=u and reference_id=ref and locale=p_input->>'locale' and interest=p_input->>'interest' and (v->>'kind'<>'ready' or digest is distinct from v->>'digest' or expires_at<=clock_timestamp() or v->'rights'->>'cache'<>'true');
 if a='export' then
  update guide_private.bindings_v1 set invalidated=true,completed_ids='[]' where owner_id=u and reference_id=ref and expires_at<=clock_timestamp();
  update guide_private.bindings_v1 set completed_ids='[]' where owner_id=u and reference_id=ref and position_expires_at<=clock_timestamp();
  select coalesce(jsonb_agg(jsonb_build_object('turnId',x.turn_id,'serviceTaskId',x.task_id,'operationId',x.operation_id,'canonicalPoiId',x.canonical_poi_id,'locale',x.locale,'interest',x.interest,'digest',x.digest,'rightsRevision',x.rights_revision,'expiresAt',guide_private.instant(x.expires_at),'tripVersion',x.trip_version,'invalidated',x.invalidated) order by x.turn_id),'[]') into bindings from(select * from guide_private.bindings_v1 where owner_id=u and reference_id=ref and trip_id=p_trip and locale=p_input->>'locale' and interest=p_input->>'interest' order by turn_id limit 101)x;
  if jsonb_array_length(bindings)>100 then return guide_private.unavailable('capacity');end if;
  select coalesce(jsonb_agg(jsonb_build_object('digest',p.digest,'canonicalPoiId',p.canonical_poi_id,'locale',p.locale,'interest',p.interest,'rightsRevision',p.rights_revision,'completedSegmentIds',p.completed_ids,'expiresAt',guide_private.instant(p.expires_at),'updatedAt',guide_private.instant(p.updated_at))),'[]') into records from guide_private.progress_v1 p where p.owner_id=u and p.reference_id=ref and p.locale=p_input->>'locale' and p.interest=p_input->>'interest' and p.session_id=(auth.jwt()->>'session_id')::uuid;
  return jsonb_build_object('kind','export','version',1,'tripId',p_trip,'placeReferenceId',ref,'records',records,'scope','guide_selection_metadata','coverage','complete_for_selection','bindings',bindings);end if;
 if v->>'kind'<>'ready' then return v;end if;
 if a in('replay','progress','follow_up') and v->>'digest' is distinct from p_input->>'expectedDigest' then return guide_private.unavailable('source_changed');end if;
 if a='progress' then
  if v->'rights'->>'cache'<>'true' then return guide_private.unavailable('rights_unavailable');end if;
  ids:=p_input->'completedSegmentIds';if exists(select 1 from jsonb_array_elements(ids)x where not exists(select 1 from jsonb_array_elements(v->'segments')s where s->'id'=x)) then raise exception 'INVALID_INPUT';end if;
  insert into guide_private.progress_v1(owner_id,session_id,trip_id,reference_id,canonical_poi_id,locale,interest,digest,rights_revision,completed_ids,expires_at)
   values(u,(auth.jwt()->>'session_id')::uuid,p_trip,ref,pr.canonical_poi_id,p_input->>'locale',p_input->>'interest',v->>'digest',(v->'rights'->>'revision')::bigint,ids,(v->>'expiresAt')::timestamptz)
   on conflict(owner_id,reference_id,locale,interest) do update set session_id=excluded.session_id,digest=excluded.digest,rights_revision=excluded.rights_revision,completed_ids=excluded.completed_ids,expires_at=excluded.expires_at,updated_at=clock_timestamp();
  return jsonb_set(v,'{completedSegmentIds}',ids);end if;
 if a<>'follow_up' then return v;end if;
 if v->'rights'->>'prompt'<>'true' then return guide_private.unavailable('rights_unavailable');end if;
 if exists(select 1 from jsonb_array_elements(p_input->'completedSegmentIds')x where not exists(select 1 from jsonb_array_elements(v->'segments')seg where seg->'id'=x)) then raise exception 'INVALID_INPUT';end if;
 perform 1 from public.chat_threads where id=(p_input->>'threadId')::uuid for update nowait;
 if found then if not exists(select 1 from public.chat_threads where id=(p_input->>'threadId')::uuid and owner_id=u and trip_id is null and status='active') then raise exception 'FORBIDDEN';end if;
 elsif p_input->'serviceTask'->>'relationship'<>'new_goal' then raise exception 'SERVICE_TASK_CONFLICT';end if;
 h:=guide_private.hash(p_input);select * into b from guide_private.bindings_v1 where owner_id=u and operation_id=(p_input->>'operationId')::uuid for update nowait;
 if found then if b.command_digest<>h or b.turn_id<>(p_input->>'turnId')::uuid or b.invalidated or b.digest<>v->>'digest' then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;else
 if p_input->'serviceTask'->>'relationship'<>'new_goal' and not exists(select 1 from guide_private.bindings_v1 parent join turn_private.service_task_turns st on st.turn_id=parent.turn_id where parent.turn_id=(p_input->'serviceTask'->>'parentTurnId')::uuid and parent.owner_id=u and parent.trip_id=p_trip and parent.thread_id=(p_input->>'threadId')::uuid and parent.task_id=(p_input->'serviceTask'->>'id')::uuid and parent.reference_id=ref and parent.locale=p_input->>'locale' and parent.interest=p_input->>'interest' and parent.digest=v->>'digest' and parent.session_id=(auth.jwt()->>'session_id')::uuid and not parent.invalidated) then raise exception 'SERVICE_TASK_CONFLICT';end if;
 insert into guide_private.bindings_v1(turn_id,owner_id,session_id,trip_id,reference_id,trip_version,locale,interest,digest,operation_id,command_digest,thread_id,task_id,parent_turn_id,completed_ids,canonical_poi_id,rights_revision,expires_at,position_expires_at)
 values((p_input->>'turnId')::uuid,u,(auth.jwt()->>'session_id')::uuid,p_trip,ref,t.head_version,p_input->>'locale',p_input->>'interest',v->>'digest',(p_input->>'operationId')::uuid,h,(p_input->>'threadId')::uuid,(p_input->'serviceTask'->>'id')::uuid,(p_input->'serviceTask'->>'parentTurnId')::uuid,p_input->'completedSegmentIds',(v->>'canonicalPoiId')::uuid,(v->'rights'->>'revision')::bigint,(v->>'expiresAt')::timestamptz,least((v->>'expiresAt')::timestamptz,clock_timestamp()+interval '120 seconds'));end if;
 select m.basis_metadata->>'city' into city from trip_support_private.entity_mappings m where m.canonical_poi_id=pr.canonical_poi_id and m.statement_id=(v->'segments'->0->>'assertionId')::uuid and m.status='approved' and m.basis_metadata->>'locale'=p_input->>'locale' order by m.id limit 1;
 submitted:=public.submit_grounded_turn((p_input->>'threadId')::uuid,(p_input->>'turnId')::uuid,(p_input->>'operationId')::uuid,(p_input->>'policyId')::uuid,p_input->>'locale',p_input->>'question',(p_input->'serviceTask'->>'id')::uuid,1,p_input->'serviceTask'->>'relationship',(p_input->'serviceTask'->>'parentTurnId')::uuid,city);
 update guide_private.bindings_v1 bind set position_expires_at=least(bind.position_expires_at,(select expires_at from turn_private.work where turn_id=bind.turn_id)) where bind.turn_id=(p_input->>'turnId')::uuid;
 if submitted->>'kind'<>'accepted' or guide_private.bound_v1((p_input->>'turnId')::uuid,null) is null then raise exception 'DATA_POLICY_BLOCKED';end if;
 return jsonb_build_object('kind','submitted','version',1,'operationId',p_input->'operationId','tripId',p_trip,'turnId',p_input->'turnId','serviceTaskId',p_input->'serviceTask'->'id','scopeVersion',1,'relationship',p_input->'serviceTask'->'relationship','parentTurnId',p_input->'serviceTask'->'parentTurnId','guideDigest',v->>'digest','reused',submitted->'reused','generationCost',null);
end$$;

create function guide_private.bound_v1(tid uuid,token uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare b guide_private.bindings_v1%rowtype;v jsonb;begin
 select * into b from guide_private.bindings_v1 where turn_id=tid;if not found then return null;end if;
 if b.invalidated or b.expires_at<=clock_timestamp() then update guide_private.bindings_v1 set invalidated=true,completed_ids='[]' where turn_id=tid;return null;end if;
 if token is null and (auth.uid() is distinct from b.owner_id or auth.jwt()->>'session_id' is distinct from b.session_id::text) then return null;end if;
 if b.position_expires_at<=clock_timestamp() then update guide_private.bindings_v1 set completed_ids='[]' where turn_id=tid;if token is not null then return null;end if;end if;
 if token is not null and not turn_private.lock_text_work(tid,token) then update guide_private.bindings_v1 set completed_ids='[]' where turn_id=tid;return null;end if;
 perform 1 from auth.sessions where id=b.session_id and user_id=b.owner_id for share nowait;if not found then return null;end if;
 if not exists(select 1 from public.chat_threads where id=b.thread_id and owner_id=b.owner_id and trip_id is null and status='active')
 or not exists(select 1 from turn_private.service_task_turns st join turn_private.service_tasks task on task.id=st.task_id and task.owner_id=b.owner_id and task.thread_id=b.thread_id where st.turn_id=tid and st.owner_id=b.owner_id and st.task_id=b.task_id and st.parent_turn_id is not distinct from b.parent_turn_id) then return null;end if;
 v:=guide_private.projection_v1(b.owner_id,b.trip_id,b.reference_id,b.trip_version,b.locale,b.interest);
 if v->>'kind'<>'ready' or v->>'digest'<>b.digest or v->'rights'->>'prompt'<>'true' then update guide_private.bindings_v1 set invalidated=true,completed_ids='[]' where turn_id=tid;return null;end if;
 return v;
end$$;
create function guide_private.input_v1(tid uuid,token uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb:=guide_private.bound_v1(tid,token);b guide_private.bindings_v1%rowtype;s text;begin
 if v is null or payload->>'kind'<>'intent_input' then return jsonb_build_object('kind','blocked');end if;
 select * into b from guide_private.bindings_v1 where turn_id=tid;
 s:=payload->>'text'||E'\n[VP Guide context; current published facts, explicit user selection]\n'||jsonb_build_object('tripId',v->'tripId','place',v->'place','canonicalPoiId',v->'canonicalPoiId','interest',v->'interest','completedSegmentIds',b.completed_ids,'segments',v->'segments')::text;
 if guide_private.utf16(s)>4000 then return jsonb_build_object('kind','blocked');end if;
 payload:=jsonb_set(payload,'{text}',to_jsonb(s));
 return jsonb_set(payload,'{contextDigest}',to_jsonb(guide_private.hash(jsonb_build_array(payload-'contextDigest',b.digest,b.command_digest))));
end$$;
create function guide_private.answer_basis_v1(tid uuid,token uuid,intent text,subject text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb:=guide_private.bound_v1(tid,token);pubs jsonb;claims jsonb;obj text;ids jsonb;begin
 if v is null or exists(select 1 from jsonb_array_elements(v->'segments')s where s->>'subjectId' is distinct from subject) then return null;end if;
 if intent not in('place_address','place_opening_hours','place_address_and_hours') then return null;end if;
 select jsonb_agg(jsonb_build_object('factId',s->'factId','assertionId',s->'assertionId','revision',s->'assertionRevision','payloadHash',trip_support_private.hash(st.payload)) order by s->>'factId') into pubs from jsonb_array_elements(v->'segments')s join knowledge_review_private.statements st on st.statement_id=(s->>'assertionId')::uuid;
 claims:='[]';for obj in select value->>'objectId' from jsonb_array_elements(knowledge_review_private.question_definition(intent)->'claims') loop
 select coalesce(jsonb_agg(s->'factId' order by s->>'factId'),'[]') into ids from jsonb_array_elements(v->'segments')s where s->>'predicate'=case obj when 'place_address' then 'located_at' else 'opens_during' end;
 claims:=claims||jsonb_build_array(jsonb_build_object('id',obj,'status',case when jsonb_array_length(ids)>0 then 'covered' else 'unavailable' end,'reasons',case when jsonb_array_length(ids)>0 then '[]'::jsonb else '["missing"]'::jsonb end,'factIds',ids));end loop;
 return jsonb_build_object('publications',pubs,'claims',claims);
end$$;
create function guide_private.place_complete_v1(tid uuid,token uuid,intent text,scope text,needs_text text,place_name text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb:=guide_private.bound_v1(tid,token);needs jsonb;question text;result jsonb;subject text;begin
 if v is null then return jsonb_build_object('kind','blocked');end if;
 if place_name is null or place_name not in(v->'place'->>'en',v->'place'->>'zh') or intent not in('place_address','place_opening_hours','place_address_and_hours') then return jsonb_build_object('kind','blocked');end if;
 if needs_text is null or octet_length(needs_text)>12000 then raise exception 'INVALID_INPUT';end if;needs:=needs_text::jsonb;
 if jsonb_typeof(needs)<>'array' or jsonb_array_length(needs)>6 or (scope='additional_needs')<>(jsonb_array_length(needs)>0) then raise exception 'INVALID_INPUT';end if;
 select input_text into question from turn_private.text_content where turn_id=tid;
 if exists(select 1 from jsonb_array_elements(needs)x where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 240 or strpos(question,x#>>'{}')=0) or (select count(distinct x) from jsonb_array_elements(needs)x)<>jsonb_array_length(needs) then raise exception 'INVALID_INPUT';end if;
 subject:=v->'segments'->0->>'subjectId';
 result:=turn_private.complete_selected_grounded_work(tid,token,intent,scope,subject);
 if result->>'kind'='finished' then update turn_private.grounded_turns set place_name=place_complete_v1.place_name,place_resolution='matched',unanswered_needs=needs where turn_id=tid;end if;
 return result;
end$$;

-- Surgical append-only original worker seams; CREATE OR REPLACE preserves ACL.
-- Ordinary source remains byte-identical inside these added marked branches.
do $$declare sig text;body text;def text;guard text;anchor text;begin
 foreach sig in array array['public.read_grounded_work(uuid,uuid)','public.authorize_grounded_dispatch(uuid,uuid,uuid,text,text)',
 'public.complete_grounded_work_with_needs(uuid,uuid,text,text,text)','public.complete_grounded_place_work(uuid,uuid,text,text,text,text)',
 'turn_private.complete_selected_grounded_work(uuid,uuid,text,text,text)','public.read_grounded_turn(uuid)'] loop
 select prosrc,pg_get_functiondef(oid) into body,def from pg_proc where oid=to_regprocedure(sig);if body is null or strpos(body,E'\nbegin\n')=0 then raise exception 'GUIDE_ORIGINAL_ENTRY_MISSING %',sig;end if;
 guard:=E'\nbegin\n if exists(select 1 from guide_private.bindings_v1 where turn_id=p_turn_id) and guide_private.bound_v1(p_turn_id,'||case when sig='public.read_grounded_turn(uuid)' then 'null' else 'p_lease_token' end||E') is null then return jsonb_build_object(''kind'',''blocked'');end if;\n';
 if sig='public.complete_grounded_place_work(uuid,uuid,text,text,text,text)' then guard:=guard||E' if exists(select 1 from guide_private.bindings_v1 where turn_id=p_turn_id) then return guide_private.place_complete_v1(p_turn_id,p_lease_token,p_intent,p_request_scope,p_unanswered_needs,p_place_name);end if;\n';end if;
 if sig='turn_private.complete_selected_grounded_work(uuid,uuid,text,text,text)' then guard:=guard||E' if exists(select 1 from guide_private.bindings_v1 where turn_id=p_turn_id) and knowledge_review_private.question_definition(p_intent) is not null and guide_private.answer_basis_v1(p_turn_id,p_lease_token,p_intent,p_subject) is null then return jsonb_build_object(''kind'',''blocked'');end if;\n';end if;
 anchor:=body;body:=regexp_replace(body,E'\nbegin\n',guard);
 if sig in('turn_private.complete_selected_grounded_work(uuid,uuid,text,text,text)','public.authorize_grounded_dispatch(uuid,uuid,uuid,text,text)') then
 body:=replace(body,'if not turn_private.lock_text_work(p_turn_id,p_lease_token) then', 'if (exists(select 1 from guide_private.bindings_v1 where turn_id=p_turn_id) and guide_private.bound_v1(p_turn_id,p_lease_token) is null) or not turn_private.lock_text_work(p_turn_id,p_lease_token) then');
 end if;
 if sig='public.read_grounded_work(uuid,uuid)' then
 body:=replace(body,$old$return payload||jsonb_build_object('contextDigest',encode(pg_catalog.sha256(convert_to(jsonb_build_array(payload,g.city,g.scope_version)::text,'UTF8')),'hex'));$old$,
 $new$payload:=payload||jsonb_build_object('contextDigest',encode(pg_catalog.sha256(convert_to(jsonb_build_array(payload,g.city,g.scope_version)::text,'UTF8')),'hex')); if exists(select 1 from guide_private.bindings_v1 where turn_id=p_turn_id) then return guide_private.input_v1(p_turn_id,p_lease_token,payload);end if;return payload;$new$);
 elsif sig='turn_private.complete_selected_grounded_work(uuid,uuid,text,text,text)' then
 body:=replace(body,'knowledge_review_private.resolve_question(knowledge_review_private.selected_question_input(p_intent,g.city,g.locale,p_subject))','knowledge_review_private.resolve_question(knowledge_review_private.selected_question_input(p_intent,g.city,g.locale,p_subject),case when exists(select 1 from guide_private.bindings_v1 where turn_id=p_turn_id) then guide_private.answer_basis_v1(p_turn_id,p_lease_token,p_intent,p_subject) else null end)');
 end if;
 execute replace(def,anchor,body);
 end loop;
end$$;

-- Source and capability correction synchronously erases stale progress and
-- invalidates marked bindings. Keep tombstones so stale Guide never falls back
-- into the unguarded ordinary worker. Expiry is checked on every read/dispatch.
create function guide_private.invalidate_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare oldj jsonb:=case when tg_op='INSERT' then to_jsonb(new) else to_jsonb(old) end;po uuid[];refs uuid[];trips uuid[];sessions uuid[];u uuid;begin
 if tg_table_schema='public' and tg_table_name='trips' then trips:=array[(oldj->>'id')::uuid];
 elsif tg_table_schema='public' and tg_table_name='trip_place_references' then refs:=array[(oldj->>'id')::uuid];
 elsif tg_table_schema='auth' and tg_table_name='sessions' then sessions:=array[(oldj->>'id')::uuid];
 elsif tg_table_schema='identity_private' then u:=(oldj->>'owner_id')::uuid;
 elsif tg_table_name='canonical_pois' then po:=array[(oldj->>'id')::uuid];
 elsif tg_table_name='entity_mappings' then po:=array[(oldj->>'canonical_poi_id')::uuid];
 elsif tg_table_name='uses_v1' then select array_agg(canonical_poi_id) into po from trip_support_private.entity_mappings where id=(oldj->>'mapping_id')::uuid;
 elsif tg_table_name='members' then select array_agg(distinct m.canonical_poi_id) into po from trip_support_private.entity_mappings m left join guide_private.uses_v1 r on r.mapping_id=m.id where m.reviewer_id=(oldj->>'actor_id')::uuid or r.reviewer_id=(oldj->>'actor_id')::uuid;
 elsif tg_table_name='source_revisions' then select array_agg(distinct m.canonical_poi_id) into po from trip_support_private.entity_mappings m where exists(select 1 from jsonb_array_elements(m.source_refs)x where x->>'sourceRevisionId'=oldj->>'id');
 elsif tg_table_name in('publications','statements','candidates','statement_sources') then select array_agg(distinct m.canonical_poi_id) into po from trip_support_private.entity_mappings m join knowledge_review_private.statements st on st.statement_id=m.statement_id where st.candidate_id=coalesce(oldj->>'candidate_id',oldj->>'id')::uuid;
 elsif tg_table_name='publication_settings' then select array_agg(distinct canonical_poi_id) into po from trip_support_private.entity_mappings;
 end if;
 delete from guide_private.progress_v1 p where p.canonical_poi_id=any(po) or p.reference_id=any(refs) or p.trip_id=any(trips) or p.session_id=any(sessions) or p.owner_id=u;
 update guide_private.bindings_v1 b set invalidated=true,completed_ids='[]' where not b.invalidated and (b.reference_id=any(refs) or b.trip_id=any(trips) or b.session_id=any(sessions) or b.owner_id=u or b.canonical_poi_id=any(po));
 return null;
end$$;
do $$declare t text;begin
 foreach t in array array['guide_private.uses_v1','trip_support_private.entity_mappings','knowledge_review_private.publications','knowledge_review_private.statements','knowledge_review_private.candidates','knowledge_review_private.statement_sources','knowledge_review_private.source_revisions','knowledge_review_private.members','knowledge_review_private.publication_settings','public.canonical_pois','public.trip_place_references','public.trips','auth.sessions','identity_private.mobile_accounts'] loop execute format('create trigger guide_source_invalidated after insert or update or delete on %s for each row execute function guide_private.invalidate_v1()',t);end loop;
end$$;
create function guide_private.clear_position_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='turns' and to_jsonb(new)->>'status' in('completed','proposal_ready','unavailable','failed','cancelled') or tg_table_name='work' and to_jsonb(new)->>'state' in('done','failed','cancelled','quarantined') then
 update guide_private.bindings_v1 set completed_ids='[]' where turn_id=(to_jsonb(new)->>case when tg_table_name='turns' then 'id' else 'turn_id' end)::uuid;end if;return null;
end$$;
create trigger guide_terminal_position_clear after update of status on public.turns for each row execute function guide_private.clear_position_v1();
create trigger guide_work_position_clear after update of state on turn_private.work for each row execute function guide_private.clear_position_v1();
-- Owner export above is one explicitly scoped current Guide selection. It is
-- not enrolled in existing all-account packages and never upgrades their coverage.
revoke all on all functions in schema guide_private from public,anon,authenticated,service_role;
revoke all on function public.guide_place_v1(uuid,jsonb),public.submit_guide_use_v1(jsonb),public.review_guide_use_v1(uuid,bigint,text,text) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
