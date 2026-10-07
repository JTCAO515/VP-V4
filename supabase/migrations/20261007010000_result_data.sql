-- VPJ-58 one artifact, all revisions/events and proven exclusive completed copies.
-- Sole wire TSd0591196 (actual fifth schema correction) / base bdb92b2b. Append-only migration; default denied.
-- No target grants, caller-set transaction authority, raw request/source bodies,
-- session cascade of tombstones, generic export enrollment or provider worker.
create schema result_data_private;
revoke all on schema result_data_private from public,anon,authenticated,service_role;
alter default privileges in schema result_data_private revoke execute on functions from public;

-- Finite, inspectable own operation state; retained session UUID is inert.
-- decision is the finite closed D, never a receipt or another operation row.
create table result_data_private.operations_v1 (
 request_id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,
 mobile_epoch bigint not null check(mobile_epoch between 1 and 9007199254740991),
 scope text not null check(scope in('result-sensitive-data/1','result-delete-progress/1')),
 root_kind text,root_id uuid,object_ids uuid[] not null,
 source_digest text not null check(source_digest ~ '^[a-f0-9]{64}$'),
 preview_digest text not null check(preview_digest ~ '^[a-f0-9]{64}$'),
 source_authorities jsonb not null check(jsonb_typeof(source_authorities)='array' and jsonb_array_length(source_authorities)<=100),
 captured_at bigint not null check(captured_at>0),
 expires_at bigint not null check(expires_at=captured_at+30000),
 request_digest text check(request_digest ~ '^[a-f0-9]{64}$'),
 state text not null default 'previewed' check(state in('previewed','erased')),
 preview_erased boolean not null default false,
 graph jsonb,erase_counts jsonb,retain_counts jsonb,
 retained_references jsonb,conflicts jsonb,decision jsonb,
 check(((scope='result-sensitive-data/1' and root_kind='artifact' and root_id is not null and cardinality(object_ids)=0)
  or (scope='result-delete-progress/1' and root_kind is null and root_id is null and cardinality(object_ids) between 1 and 20 and not request_id=any(object_ids))) is true),
 check((state='previewed')=(request_digest is null)),
 check((state='previewed')=(decision is null)),
 check(state<>'erased' or preview_erased),
 check((preview_erased and graph is null and erase_counts is null and retain_counts is null and retained_references is null and conflicts is null)
  or (not preview_erased and graph is not null and erase_counts is not null and retain_counts is not null and retained_references is not null and conflicts is not null))
);
create index result_data_owner_v1 on result_data_private.operations_v1(owner_id,request_id);
create index result_data_tombstones_v1 on result_data_private.operations_v1 using gin(decision jsonb_path_ops)
 where scope='result-sensitive-data/1' and state='erased';
alter table result_data_private.operations_v1 enable row level security;
revoke all on result_data_private.operations_v1 from public,anon,authenticated,service_role;

-- Ephemeral authorization is private and bound to an actual PostgreSQL xid.
-- Executor must remove its proof before returning/committing; it is not a
-- second permanent fence inventory and stores no source/body/raw command.
create table result_data_private.transaction_proofs_v1 (
 transaction_id xid8 primary key,
 owner_id uuid not null,
 request_id uuid not null,
 source_digest text not null check(source_digest ~ '^[a-f0-9]{64}$'),
 graph jsonb not null,
 expires_at bigint not null
);
alter table result_data_private.transaction_proofs_v1 enable row level security;
revoke all on result_data_private.transaction_proofs_v1 from public,anon,authenticated,service_role;



create function result_data_private.digest_v1(v text) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(v,'UTF8')),'hex')
$$;

create function result_data_private.deadline_v1(c bigint,e bigint) returns bigint language plpgsql volatile set search_path='' as $$
declare n bigint:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
begin if n<c or n>=e then raise exception 'RESULT_EXPIRED';end if;return n;end$$;


create function result_data_private.ids_v1(v jsonb,max_n integer) returns boolean language plpgsql immutable set search_path='' as $$
declare x jsonb;previous_n text;
begin
 if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)>max_n then return false;end if;
 for x in select value from jsonb_array_elements(v) loop
  if notification_private.uuid(x) is not true or previous_n>=x#>>'{}' then return false;end if;
  previous_n:=x#>>'{}';
 end loop;return true;
end$$;


create function result_data_private.selection_v1(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
begin
 if notification_private.uuid(v->'requestId') is not true then return false;end if;
 if v->>'scope'='result-sensitive-data/1' then
  return coalesce(jsonb_typeof(v->'rootKind')='string' and v->>'rootKind'='artifact' and notification_private.uuid(v->'rootId') and v->'objectIds'='[]'::jsonb,false);
 elsif v->>'scope'='result-delete-progress/1' then
  return coalesce(v->'rootKind'='null'::jsonb and v->'rootId'='null'::jsonb and result_data_private.ids_v1(v->'objectIds',20)
   and jsonb_array_length(v->'objectIds')>0 and not(v->'objectIds' ? (v->>'requestId')),false);
 end if;return false;
end$$;


create function result_data_private.input_v1(v jsonb,a text,recovering boolean default false) returns boolean language plpgsql immutable set search_path='' as $$
declare keys_n text[]:=array['action','scope'];original_n jsonb;
begin
 if jsonb_typeof(v->'action') is distinct from 'string' or v->>'action' is distinct from a
  or jsonb_typeof(v->'scope') is distinct from 'string'
  or v->>'scope' not in('result-sensitive-data/1','result-delete-progress/1') then return false;end if;
 if a='list' then
  if notification_private.exact(v,keys_n||array['rootKind','cursor','limit']) is not true or v->'limit' is distinct from '20'::jsonb then return false;end if;
  if v->>'scope'='result-sensitive-data/1' then
   if (jsonb_typeof(v->'rootKind')='string' and v->>'rootKind'='artifact') is not true then return false;end if;
  elsif v->'rootKind' is distinct from 'null'::jsonb then return false;end if;
  if v->'cursor' is distinct from 'null'::jsonb then
   if notification_private.exact(v->'cursor',array['sourceDigest','afterId']) is not true
    or (jsonb_typeof(v->'cursor'->'sourceDigest')='string' and v->'cursor'->>'sourceDigest' ~ '^[a-f0-9]{64}$') is not true
    or notification_private.uuid(v->'cursor'->'afterId') is not true then return false;end if;
  end if;return true;
 end if;
 keys_n:=keys_n||array['requestId','rootKind','rootId','objectIds'];
 if result_data_private.selection_v1(v) is not true then return false;end if;
 if a='erase' then
  keys_n:=keys_n||array['sourceDigest','previewDigest','confirmed'];
  if v->'confirmed' is distinct from 'true'::jsonb
   or (jsonb_typeof(v->'sourceDigest')='string' and v->>'sourceDigest' ~ '^[a-f0-9]{64}$') is not true
   or (jsonb_typeof(v->'previewDigest')='string' and v->>'previewDigest' ~ '^[a-f0-9]{64}$') is not true then return false;end if;
 elsif a='recover' then
  if recovering then return false;end if;
  keys_n:=keys_n||array['mutationBytes'];
  if jsonb_typeof(v->'mutationBytes') is distinct from 'string' or octet_length(v->>'mutationBytes')>8192 then return false;end if;
  begin original_n:=(v->>'mutationBytes')::jsonb;exception when others then return false;end;
  if result_data_private.input_v1(original_n,'erase',true) is not true
   or v->'scope' is distinct from original_n->'scope' or v->'requestId' is distinct from original_n->'requestId'
   or v->'rootKind' is distinct from original_n->'rootKind' or v->'rootId' is distinct from original_n->'rootId'
   or v->'objectIds' is distinct from original_n->'objectIds' then return false;end if;
 elsif a<>'preview' then return false;end if;
 return notification_private.exact(v,keys_n);
end$$;


create function result_data_private.actor_v1(expected_epoch bigint) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare u uuid:=auth.uid();s uuid;e bigint;n timestamptz:=clock_timestamp();
begin
 if u is null or auth.role() is distinct from 'authenticated' or auth.jwt()->>'role' is distinct from 'authenticated'
  or auth.jwt()->>'is_anonymous' is distinct from 'false' or notification_private.uuid(auth.jwt()->'session_id') is not true then raise exception 'UNAUTHENTICATED';end if;
 s:=(auth.jwt()->>'session_id')::uuid;
 if not pg_try_advisory_xact_lock(hashtextextended(u::text,34)) then raise lock_not_available using message='RESULT_CONFLICT';end if;
 perform 1 from auth.users where id=u for key share nowait;if not found then raise exception 'UNAUTHENTICATED';end if;
 select epoch into e from identity_private.mobile_accounts where owner_id=u and session_id=s for update nowait;
 if not found or e is distinct from expected_epoch then raise exception 'SESSION_REPLACED';end if;
 perform 1 from auth.sessions where id=s and user_id=u for key share nowait;if not found then raise exception 'SESSION_REPLACED';end if;
 perform identity_private.guard_mobile_rpc_v2();
 if identity_private.mobile_access_v2() is not true or not exists(select 1 from identity_private.mobile_attempts where owner_id=u and session_id=s and epoch=e)
  then raise exception 'SESSION_REPLACED';end if;
 n:=clock_timestamp();
 if not exists(select 1 from auth.sessions where id=s and user_id=u and created_at between n-interval '5 minutes' and n)
  then raise exception 'REAUTHENTICATION_REQUIRED';end if;
 return jsonb_build_object('ownerId',u,'sessionId',s,'mobileEpoch',e);
end$$;


create function result_data_private.operation_row_v1(r result_data_private.operations_v1) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('requestId',r.request_id,'ownerId',r.owner_id,'sessionId',r.session_id,'mobileEpoch',r.mobile_epoch,
  'scope',r.scope,'rootKind',r.root_kind,'rootId',r.root_id,'objectIds',r.object_ids,
  'sourceDigest',r.source_digest,'previewDigest',r.preview_digest,'sourceAuthorities',r.source_authorities,'capturedAt',r.captured_at,'expiresAt',r.expires_at,
  'requestDigest',r.request_digest,'state',r.state,'previewErased',r.preview_erased,'graph',r.graph,
  'eraseCounts',r.erase_counts,'retainCounts',r.retain_counts,
  'retainedReferences',r.retained_references,'conflicts',r.conflicts,'decision',r.decision)
$$;

create function result_data_private.clear_proof_required_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from result_data_private.transaction_proofs_v1 where transaction_id=pg_current_xact_id())
  then raise exception 'RESULT_CONFLICT';end if;
 return null;
end$$;


create function result_data_private.immutable_operation_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare authority_n boolean;
begin
 if tg_op='DELETE' then
  -- Original owner account cascade is allowed; session deletion cannot get here.
  if exists(select 1 from auth.users where id=old.owner_id) then raise exception 'RESULT_CONFLICT';end if;
  return old;
 end if;
 if row(new.request_id,new.owner_id,new.session_id,new.mobile_epoch,new.scope,new.root_kind,new.root_id,new.object_ids,new.source_digest,new.preview_digest,new.source_authorities,new.captured_at,new.expires_at)
  is distinct from row(old.request_id,old.owner_id,old.session_id,old.mobile_epoch,old.scope,old.root_kind,old.root_id,old.object_ids,old.source_digest,old.preview_digest,old.source_authorities,old.captured_at,old.expires_at)
  then raise exception 'RESULT_CONFLICT';end if;
 if old.request_digest is not null and (new.request_digest is distinct from old.request_digest or new.decision is distinct from old.decision or new.state is distinct from old.state)
  then raise exception 'RESULT_CONFLICT';end if;
 if old.preview_erased and (not new.preview_erased or new.graph is not null or new.erase_counts is not null
  or new.retain_counts is not null or new.retained_references is not null or new.conflicts is not null) then raise exception 'RESULT_CONFLICT';end if;
 if not old.preview_erased and not new.preview_erased then
  if row(new.graph,new.erase_counts,new.retain_counts,new.retained_references,new.conflicts)
   is distinct from row(old.graph,old.erase_counts,old.retain_counts,old.retained_references,old.conflicts)
   then raise exception 'RESULT_CONFLICT';end if;
 end if;
 select exists(select 1 from result_data_private.transaction_proofs_v1 p
  join result_data_private.operations_v1 request_n on request_n.request_id=p.request_id and request_n.owner_id=p.owner_id
  where p.transaction_id=pg_current_xact_id() and p.owner_id=old.owner_id and p.source_digest=request_n.source_digest
  and p.expires_at>floor(extract(epoch from clock_timestamp())*1000)::bigint
  and (p.request_id=old.request_id or (request_n.scope='result-delete-progress/1' and old.request_id=any(request_n.object_ids)))) into authority_n;
 if authority_n is not true then raise exception 'RESULT_CONFLICT';end if;
 return new;
end$$;



create trigger result_operation_immutable_v1 before update or delete on result_data_private.operations_v1 for each row execute function result_data_private.immutable_operation_v1();
create constraint trigger result_proof_must_clear_v1 after insert on result_data_private.transaction_proofs_v1 deferrable initially deferred for each row execute function result_data_private.clear_proof_required_v1();

create function result_data_private.empty_graph_v1() returns jsonb language sql immutable set search_path='' as $$
 select jsonb_object_agg(k,'[]'::jsonb) from unnest(array['artifactIds','executionIds','journalIds','publicationKeys','revisions','eventIds']) k
$$;
create function result_data_private.empty_refs_v1() returns jsonb language sql immutable set search_path='' as $$
 select jsonb_object_agg(k,'[]'::jsonb) from unnest(array['conversationIds','goalIds','messageIds','taskIds','turnIds','threadIds','tripIds','memoryIds','sourceArtifactIds','proposalIds']) k
$$;
create function result_data_private.zero_counts_v1(effect_n text) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_object_agg(k,0) from unnest(case effect_n when 'erase' then array['artifacts','revisions','resultEvents','executionRuns','callWindows','collectorOrigins','collectorOutputs','resultClaims','completionProofs','completedReceipts','localJournals'] else array['conversations','goals','messages','tasks','turns','threads','trips','memories','sourceArtifacts','proposals','budgetAttempts','planningSources'] end) k
$$;
create function result_data_private.conflicts_v1(v text[]) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(k order by ordinality),'[]'::jsonb) from unnest(array['SCOPE_TOO_LARGE','ACTIVE_WORK','SHARED_OR_FOREIGN_SCOPE','CROSS_RESULT_REFERENCE','CONVERSATION_SOURCE_REFERENCE','PROPOSAL_REFERENCE','DECISION_REFERENCE','READINESS_REFERENCE','GUIDE_REFERENCE','SCOPED_EDIT_REFERENCE','NOTIFICATION_REFERENCE','BRIEF_REFERENCE','KNOWLEDGE_MIXED_COPY','CORE_EXPORT_COPY','OTHER_DELETE_PENDING','SOURCE_UNSUPPORTED']) with ordinality a(k,ordinality) where k=any(v)
$$;
create function result_data_private.reference_kind_v1(k text) returns text language sql immutable set search_path='' as $$
 select case when k in('artifact_id','artifactId','source_result_id','sourceResultId','artifactIds','artifact_ids','sourceResultIds','source_result_ids','resultIds','result_ids') then 'artifactIds'
 when k in('execution_id','executionId','executionIds','execution_ids','runId','run_id') then 'executionIds'
 when k in('publication_key','publicationKey','publicationKeys','publication_keys') then 'publicationKeys' end
$$;
-- Only typed reference positions are authority. Generic reminder resultId and
-- arbitrary title/UUID strings have no result meaning.
create function result_data_private.json_references_v1(v jsonb,path_n text[] default array[]::text[]) returns table(kind text,entity_id uuid)
language plpgsql immutable set search_path='' as $$
declare x record;k text;id_n jsonb;
begin
 if cardinality(path_n)>32 then raise exception 'RESULT_SOURCE_UNAVAILABLE';end if;
 if jsonb_typeof(v)='object' then
  if v->>'kind' in('artifact_reference','result_artifact','artifact','result','task_result') then
   id_n:=case when v->>'kind'='task_result' then coalesce(v->'sourceId',v->'source_id',v->'id') else v->'id' end;
   if id_n is not null and id_n<>'null'::jsonb then
    if not notification_private.uuid(id_n) then raise exception 'RESULT_SOURCE_UNAVAILABLE';end if;
    return query select 'artifactIds'::text,(id_n#>>'{}')::uuid;
   end if;
  end if;
  if v->>'source_kind'='task_result' and notification_private.uuid(v->'source_id') then return query select 'artifactIds'::text,(v->>'source_id')::uuid;end if;
  for x in select key,value from jsonb_each(v) order by key collate "C" loop
   k:=result_data_private.reference_kind_v1(x.key);
   if x.key='resultId' and ('comparisonRef'=any(path_n) or v->>'kind' in('result','result_artifact','artifact_reference')) then k:='artifactIds';end if;
   if k is not null and x.value<>'null'::jsonb then
    if jsonb_typeof(x.value)='array' then
     for id_n in select value from jsonb_array_elements(x.value) loop
      if not notification_private.uuid(id_n) then raise exception 'RESULT_SOURCE_UNAVAILABLE';end if;
      return query select k,(id_n#>>'{}')::uuid;
     end loop;
    else
     if not notification_private.uuid(x.value) then raise exception 'RESULT_SOURCE_UNAVAILABLE';end if;
     return query select k,(x.value#>>'{}')::uuid;
    end if;
   elsif jsonb_typeof(x.value) in('object','array') then return query select * from result_data_private.json_references_v1(x.value,path_n||x.key);end if;
  end loop;
 elsif jsonb_typeof(v)='array' then
  for x in select value,ordinality from jsonb_array_elements(v) with ordinality loop
   return query select * from result_data_private.json_references_v1(x.value,path_n||x.ordinality::text);
  end loop;
 end if;
end$$;
create function result_data_private.documents_v1(relation_n text,v jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare parsed_n jsonb;
begin
 if relation_n='service_brief_private.operations' and v->>'request_bytes' is not null then
  begin parsed_n:=convert_from(decode(substr(v->>'request_bytes',3),'hex'),'UTF8')::jsonb;
  exception when others then raise exception 'RESULT_SOURCE_UNAVAILABLE';end;
  return v||jsonb_build_object('originalRequest',parsed_n);
 end if;
 return v;
end$$;
-- Actual notification parent joins qualify all stored outbox/attempt/operation
-- copies, including terminal records. Generic receipt resultId means reminder.
create function result_data_private.notification_parents_v1(relation_n text,v jsonb) returns table(document_n jsonb)
language sql stable security definer set search_path='' as $$
 select to_jsonb(r) from notification_private.reminders r where
  relation_n='notification_private.outbox' and r.id::text=v->>'reminder_id'
  or relation_n='notification_private.attempts' and r.id in(select o.reminder_id from notification_private.outbox o where o.id::text=v->>'notification_id')
  or relation_n='notification_private.operations' and r.operation_id::text=v->>'operation_id' and r.owner_id::text=v->>'owner_id'
 union all select to_jsonb(w) from notification_private.watches w where
  relation_n='notification_private.outbox' and w.id::text=v->>'watch_id'
  or relation_n='notification_private.attempts' and w.id in(select o.watch_id from notification_private.outbox o where o.id::text=v->>'notification_id')
$$;
create function result_data_private.related_v1(relation_n text,v jsonb,g jsonb) returns boolean language plpgsql stable security definer set search_path='' as $$
declare r record;parent_n jsonb;
begin
 if relation_n like 'privacy_private.%' then return false;end if;
 for r in select * from result_data_private.json_references_v1(result_data_private.documents_v1(relation_n,v)) loop
  if g->r.kind ? r.entity_id::text then return true;end if;
 end loop;
 for parent_n in select * from result_data_private.notification_parents_v1(relation_n,v) loop
  for r in select * from result_data_private.json_references_v1(parent_n) loop
   if g->r.kind ? r.entity_id::text then return true;end if;
  end loop;
 end loop;
 return relation_n='turn_private.planning_v2_collector_origins' and g->'journalIds' ? (v->>'request_id')
  or relation_n='turn_private.result_artifacts' and g->'artifactIds' ? (v->>'id')
  or relation_n='turn_private.planning_v2_execution_runs' and g->'executionIds' ? (v->>'id')
  or relation_n='turn_private.planning_v2_model_local_journal' and g->'journalIds' ? (v->>'request_id');
end$$;
create function result_data_private.row_key_v1(v jsonb,keys_n text[]) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_object_agg(k,v->k) from unnest(keys_n) k
$$;
create function result_data_private.fenced_v1(kind_n text,id_n uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from result_data_private.operations_v1 where state='erased' and scope='result-sensitive-data/1' and decision->'graph'->kind_n ? id_n::text)
$$;
create function result_data_private.proof_v1(kind_n text,id_n uuid) returns boolean language sql volatile security definer set search_path='' as $$
 select exists(select 1 from result_data_private.transaction_proofs_v1 p join result_data_private.operations_v1 o on o.request_id=p.request_id and o.owner_id=p.owner_id
 where p.transaction_id=pg_current_xact_id() and p.graph=o.graph and p.source_digest=o.source_digest and p.expires_at=o.expires_at
 and p.expires_at>floor(extract(epoch from clock_timestamp())*1000)::bigint and p.graph->kind_n ? id_n::text)
$$;
alter table result_data_private.operations_v1 add constraint result_source_authorities_shape_v1 check(conversation_data_private.authorities_shape_v1(source_authorities));

-- Actual signed Auth includes these managed operational namespaces, absent
-- from the independent PG bootstrap. They are not application source tables.
-- This fixed list does NOT exempt an application relation in another namespace.
create function result_data_private.infrastructure_namespaces_v1() returns text[] language sql immutable set search_path='' as $$
 select array['storage','realtime','_realtime','vault','supabase_functions','supabase_migrations']::text[]
$$;
create function result_data_private.application_identity_v1(kind_n text,id_n uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select result_data_private.fenced_v1(kind_n,id_n) or case kind_n
  when 'artifactIds' then exists(select 1 from turn_private.result_artifacts where id=id_n)
  when 'executionIds' then exists(select 1 from turn_private.planning_v2_execution_runs where id=id_n)
  when 'journalIds' then exists(select 1 from turn_private.planning_v2_model_local_journal where request_id=id_n)
  when 'publicationKeys' then exists(select 1 from turn_private.result_revisions where idempotency_key=id_n)
  else false end
$$;
create function result_data_private.infrastructure_supported_v1() returns boolean
language plpgsql stable security definer set search_path='' as $$
declare spec record;column_n record;found_n boolean;
begin
 -- Every excluded origin, not just the six namespaces, must remain without
 -- an incoming application FK. Application outgoing FKs remain in the hash.
 if exists(select 1 from pg_constraint fk join pg_class destination on destination.oid=fk.confrelid
  join pg_namespace target_n on target_n.oid=destination.relnamespace
  join pg_class origin on origin.oid=fk.conrelid join pg_namespace origin_n on origin_n.oid=origin.relnamespace
  where fk.contype='f'
   and target_n.nspname not in('pg_catalog','information_schema','extensions','auth','result_data_private')
   and not target_n.nspname=any(result_data_private.infrastructure_namespaces_v1())
   and (origin_n.nspname in('pg_catalog','information_schema','extensions','auth','result_data_private')
    or origin_n.nspname=any(result_data_private.infrastructure_namespaces_v1()))) then return false;end if;
 -- A typed application identity column is not unrelated infrastructure, even
 -- if it has no FK, is empty, or is placed inside one of the fixed namespaces.
 if exists(select 1 from pg_attribute attribute_n join pg_class relation_n on relation_n.oid=attribute_n.attrelid
  join pg_namespace namespace_n on namespace_n.oid=relation_n.relnamespace
  where relation_n.relkind='r' and namespace_n.nspname=any(result_data_private.infrastructure_namespaces_v1())
   and attribute_n.attnum>0 and not attribute_n.attisdropped
   and result_data_private.reference_kind_v1(attribute_n.attname::text) is not null) then return false;end if;
 for spec in select c.oid,n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind='r' and n.nspname=any(result_data_private.infrastructure_namespaces_v1()) order by n.nspname,c.relname loop
  -- Managed regclass subscriptions and the actual webhook table OID must not
  -- silently introduce application consumers across this boundary.
  for column_n in select attname from pg_attribute where attrelid=spec.oid and attnum>0 and not attisdropped
   and (atttypid='regclass'::regtype or spec.nspname='supabase_functions' and spec.relname='hooks' and attname='hook_table_id' and atttypid='oid'::regtype) loop
   execute format('select exists(select 1 from %I.%I operational where operational.%I::oid in(select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in(''pg_catalog'',''information_schema'',''extensions'',''auth'',''result_data_private'') and not n.nspname=any($1)))',spec.nspname,spec.relname,column_n.attname)
    into found_n using result_data_private.infrastructure_namespaces_v1();
   if found_n then return false;end if;
  end loop;
  if exists(select 1 from pg_attribute where attrelid=spec.oid and attnum>0 and not attisdropped and atttypid in('json'::regtype,'jsonb'::regtype)) then
   -- Arbitrary title/UUID strings are not authority. Actual typed JSON links
   -- to application rows or permanent identities remain unsupported sources.
   execute format('select exists(select 1 from %I.%I operational where exists(select 1 from result_data_private.json_references_v1(to_jsonb(operational)) typed where result_data_private.application_identity_v1(typed.kind,typed.entity_id)))',spec.nspname,spec.relname) into found_n;
   if found_n then return false;end if;
  end if;
 end loop;
 return true;
exception when invalid_text_representation or invalid_parameter_value then return false;
end$$;
-- Original complete application columns/types/PKs/FKs/checks hash is unchanged.
-- Unknown application tables, private.*, and all actual reverse sources stay
-- fail-closed; only unrelated managed system catalog differences are isolated.
create function result_data_private.schema_supported_v1() returns boolean language sql stable security definer set search_path='' as $$
 select result_data_private.infrastructure_supported_v1() and result_data_private.digest_v1((select coalesce(jsonb_agg(jsonb_build_object('relation',n.nspname||'.'||c.relname,'columns',(select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),'constraints',(select jsonb_agg(pg_get_constraintdef(k.oid) order by k.conname) from pg_constraint k where k.conrelid=c.oid)) order by n.nspname,c.relname),'[]'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname not in('pg_catalog','information_schema','extensions','auth','result_data_private','storage','realtime','_realtime','vault','supabase_functions','supabase_migrations'))::text)='6c2371cd4338f681af77de8fe888a4ae3692bd0abcf1736c14eaf0935314020d'
$$;
create function result_data_private.relations_v1() returns table(relation_name text,pk text[]) language sql immutable set search_path='' as $$ values
 ('community_private.audit',array['id']::text[]),
 ('community_private.disclosures_j1',array['actor_id']::text[]),
 ('community_private.operations_j1',array['owner_id','operation_id']::text[]),
 ('community_private.receipts',array['actor_id','operation_id']::text[]),
 ('community_private.reviewers',array['actor_id']::text[]),
 ('community_private.settings',array['singleton']::text[]),
 ('community_private.submissions',array['id']::text[]),
 ('community_publication_private.audit',array['id']::text[]),
 ('community_publication_private.operations',array['owner_id','operation_id']::text[]),
 ('community_publication_private.publications',array['id']::text[]),
 ('community_publication_private.qualifications',array['actor_id']::text[]),
 ('community_publication_private.references',array['id']::text[]),
 ('community_publication_private.rights_reviews',array['id']::text[]),
 ('community_publication_private.settings',array['singleton']::text[]),
 ('community_safety_private.appeals',array['id']::text[]),
 ('community_safety_private.audit',array['id']::text[]),
 ('community_safety_private.blocks',array['id']::text[]),
 ('community_safety_private.controlled_readers',array['actor_id','submission_id']::text[]),
 ('community_safety_private.decisions',array['id']::text[]),
 ('community_safety_private.moderators',array['actor_id']::text[]),
 ('community_safety_private.operations',array['owner_id','operation_id']::text[]),
 ('community_safety_private.reports',array['id']::text[]),
 ('community_safety_private.settings',array['singleton']::text[]),
 ('community_safety_private.states',array['submission_id']::text[]),
 ('coverage_export_private.request_fences_v1',array['request_id']::text[]),
 ('coverage_export_private.requests_v1',array['request_id']::text[]),
 ('coverage_export_private.sections_v1',array['request_id','section']::text[]),
 ('export_private.core_artifacts_v1',array['request_id']::text[]),
 ('export_private.core_jobs_v1',array['request_id']::text[]),
 ('export_private.core_policies_v1',array['id']::text[]),
 ('export_private.core_tickets_v1',array['operation_id']::text[]),
 ('export_private.entitlement_page_progress_v1',array['request_id','generation']::text[]),
 ('export_private.entitlement_source_revisions_v1',array['owner_id']::text[]),
 ('export_private.memory_section_progress_v1',array['request_id','generation','section']::text[]),
 ('export_private.memory_source_revisions_v1',array['owner_id']::text[]),
 ('guide_private.bindings_v1',array['turn_id']::text[]),
 ('guide_private.progress_v1',array['owner_id','reference_id','locale','interest']::text[]),
 ('guide_private.uses_v1',array['id']::text[]),
 ('knowledge_review_private.audit',array['id']::text[]),
 ('knowledge_review_private.candidate_assertions',array['candidate_id']::text[]),
 ('knowledge_review_private.candidates',array['id']::text[]),
 ('knowledge_review_private.members',array['actor_id']::text[]),
 ('knowledge_review_private.ontology_relations',array['predicate']::text[]),
 ('knowledge_review_private.ontology_types',array['type_id']::text[]),
 ('knowledge_review_private.publication_audit',array['candidate_id','version']::text[]),
 ('knowledge_review_private.publication_settings',array['singleton']::text[]),
 ('knowledge_review_private.publications',array['candidate_id']::text[]),
 ('knowledge_review_private.receipts',array['actor_id','operation_id']::text[]),
 ('knowledge_review_private.settings',array['singleton']::text[]),
 ('knowledge_review_private.source_impact_items',array['id']::text[]),
 ('knowledge_review_private.source_impact_outbox',array['id']::text[]),
 ('knowledge_review_private.source_impact_pages',array['set_id','cursor_key']::text[]),
 ('knowledge_review_private.source_impact_projections',array['id']::text[]),
 ('knowledge_review_private.source_impact_review_requests',array['delivery_id']::text[]),
 ('knowledge_review_private.source_impact_sets',array['id']::text[]),
 ('knowledge_review_private.source_revisions',array['id']::text[]),
 ('knowledge_review_private.statement_sources',array['candidate_id','source_revision_id']::text[]),
 ('knowledge_review_private.statements',array['candidate_id']::text[]),
 ('knowledge_review_private.wiki_generation_jobs',array['id']::text[]),
 ('knowledge_review_private.wiki_page_revisions',array['id']::text[]),
 ('knowledge_review_private.wiki_pages',array['id']::text[]),
 ('knowledge_review_private.wiki_statement_candidates',array['candidate_id']::text[]),
 ('lodging_classification_private.mapping_audit',array['mapping_id','version']::text[]),
 ('lodging_classification_private.mappings',array['id']::text[]),
 ('lodging_classification_private.operations',array['actor_id','operation_id']::text[]),
 ('lodging_classification_private.statements',array['candidate_id']::text[]),
 ('material_exit_private.progress_v1',array['request_id']::text[]),
 ('material_exit_private.requests_v1',array['request_id']::text[]),
 ('material_exit_private.reservation_fences_v1',array['owner_id','kind','object_id']::text[]),
 ('memory_private.native_command_heads_v1',array['memory_id']::text[]),
 ('memory_private.native_command_receipts_v1',array['owner_id','operation_id']::text[]),
 ('memory_private.native_update_preimages_v1',array['operation_id']::text[]),
 ('notification_exit_private.fences',array['owner_id','kind','object_id']::text[]),
 ('notification_exit_private.pages',array['request_id','page_number']::text[]),
 ('notification_exit_private.requests',array['request_id']::text[]),
 ('notification_exit_private.settings',array['singleton']::text[]),
 ('notification_private.attempts',array['notification_id']::text[]),
 ('notification_private.devices',array['id']::text[]),
 ('notification_private.dismissals',array['owner_id','trip_id','source_kind','source_id','semantic_digest']::text[]),
 ('notification_private.operations',array['owner_id','operation_id']::text[]),
 ('notification_private.outbox',array['id']::text[]),
 ('notification_private.reminders',array['id']::text[]),
 ('notification_private.settings',array['singleton']::text[]),
 ('notification_private.watches',array['id']::text[]),
 ('offline_private.text_commands_v1',array['operation_id']::text[]),
 ('offline_private.text_sources_v1',array['id']::text[]),
 ('offline_private.text_version_bindings_v1',array['trip_id','version','field_key']::text[]),
 ('offline_private.trip_text_state_v1',array['trip_id']::text[]),
 ('pdf_intake_private.confirm_proofs_v1',array['proposal_id']::text[]),
 ('pdf_intake_private.export_progress_v1',array['request_id','generation']::text[]),
 ('pdf_intake_private.export_version_v1',array['version']::text[]),
 ('pdf_intake_private.operations_v1',array['owner_id','operation_id']::text[]),
 ('pdf_intake_private.source_revisions_v1',array['owner_id']::text[]),
 ('place_actions_private.operations',array['owner_id','operation_id']::text[]),
 ('place_actions_private.saved_places',array['owner_id','trip_id','canonical_poi_id']::text[]),
 ('place_quota_private.usage',array['actor_id','bucket','window_seconds']::text[]),
 ('privacy_private.linked_delete_fences_v1',array['entity_kind','entity_id']::text[]),
 ('privacy_private.linked_delete_jobs_v1',array['request_id']::text[]),
 ('privacy_private.linked_delete_plans_v1',array['id']::text[]),
 ('privacy_private.linked_delete_worker_settings_v1',array['singleton']::text[]),
 ('privacy_private.memory_delete_jobs_v1',array['request_id']::text[]),
 ('privacy_private.memory_delete_plans_v1',array['id']::text[]),
 ('privacy_private.memory_delete_worker_settings_v1',array['singleton']::text[]),
 ('privacy_private.trip_deletions',array['request_id']::text[]),
 ('private.audit_events',array['id']::text[]),
 ('public.canonical_pois',array['id']::text[]),
 ('public.chat_threads',array['id']::text[]),
 ('public.chat_turn_events',array['id']::text[]),
 ('public.chat_turn_idempotency',array['owner_id','thread_id','idempotency_key']::text[]),
 ('public.connection_probe_resources',array['id']::text[]),
 ('public.fact_records',array['id']::text[]),
 ('public.memory_consents',array['id']::text[]),
 ('public.memory_consumer_receipts',array['id']::text[]),
 ('public.memory_profiles',array['id']::text[]),
 ('public.memory_receipts',array['id']::text[]),
 ('public.model_budget_attempts',array['scope_id','attempt_id']::text[]),
 ('public.model_budget_provider_limits',array['scope_id','provider']::text[]),
 ('public.model_budget_scopes',array['id']::text[]),
 ('public.privacy_receipts',array['id']::text[]),
 ('public.privacy_requests',array['id']::text[]),
 ('public.provider_poi_mappings',array['id']::text[]),
 ('public.review_probe_changes',array['id']::text[]),
 ('public.storekit_grants',array['environment','transaction_id']::text[]),
 ('public.travel_reminders',array['id']::text[]),
 ('public.trip_action_references',array['id']::text[]),
 ('public.trip_archives',array['trip_id']::text[]),
 ('public.trip_audit_events',array['id']::text[]),
 ('public.trip_days',array['trip_id','day_id']::text[]),
 ('public.trip_events',array['id']::text[]),
 ('public.trip_idempotency',array['owner_id','idempotency_key']::text[]),
 ('public.trip_items',array['trip_id','item_id']::text[]),
 ('public.trip_place_references',array['id']::text[]),
 ('public.trip_proposals',array['id']::text[]),
 ('public.trip_version_snapshots',array['trip_id','version']::text[]),
 ('public.trips',array['id']::text[]),
 ('public.turn_feedback',array['id']::text[]),
 ('public.turns',array['id']::text[]),
 ('public.user_profiles',array['owner_id']::text[]),
 ('public.v4_migration_baseline',array['id']::text[]),
 ('readiness_private.operations_v1',array['operation_id']::text[]),
 ('readiness_private.scopes_v1',array['task_id']::text[]),
 ('recovery_private.contexts_v1',array['id']::text[]),
 ('recovery_private.lineage_v1',array['proposal_id']::text[]),
 ('recovery_private.operations_v1',array['owner_id','operation_id']::text[]),
 ('recovery_private.transport_proofs_v1',array['transaction_id','proposal_id']::text[]),
 ('research_intake_private.applications',array['id']::text[]),
 ('research_intake_private.events',array['id']::text[]),
 ('research_intake_private.receipts',array['token_hash']::text[]),
 ('research_intake_private.settings',array['singleton']::text[]),
 ('reservation_private.current_v1',array['owner_id','reference_id']::text[]),
 ('reservation_private.events_v1',array['owner_id','reference_id','revision']::text[]),
 ('reservation_private.operations_v1',array['owner_id','operation_id']::text[]),
 ('scoped_edit_private.contexts_v1',array['id']::text[]),
 ('scoped_edit_private.lineage_v1',array['proposal_id']::text[]),
 ('scoped_edit_private.lock_epochs_v1',array['trip_id']::text[]),
 ('scoped_edit_private.locks_v1',array['trip_id','item_id']::text[]),
 ('scoped_edit_private.operations_v1',array['owner_id','operation_id']::text[]),
 ('scoped_edit_private.proofs_v1',array['transaction_id','proposal_id']::text[]),
 ('scoped_edit_private.requests_v1',array['turn_id']::text[]),
 ('scoped_edit_private.work_v1',array['turn_id']::text[]),
 ('scoped_edit_private.worker_settings_v1',array['policy_id']::text[]),
 ('service_brief_private.audit',array['event_id']::text[]),
 ('service_brief_private.briefs',array['case_id']::text[]),
 ('service_brief_private.export_leases',array['owner_id','session_id','request_id']::text[]),
 ('service_brief_private.operations',array['actor_id','session_id','surface','operation_id']::text[]),
 ('service_brief_private.previews',array['id']::text[]),
 ('service_brief_private.settings',array['singleton']::text[]),
 ('service_cases_private.audit',array['case_id','revision']::text[]),
 ('service_cases_private.cases',array['id']::text[]),
 ('service_cases_private.staff',array['actor_id']::text[]),
 ('service_operations_private.audit',array['case_id','revision']::text[]),
 ('service_operations_private.data_operations',array['actor_id','session_id','operation_id']::text[]),
 ('service_operations_private.export_progress',array['request_id','generation']::text[]),
 ('service_operations_private.minutes',array['case_id','operation_id']::text[]),
 ('service_operations_private.operations',array['actor_id','session_id','surface','operation_id']::text[]),
 ('service_operations_private.operators',array['actor_id']::text[]),
 ('service_operations_private.services',array['case_id']::text[]),
 ('service_operations_private.settings',array['singleton']::text[]),
 ('service_operations_private.shifts',array['id']::text[]),
 ('service_operations_private.slots',array['shift_id','slot']::text[]),
 ('traffic_private.dispatches_v1',array['id']::text[]),
 ('traffic_private.policies_v1',array['id']::text[]),
 ('traffic_private.producers_v1',array['role_oid']::text[]),
 ('traffic_private.receipts_v1',array['id']::text[]),
 ('traffic_private.scopes_v1',array['id']::text[]),
 ('trip_lifecycle_private.export_progress_v2',array['request_id','generation','section']::text[]),
 ('trip_lifecycle_private.memory_edges_v1',array['owner_id','operation_id','memory_id']::text[]),
 ('trip_lifecycle_private.operations_v1',array['owner_id','operation_id']::text[]),
 ('trip_lifecycle_private.owner_heads_v1',array['owner_id']::text[]),
 ('trip_lifecycle_private.states_v1',array['trip_id']::text[]),
 ('trip_support_private.confirm_proofs',array['transaction_id','proposal_id']::text[]),
 ('trip_support_private.confirmation_receipts',array['owner_id','idempotency_key']::text[]),
 ('trip_support_private.entity_mappings',array['id']::text[]),
 ('trip_support_private.impact_claims',array['delivery_id','attempt']::text[]),
 ('trip_support_private.item_supports',array['id']::text[]),
 ('trip_support_private.preparations',array['id']::text[]),
 ('trip_support_private.support_receipts',array['id']::text[]),
 ('turn_private.assistant_conversations',array['id']::text[]),
 ('turn_private.assistant_goal_trip_links',array['goal_id']::text[]),
 ('turn_private.assistant_goal_trip_receipts',array['operation_id']::text[]),
 ('turn_private.assistant_goals',array['id']::text[]),
 ('turn_private.assistant_message_source_receipts',array['message_id']::text[]),
 ('turn_private.assistant_messages',array['id']::text[]),
 ('turn_private.assistant_travel_intakes',array['message_id']::text[]),
 ('turn_private.grounded_ai_assist_jobs',array['id']::text[]),
 ('turn_private.grounded_turns',array['turn_id']::text[]),
 ('turn_private.hosted_worker_control',array['singleton']::text[]),
 ('turn_private.hosted_worker_heartbeats',array['worker_id']::text[]),
 ('turn_private.planning_action_receipts',array['turn_id','action_key']::text[]),
 ('turn_private.planning_comparisons',array['turn_id']::text[]),
 ('turn_private.planning_consents',array['owner_id','policy_id']::text[]),
 ('turn_private.planning_intake_bindings',array['turn_id']::text[]),
 ('turn_private.planning_model_dispatches',array['lease_token']::text[]),
 ('turn_private.planning_observations',array['turn_id','action_key']::text[]),
 ('turn_private.planning_policies',array['id']::text[]),
 ('turn_private.planning_v2_collector_origins',array['execution_id']::text[]),
 ('turn_private.planning_v2_collector_outputs',array['execution_id']::text[]),
 ('turn_private.planning_v2_collector_principals',array['id']::text[]),
 ('turn_private.planning_v2_completed_receipts',array['execution_id']::text[]),
 ('turn_private.planning_v2_completion_proofs',array['execution_id']::text[]),
 ('turn_private.planning_v2_execution_profiles',array['id']::text[]),
 ('turn_private.planning_v2_execution_runs',array['id']::text[]),
 ('turn_private.planning_v2_external_call_windows',array['execution_id']::text[]),
 ('turn_private.planning_v2_model_attempt_bindings',array['turn_id']::text[]),
 ('turn_private.planning_v2_model_local_journal',array['request_id']::text[]),
 ('turn_private.planning_v2_place_checkpoints',array['turn_id']::text[]),
 ('turn_private.planning_v2_registered_tariffs',array['id']::text[]),
 ('turn_private.planning_v2_result_claims',array['execution_id']::text[]),
 ('turn_private.result_artifacts',array['id']::text[]),
 ('turn_private.result_events',array['id']::text[]),
 ('turn_private.result_revisions',array['artifact_id','revision']::text[]),
 ('turn_private.service_task_capacity',array['task_id']::text[]),
 ('turn_private.service_task_capacity_settings',array['singleton']::text[]),
 ('turn_private.service_task_turns',array['turn_id']::text[]),
 ('turn_private.service_tasks',array['id']::text[]),
 ('turn_private.text_consents',array['owner_id','policy_id']::text[]),
 ('turn_private.text_content',array['turn_id']::text[]),
 ('turn_private.text_dispatches',array['lease_token']::text[]),
 ('turn_private.text_policies',array['id']::text[]),
 ('turn_private.work',array['turn_id']::text[])
$$;

-- Completed historical copy qualification. No current-lease/provider activation
-- requirement is invented for a finished run, and no turn-only ownership inference.
create function result_data_private.completed_copy_v1(u uuid,artifact_n uuid,execution_n uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare r turn_private.planning_v2_execution_runs%rowtype;p turn_private.planning_v2_completion_proofs%rowtype;
 c turn_private.planning_v2_completed_receipts%rowtype;o turn_private.planning_v2_collector_origins%rowtype;
 v turn_private.planning_v2_collector_outputs%rowtype;k turn_private.planning_v2_result_claims%rowtype;
 b turn_private.planning_v2_model_attempt_bindings%rowtype;j turn_private.planning_comparisons%rowtype;
 a turn_private.result_artifacts%rowtype;t turn_private.service_tasks%rowtype;tuple_n jsonb;
begin
 select * into a from turn_private.result_artifacts where id=artifact_n and owner_id=u;
 select * into r from turn_private.planning_v2_execution_runs where id=execution_n and owner_id=u;
 if a.id is null or r.id is null or r.task_id<>a.task_id then return false;end if;
 select * into t from turn_private.service_tasks where id=r.task_id and owner_id=u;
 select * into j from turn_private.planning_comparisons where turn_id=r.turn_id and owner_id=u;
 select * into p from turn_private.planning_v2_completion_proofs where execution_id=r.id;
 select * into c from turn_private.planning_v2_completed_receipts where execution_id=r.id;
 select * into o from turn_private.planning_v2_collector_origins where execution_id=r.id;
 select * into v from turn_private.planning_v2_collector_outputs where execution_id=r.id;
 select * into k from turn_private.planning_v2_result_claims where execution_id=r.id;
 select * into b from turn_private.planning_v2_model_attempt_bindings where turn_id=r.turn_id;
 if t.id is null or j.turn_id is null or p.execution_id is null or c.execution_id is null or o.execution_id is null or v.execution_id is null or k.execution_id is null or b.turn_id is null then return false;end if;
 tuple_n:=jsonb_build_object('owner',u,'task',r.task_id,'turn',r.turn_id,'lease',r.original_lease,'textPolicy',b.text_policy_id,'planningPolicy',b.planning_policy_id,
  'scope',b.scope_id,'attempt',b.attempt_id,'provider',b.provider,'model',b.model,'priceVersion',b.price_version,'intakeDigest',r.intake_digest,'planningDigest',r.planning_digest);
 if turn_private.planning_v2_binding_bytes_v1(tuple_n) is null or o.binding is distinct from tuple_n
  or j.artifact_id<>artifact_n or j.task_id<>r.task_id or j.goal_id<>a.goal_id or j.message_id<>a.input_message_id or j.state<>'completed'
  or p.owner_id<>u or p.task_id<>r.task_id or p.turn_id<>r.turn_id or p.artifact_id<>artifact_n or p.original_lease<>r.original_lease
  or p.intake_digest<>r.intake_digest or p.planning_digest<>r.planning_digest or p.scope_id<>b.scope_id or p.attempt_id<>b.attempt_id
  or c.owner_id<>u or c.task_id<>r.task_id or c.turn_id<>r.turn_id or c.artifact_id<>artifact_n or c.revision<>1
  or b.owner_id<>u or b.task_id<>r.task_id or b.claim_lease<>r.original_lease or b.unknown_at is not null
  or b.intake_digest<>r.intake_digest or b.planning_digest<>r.planning_digest or b.text_policy_id<>t.policy_id or b.planning_policy_id<>j.planning_policy_id
  or t.budget_scope_id is distinct from b.scope_id or r.profile_snapshot->>'text_policy_id' is distinct from b.text_policy_id::text
  or r.profile_snapshot->>'planning_policy_id' is distinct from b.planning_policy_id::text or r.profile_snapshot->>'scope_id' is distinct from b.scope_id::text
  or r.execution->>'executionId' is distinct from r.id::text or r.execution->>'scopeId' is distinct from b.scope_id::text
  or r.execution->>'provider' is distinct from b.provider or r.execution->>'model' is distinct from b.model or r.execution->>'priceVersion' is distinct from b.price_version
  or o.scope_id<>b.scope_id or o.attempt_id<>b.attempt_id or o.origin_kind<>r.origin_kind or o.unknown_at is not null
  or o.attempted_at is null or o.response_buffered_at is null
  or v.output_digest<>p.output_digest or v.usage_digest<>p.usage_digest or v.output_wire->'binding' is distinct from tuple_n
  or v.output_wire->>'outputDigest' is distinct from v.output_digest or v.output_wire->>'usageDigest' is distinct from v.usage_digest
  or v.usage_wire is distinct from v.output_wire->'usageReceipt'
  or turn_private.validate_planning_v2_output_v1(v.output_wire,tuple_n) is distinct from true
  or k.state<>'completed' or k.action_key<>p.action_key or k.content_digest<>p.content_digest or k.lease_token<>p.current_lease
  or turn_private.planning_v2_content_digest(p.content) is distinct from p.content_digest
  or not exists(select 1 from turn_private.result_revisions x where x.artifact_id=artifact_n and x.revision=1 and x.owner_id=u and x.task_turn_id=r.turn_id and x.content=p.content and x.idempotency_key=j.publication_key)
  or not exists(select 1 from turn_private.planning_v2_external_call_windows where execution_id=r.id)
  or not exists(select 1 from public.turns where id=r.turn_id and owner_id=u and status='completed')
  or not exists(select 1 from turn_private.work where turn_id=r.turn_id and owner_id=u and state='completed' and lease_token is null and expires_at is null)
  or not exists(select 1 from public.model_budget_attempts ba join public.model_budget_scopes sc on sc.id=ba.scope_id
   where ba.scope_id=b.scope_id and ba.attempt_id=b.attempt_id and ba.task_id=r.task_id and sc.owner_id=u and sc.currency='CNY'
    and ba.provider=b.provider and ba.model=b.model and ba.price_version=b.price_version and ba.status='settled' and ba.actual_micros is not null
    and ba.actual_micros=turn_private.planning_v2_usage_cost(v.output_wire,r.execution)) then return false;end if;
 -- Original receipt must actually name this publication; arbitrary completed row is insufficient.
 if not result_data_private.related_v1('receipt',c.receipt,jsonb_build_object('artifactIds',jsonb_build_array(artifact_n),'executionIds','[]'::jsonb,'publicationKeys','[]'::jsonb,'journalIds','[]'::jsonb)) then return false;end if;
 return true;
end$$;
create function result_data_private.journal_copy_v1(u uuid,artifact_n uuid,request_n uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare j turn_private.planning_v2_model_local_journal%rowtype;o turn_private.planning_v2_collector_origins%rowtype;r turn_private.planning_v2_execution_runs%rowtype;
begin
 select * into j from turn_private.planning_v2_model_local_journal where request_id=request_n and owner_id=u;
 select * into r from turn_private.planning_v2_execution_runs where turn_id=j.turn_id and owner_id=u and task_id=j.task_id;
 select * into o from turn_private.planning_v2_collector_origins where execution_id=r.id;
 return coalesce(j.request_id is not null and r.id is not null and result_data_private.completed_copy_v1(u,artifact_n,r.id)
  and j.binding=o.binding and j.scope_id=o.scope_id and j.attempt_id=o.attempt_id and j.request_id=o.request_id
  and j.payload_digest=o.payload_digest and j.request_digest=o.request_digest and j.phase='response_recorded' and j.unknown_at is null
  and j.output_wire=(select output_wire from turn_private.planning_v2_collector_outputs where execution_id=r.id)
  and turn_private.planning_v2_local_observation_v1(j.response_observation,'response_received',j.request_id,j.request_digest),false);
end$$;

-- Fixed retained source sets, from actual original IDs, not a whole task erase.
create function result_data_private.source_member_v1(relation_n text,v jsonb,refs_n jsonb,jobs_n uuid[]) returns text
language plpgsql stable security definer set search_path='' as $$
declare kind_n text;k text;
begin
 kind_n:=case relation_n when 'turn_private.assistant_conversations' then 'conversationIds' when 'turn_private.assistant_goals' then 'goalIds'
  when 'turn_private.assistant_messages' then 'messageIds' when 'turn_private.service_tasks' then 'taskIds' when 'public.turns' then 'turnIds'
  when 'public.chat_threads' then 'threadIds' when 'public.trips' then 'tripIds' when 'public.memory_profiles' then 'memoryIds'
  when 'turn_private.result_artifacts' then 'sourceArtifactIds' when 'public.trip_proposals' then 'proposalIds' end;
 if kind_n is not null and refs_n->kind_n ? (v->>'id') then return case kind_n
  when 'conversationIds' then 'conversations' when 'goalIds' then 'goals' when 'messageIds' then 'messages' when 'taskIds' then 'tasks'
  when 'turnIds' then 'turns' when 'threadIds' then 'threads' when 'tripIds' then 'trips' when 'memoryIds' then 'memories'
  when 'sourceArtifactIds' then 'sourceArtifacts' else 'proposals' end;end if;
 if relation_n='public.model_budget_attempts' and refs_n->'taskIds' ? (v->>'task_id') then return 'budgetAttempts';end if;
 if relation_n='public.model_budget_scopes' and exists(select 1 from turn_private.service_tasks t where refs_n->'taskIds' ? t.id::text and t.budget_scope_id::text=v->>'id'
  union all select 1 from public.model_budget_attempts a where refs_n->'taskIds' ? a.task_id::text and a.scope_id::text=v->>'id') then return 'planningSources';end if;
 if relation_n='public.model_budget_provider_limits' and exists(select 1 from public.model_budget_attempts a where refs_n->'taskIds' ? a.task_id::text and a.scope_id::text=v->>'scope_id' and a.provider=v->>'provider') then return 'planningSources';end if;
 if relation_n='turn_private.planning_v2_execution_profiles' and exists(select 1 from turn_private.planning_v2_execution_runs r where r.turn_id=any(jobs_n) and r.profile_id::text=v->>'id') then return 'planningSources';end if;
 if relation_n='turn_private.planning_v2_registered_tariffs' and exists(select 1 from turn_private.planning_v2_execution_runs r join turn_private.planning_v2_execution_profiles p on p.id=r.profile_id where r.turn_id=any(jobs_n) and p.tariff_id::text=v->>'id') then return 'planningSources';end if;
 if relation_n='turn_private.planning_v2_collector_principals' and exists(select 1 from turn_private.planning_v2_execution_runs r where r.turn_id=any(jobs_n) and r.collector_principal_id::text=v->>'id') then return 'planningSources';end if;

 if relation_n in('turn_private.text_content','turn_private.text_dispatches','turn_private.service_task_turns','turn_private.service_task_capacity','turn_private.work','turn_private.grounded_turns','turn_private.grounded_ai_assist_jobs')
  and (refs_n->'turnIds' ? (v->>'turn_id') or refs_n->'taskIds' ? (v->>'task_id')) then return 'planningSources';end if;
 if relation_n in('turn_private.assistant_travel_intakes','turn_private.assistant_message_source_receipts') and refs_n->'messageIds' ? (v->>'message_id') then return 'planningSources';end if;
 if relation_n in('turn_private.assistant_goal_trip_links','turn_private.assistant_goal_trip_receipts') and refs_n->'goalIds' ? (v->>'goal_id') then return 'planningSources';end if;
 if relation_n in('turn_private.planning_comparisons','turn_private.planning_intake_bindings','turn_private.planning_action_receipts','turn_private.planning_observations','turn_private.planning_model_dispatches','turn_private.planning_v2_place_checkpoints','turn_private.planning_v2_model_attempt_bindings') and v->>'turn_id'=any(jobs_n::text[]) then return 'planningSources';end if;
 return null;
end$$;
create function result_data_private.erase_member_v1(relation_n text,v jsonb,g jsonb) returns text language sql immutable set search_path='' as $$
 select case
 when relation_n='turn_private.result_artifacts' and g->'artifactIds' ? (v->>'id') then 'artifacts'
 when relation_n='turn_private.result_revisions' and g->'artifactIds' ? (v->>'artifact_id') then 'revisions'
 when relation_n='turn_private.result_events' and g->'artifactIds' ? (v->>'artifact_id') then 'resultEvents'
 when relation_n='turn_private.planning_v2_execution_runs' and g->'executionIds' ? (v->>'id') then 'executionRuns'
 when relation_n='turn_private.planning_v2_model_local_journal' and g->'journalIds' ? (v->>'request_id') then 'localJournals'
 when g->'executionIds' ? (v->>'execution_id') then case relation_n
  when 'turn_private.planning_v2_external_call_windows' then 'callWindows' when 'turn_private.planning_v2_collector_origins' then 'collectorOrigins'
  when 'turn_private.planning_v2_collector_outputs' then 'collectorOutputs' when 'turn_private.planning_v2_result_claims' then 'resultClaims'
  when 'turn_private.planning_v2_completion_proofs' then 'completionProofs' when 'turn_private.planning_v2_completed_receipts' then 'completedReceipts' end end
$$;

create function result_data_private.impact_sets_v1(g jsonb,seeds uuid[] default array[]::uuid[]) returns uuid[]
language sql volatile security definer set search_path='' as $$
 with recursive links(a,b) as (
  select o.set_id,i.set_id from knowledge_review_private.source_impact_outbox o join knowledge_review_private.source_impact_items i on i.id=o.item_id
  union select o.set_id,p.set_id from knowledge_review_private.source_impact_outbox o join knowledge_review_private.source_impact_projections p on p.id=o.receipt_id
  union select p.set_id,o.set_id from knowledge_review_private.source_impact_projections p join knowledge_review_private.source_impact_outbox o on o.id=p.delivery_id
  union select o.set_id,p.set_id from knowledge_review_private.source_impact_review_requests r join knowledge_review_private.source_impact_outbox o on o.id=r.delivery_id join knowledge_review_private.source_impact_projections p on p.id=r.projection_id
 ), edges(a,b) as(select a,b from links union select b,a from links), roots(id) as(
  select unnest(seeds)
  union select id from knowledge_review_private.source_impact_sets s where result_data_private.related_v1('impact',to_jsonb(s),g)
  union select set_id from knowledge_review_private.source_impact_items s where result_data_private.related_v1('impact',to_jsonb(s),g)
  union select set_id from knowledge_review_private.source_impact_pages s where result_data_private.related_v1('impact',to_jsonb(s),g)
  union select set_id from knowledge_review_private.source_impact_outbox s where result_data_private.related_v1('impact',to_jsonb(s),g)
  union select set_id from knowledge_review_private.source_impact_projections s where result_data_private.related_v1('impact',to_jsonb(s),g)
  union select o.set_id from knowledge_review_private.source_impact_review_requests s join knowledge_review_private.source_impact_outbox o on o.id=s.delivery_id where result_data_private.related_v1('impact',to_jsonb(s),g)
 ), reached(id) as(select id from roots where id is not null union select e.b from reached r join edges e on e.a=r.id)
 select coalesce(array_agg(id order by id),array[]::uuid[]) from(select id from reached limit 4101) bounded
$$;
create function result_data_private.reverse_binding_v1(relation_n text,v jsonb,jobs_n uuid[],task_n uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select relation_n in('turn_private.planning_v2_execution_runs','turn_private.planning_v2_completion_proofs','turn_private.planning_v2_completed_receipts','turn_private.planning_v2_model_local_journal','turn_private.planning_v2_collector_origins','turn_private.planning_v2_collector_outputs','turn_private.planning_v2_result_claims','turn_private.planning_v2_external_call_windows')
 and (v->>'turn_id'=any(jobs_n::text[]) or v->'binding'->>'turn'=any(jobs_n::text[]) or v->>'task_id'=task_n::text
  or exists(select 1 from turn_private.planning_v2_model_attempt_bindings b where b.turn_id=any(jobs_n) and b.scope_id::text=v->>'scope_id' and b.attempt_id::text=v->>'attempt_id'))
$$;
-- Full original queued-delete witnesses are CAS inputs, not body-copy erasures.
create function result_data_private.deletion_witnesses_v1(u uuid,refs_n jsonb,g jsonb) returns table(relation_name text,document_n jsonb)
language sql volatile security definer set search_path='' as $$
 select 'privacy_private.trip_deletions',to_jsonb(x) from privacy_private.trip_deletions x where owner_id=u and state='queued' and refs_n->'tripIds' ? trip_id::text
 union all select 'privacy_private.linked_delete_fences_v1',to_jsonb(x) from privacy_private.linked_delete_fences_v1 x where g->'artifactIds' ? entity_id::text or refs_n->'turnIds' ? entity_id::text
 union all select 'privacy_private.linked_delete_jobs_v1',to_jsonb(x) from privacy_private.linked_delete_jobs_v1 x join privacy_private.linked_delete_plans_v1 p on p.id=x.plan_id where x.owner_id=u and x.completed_at is null and (p.selection->'artifactIds' ?| array(select jsonb_array_elements_text(g->'artifactIds')) or refs_n->'tripIds' ? x.trip_id::text)
 union all select 'privacy_private.linked_delete_plans_v1',to_jsonb(p) from privacy_private.linked_delete_jobs_v1 x join privacy_private.linked_delete_plans_v1 p on p.id=x.plan_id where x.owner_id=u and x.completed_at is null and (p.selection->'artifactIds' ?| array(select jsonb_array_elements_text(g->'artifactIds')) or refs_n->'tripIds' ? x.trip_id::text)
 union all select 'privacy_private.memory_delete_jobs_v1',to_jsonb(x) from privacy_private.memory_delete_jobs_v1 x join privacy_private.memory_delete_plans_v1 p on p.id=x.plan_id where x.owner_id=u and x.state='queued' and (p.selection->'artifactIds' ?| array(select jsonb_array_elements_text(g->'artifactIds')) or privacy_private.memory_delete_ids_v1(p.selection)&&privacy_private.linked_delete_array_v1(refs_n->'memoryIds'))
 union all select 'privacy_private.memory_delete_plans_v1',to_jsonb(p) from privacy_private.memory_delete_jobs_v1 x join privacy_private.memory_delete_plans_v1 p on p.id=x.plan_id where x.owner_id=u and x.state='queued' and (p.selection->'artifactIds' ?| array(select jsonb_array_elements_text(g->'artifactIds')) or privacy_private.memory_delete_ids_v1(p.selection)&&privacy_private.linked_delete_array_v1(refs_n->'memoryIds'))
 union all select 'conversation_data_private.operations_v1',to_jsonb(x) from conversation_data_private.operations_v1 x where x.owner_id=u and ((x.state='previewed' and not x.preview_erased and x.expires_at>floor(extract(epoch from clock_timestamp())*1000)::bigint and (x.graph->'artifactIds' ?| array(select jsonb_array_elements_text(g->'artifactIds')) or x.graph->'turnIds' ?| array(select jsonb_array_elements_text(refs_n->'turnIds')) or x.graph->'taskIds' ?| array(select jsonb_array_elements_text(refs_n->'taskIds')))) or (x.state='erased' and x.decision->'graph'->'artifactIds' ?| array(select jsonb_array_elements_text(g->'artifactIds'))))
$$;
create function result_data_private.source_v1(u uuid,root_n uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare a turn_private.result_artifacts%rowtype;m turn_private.assistant_messages%rowtype;t turn_private.service_tasks%rowtype;
 refs_n jsonb:=result_data_private.empty_refs_v1();g jsonb:=result_data_private.empty_graph_v1();rows_n jsonb:='[]';reverse_n jsonb:='[]';fingerprint_n jsonb;
 erase_n jsonb:=result_data_private.zero_counts_v1('erase');retain_n jsonb:=result_data_private.zero_counts_v1('retain');authorities_n jsonb:='[]';witness_n jsonb;
 spec record;v jsonb;doc_n jsonb;key_n jsonb;r record;count_key text;effect_n text;conflicts_n text[]:=array[]::text[];
 turns_n uuid[];jobs_n uuid[];impact_n uuid[];id_n uuid;tuple_n jsonb;qualified_n boolean;n integer;total_n integer:=0;raw_bytes_n bigint:=0;
begin
 select * into a from turn_private.result_artifacts where id=root_n and owner_id=u;
 if not found then raise exception 'RESULT_SOURCE_UNAVAILABLE';end if;
 select * into m from turn_private.assistant_messages where id=a.input_message_id and owner_id=u;
 select * into t from turn_private.service_tasks where id=a.task_id and owner_id=u;
 if m.id is null or t.id is null or m.goal_id<>a.goal_id or m.task_id<>a.task_id or not exists(select 1 from turn_private.assistant_goals original where original.id=a.goal_id and original.owner_id=u and original.conversation_id=m.conversation_id) then raise exception 'RESULT_SOURCE_UNAVAILABLE';end if;
 authorities_n:=jsonb_build_array(jsonb_build_object('policyId',m.policy_id,'consentId',m.consent_id),jsonb_build_object('policyId',t.policy_id,'consentId',t.consent_id));
 authorities_n:=conversation_data_private.authorities_union_v1(authorities_n);
 perform conversation_data_private.authorities_current_v1(u,authorities_n);
 if not result_data_private.schema_supported_v1() then conflicts_n:=conflicts_n||array['SOURCE_UNSUPPORTED'];end if;
 refs_n:=refs_n||jsonb_build_object('conversationIds',jsonb_build_array(m.conversation_id),'goalIds',jsonb_build_array(a.goal_id),'messageIds',jsonb_build_array(m.id),
  'taskIds',jsonb_build_array(t.id),'threadIds',case when t.thread_id is null then '[]'::jsonb else jsonb_build_array(t.thread_id) end,
  'tripIds',case when a.trip_id is null then '[]'::jsonb else jsonb_build_array(a.trip_id) end,
  'sourceArtifactIds',case when a.source_result_id is null then '[]'::jsonb else jsonb_build_array(a.source_result_id) end,
  'proposalIds',case when a.proposal_id is null then '[]'::jsonb else jsonb_build_array(a.proposal_id) end);
 select conversation_data_private.union_ids_v1(array_agg(task_turn_id)||array[t.goal_turn_id,t.last_turn_id,a.source_turn_id]) into turns_n from turn_private.result_revisions where artifact_id=root_n;
 refs_n:=jsonb_set(refs_n,'{turnIds}',to_jsonb(turns_n));
 select coalesce(jsonb_agg(id order by id),'[]') into doc_n from public.memory_profiles where owner_id=u and id in(
  select coalesce(b->>'memoryId',b->>'id')::uuid from turn_private.result_revisions x cross join lateral jsonb_array_elements(x.memory_basis) b
  where x.artifact_id=root_n and notification_private.uuid(coalesce(b->'memoryId',b->'id')));
 refs_n:=jsonb_set(refs_n,'{memoryIds}',doc_n);
 if exists(select 1 from turn_private.result_revisions x cross join lateral jsonb_array_elements(x.memory_basis) basis
  where x.artifact_id=root_n and (notification_private.uuid(coalesce(basis->'memoryId',basis->'id')) is not true or not exists(select 1 from public.memory_profiles mp where mp.id::text=coalesce(basis->>'memoryId',basis->>'id') and mp.owner_id=u))) then conflicts_n:=conflicts_n||array['SHARED_OR_FOREIGN_SCOPE'];end if;
 select g||jsonb_build_object('artifactIds',jsonb_build_array(root_n),'revisions',coalesce(jsonb_agg(revision order by revision),'[]'),
  'publicationKeys',coalesce(jsonb_agg(idempotency_key order by idempotency_key),'[]')) into g from turn_private.result_revisions where artifact_id=root_n;
 select jsonb_set(g,'{eventIds}',coalesce(jsonb_agg(id::text order by id),'[]')) into g from turn_private.result_events where artifact_id=root_n;
 if jsonb_array_length(g->'revisions')<>a.current_revision or g->'revisions' is distinct from(select jsonb_agg(x) from generate_series(1,a.current_revision) x)
  or (select count(distinct idempotency_key) from turn_private.result_revisions where artifact_id=root_n)<>a.current_revision
  or exists(select 1 from turn_private.result_revisions where artifact_id=root_n and owner_id<>u)
  or exists(select 1 from turn_private.result_events where artifact_id=root_n and (owner_id<>u or id<=0 or revision not between 1 and a.current_revision))
  or jsonb_array_length(g->'eventIds')<a.current_revision then conflicts_n:=conflicts_n||array['SOURCE_UNSUPPORTED'];end if;
 if exists(select 1 from turn_private.result_revisions historical_n where historical_n.artifact_id=root_n and (historical_n.input_sequence<>m.sequence
  or not exists(select 1 from turn_private.service_task_turns st where st.turn_id=historical_n.task_turn_id and st.task_id=a.task_id and st.owner_id=u)
  or turn_private.valid_result_content_v2(historical_n.content) is not true or turn_private.valid_result_evidence_v2(historical_n.evidence_basis) is not true
  or not exists(select 1 from turn_private.result_events e where e.artifact_id=root_n and e.owner_id=u and e.revision=historical_n.revision and e.event_type=case historical_n.revision when 1 then 'ready' else 'revised' end))) then conflicts_n:=conflicts_n||array['SOURCE_UNSUPPORTED'];end if;
 if exists(select 1 from turn_private.result_revisions where artifact_id=root_n and (content->>'schemaVersion' not in('comparison/1','decision/1','journey-draft/1','practical/1','change-proposal-reference/1') or content->>'schemaVersion' is null)) then conflicts_n:=conflicts_n||array['SOURCE_UNSUPPORTED'];end if;
 if a.proposal_id is not null or exists(select 1 from turn_private.result_revisions where artifact_id=root_n and content->>'schemaVersion'='change-proposal-reference/1') then conflicts_n:=conflicts_n||array['PROPOSAL_REFERENCE'];end if;
 if a.source_result_id is not null or exists(select 1 from turn_private.result_revisions where artifact_id=root_n and content->>'schemaVersion'='decision/1') then conflicts_n:=conflicts_n||array['DECISION_REFERENCE'];end if;
 select coalesce(array_agg(turn_id order by turn_id),array[]::uuid[]) into jobs_n from turn_private.planning_comparisons where artifact_id=root_n;
 if cardinality(jobs_n)>1 then conflicts_n:=conflicts_n||array['SHARED_OR_FOREIGN_SCOPE'];end if;
 for id_n in select id from turn_private.planning_v2_execution_runs where turn_id=any(jobs_n) or task_id=a.task_id loop
  if cardinality(jobs_n)=1 and result_data_private.completed_copy_v1(u,root_n,id_n) then g:=jsonb_set(g,'{executionIds}',(g->'executionIds')||to_jsonb(id_n));
  else conflicts_n:=conflicts_n||array['ACTIVE_WORK'];end if;
 end loop;
 for id_n in select request_id from turn_private.planning_v2_model_local_journal where turn_id=any(jobs_n) loop
  if result_data_private.journal_copy_v1(u,root_n,id_n) then g:=jsonb_set(g,'{journalIds}',(g->'journalIds')||to_jsonb(id_n));else conflicts_n:=conflicts_n||array['ACTIVE_WORK'];end if;
 end loop;
 if jsonb_array_length(g->'executionIds')>1 or jsonb_array_length(g->'journalIds')>1 then conflicts_n:=conflicts_n||array['SHARED_OR_FOREIGN_SCOPE'];end if;
 impact_n:=result_data_private.impact_sets_v1(g);
 if cardinality(impact_n)>4100 then conflicts_n:=conflicts_n||array['SCOPE_TOO_LARGE'];end if;
 -- Every fixed relation is searched for scalar, typed JSON and original BYTEA
 -- dependencies; foreign rows enter only internal hashes and blocker names.
 for spec in select * from result_data_private.relations_v1() order by relation_name collate "C" loop
  n:=0;
  for v in execute format('select to_jsonb(actual) from %s actual where result_data_private.erase_member_v1(%L,to_jsonb(actual),$1) is not null or result_data_private.source_member_v1(%L,to_jsonb(actual),$2,$3) is not null or result_data_private.related_v1(%L,to_jsonb(actual),$1) or result_data_private.reverse_binding_v1(%L,to_jsonb(actual),$3,$6) or (%L like ''knowledge_review_private.source_impact_%%'' and (to_jsonb(actual)->>''set_id''=any($4::text[]) or %L=''knowledge_review_private.source_impact_sets'' and to_jsonb(actual)->>''id''=any($4::text[]) or %L=''knowledge_review_private.source_impact_review_requests'' and (to_jsonb(actual)->>''delivery_id'' in(select id::text from knowledge_review_private.source_impact_outbox where set_id=any($4)) or to_jsonb(actual)->>''projection_id'' in(select id::text from knowledge_review_private.source_impact_projections where set_id=any($4))))) or (%L in(''export_private.core_jobs_v1'',''export_private.core_artifacts_v1'') and to_jsonb(actual)->>''owner_id''=$5::text) order by to_jsonb(actual)::text collate "C" limit 10001',
   spec.relation_name,spec.relation_name,spec.relation_name,spec.relation_name,spec.relation_name,spec.relation_name,spec.relation_name,spec.relation_name,spec.relation_name)
   using g,refs_n,jobs_n,impact_n,u,a.task_id loop
   n:=n+1;total_n:=total_n+1;raw_bytes_n:=raw_bytes_n+octet_length(v::text);
   if n>10000 or total_n>4100 then conflicts_n:=conflicts_n||array['SCOPE_TOO_LARGE'];exit;end if;
   key_n:=result_data_private.row_key_v1(v,spec.pk);
   if cardinality(spec.pk)=0 then conflicts_n:=conflicts_n||array['SOURCE_UNSUPPORTED'];end if;
   count_key:=result_data_private.erase_member_v1(spec.relation_name,v,g);effect_n:='erase';
   if count_key is null then count_key:=result_data_private.source_member_v1(spec.relation_name,v,refs_n,jobs_n);effect_n:='retain';end if;
   if count_key is not null then
    qualified_n:=v->>'owner_id'=u::text;
    if v->>'owner_id' is null then
     if spec.relation_name='public.model_budget_attempts' then qualified_n:=exists(select 1 from public.model_budget_scopes where id=(v->>'scope_id')::uuid and owner_id=u);
     elsif spec.relation_name='public.model_budget_provider_limits' then qualified_n:=exists(select 1 from public.model_budget_scopes where id=(v->>'scope_id')::uuid and owner_id=u);
     elsif spec.relation_name='turn_private.planning_v2_registered_tariffs' then qualified_n:=exists(select 1 from turn_private.planning_v2_execution_runs admitted join turn_private.planning_v2_execution_profiles profile on profile.id=admitted.profile_id where admitted.owner_id=u and g->'executionIds' ? admitted.id::text and profile.tariff_id::text=v->>'id');
     elsif spec.relation_name='turn_private.planning_v2_collector_principals' then qualified_n:=exists(select 1 from turn_private.planning_v2_execution_runs admitted where admitted.owner_id=u and g->'executionIds' ? admitted.id::text and admitted.collector_principal_id::text=v->>'id');
     elsif spec.relation_name='turn_private.text_dispatches' then qualified_n:=exists(select 1 from turn_private.text_content where turn_id=(v->>'turn_id')::uuid and owner_id=u);
     else qualified_n:=exists(select 1 from turn_private.planning_v2_execution_runs where id=(v->>'execution_id')::uuid and owner_id=u and g->'executionIds' ? id::text);end if;
    end if;
    if qualified_n is not true then conflicts_n:=conflicts_n||array['SHARED_OR_FOREIGN_SCOPE'];end if;
    rows_n:=rows_n||jsonb_build_array(jsonb_build_object('table',spec.relation_name,'pk',key_n,'digest',result_data_private.digest_v1(v::text),'effect',effect_n,'countKey',count_key));
    if effect_n='erase' then erase_n:=jsonb_set(erase_n,array[count_key],to_jsonb((erase_n->>count_key)::integer+1));
    else retain_n:=jsonb_set(retain_n,array[count_key],to_jsonb((retain_n->>count_key)::integer+1));end if;
    if v->>'policy_id' is not null and v->>'consent_id' is not null then authorities_n:=authorities_n||jsonb_build_array(jsonb_build_object('policyId',v->'policy_id','consentId',v->'consent_id'));end if;
    if v->>'planning_policy_id' is not null and v->>'planning_consent_id' is not null then authorities_n:=authorities_n||jsonb_build_array(jsonb_build_object('policyId',v->'planning_policy_id','consentId',v->'planning_consent_id'));end if;
    if spec.relation_name='public.turns' and v->>'status' not in('completed','unavailable','failed','cancelled')
     or spec.relation_name='turn_private.work' and v->>'state' not in('completed','failed','cancelled')
     or spec.relation_name='turn_private.grounded_ai_assist_jobs' and v->>'status' in('queued','running')
     or spec.relation_name='turn_private.service_task_capacity' and v->>'state'='reserved'
     or spec.relation_name='public.model_budget_attempts' and v->>'status' not in('settled','released')
     or spec.relation_name='turn_private.planning_comparisons' and v->>'state'<>'completed'
     or spec.relation_name='turn_private.planning_v2_place_checkpoints' and v->>'state'<>'completed'
     or spec.relation_name='turn_private.planning_v2_model_attempt_bindings' and v->>'unknown_at' is not null
     or spec.relation_name='turn_private.planning_action_receipts' and v->>'state'<>'completed' then conflicts_n:=conflicts_n||array['ACTIVE_WORK'];end if;
    if effect_n='retain' and spec.relation_name<>'turn_private.planning_comparisons' and result_data_private.related_v1(spec.relation_name,v,g) then
     conflicts_n:=conflicts_n||case when spec.relation_name='turn_private.assistant_message_source_receipts' then 'CONVERSATION_SOURCE_REFERENCE' else 'SOURCE_UNSUPPORTED' end;
    end if;
   else
    reverse_n:=reverse_n||jsonb_build_array(jsonb_build_object('table',spec.relation_name,'pk',key_n,'digest',result_data_private.digest_v1(v::text)));
    conflicts_n:=conflicts_n||case
     when spec.relation_name='turn_private.result_artifacts' or spec.relation_name='turn_private.result_revisions' then case when v->'content'->>'schemaVersion'='decision/1' or v->>'source_result_id'=root_n::text then 'DECISION_REFERENCE' else 'CROSS_RESULT_REFERENCE' end
     when spec.relation_name='turn_private.assistant_message_source_receipts' then 'CONVERSATION_SOURCE_REFERENCE'
     when result_data_private.reverse_binding_v1(spec.relation_name,v,jobs_n,a.task_id) then 'SHARED_OR_FOREIGN_SCOPE'
     when spec.relation_name like 'readiness_private.%' then 'READINESS_REFERENCE' when spec.relation_name like 'guide_private.%' then 'GUIDE_REFERENCE'
     when spec.relation_name like 'scoped_edit_private.%' then 'SCOPED_EDIT_REFERENCE' when spec.relation_name like 'notification_private.%' or spec.relation_name like 'notification_exit_private.%' then 'NOTIFICATION_REFERENCE'
     when spec.relation_name like 'service_brief_private.%' then 'BRIEF_REFERENCE' when spec.relation_name like 'knowledge_review_private.source_impact_%' then 'KNOWLEDGE_MIXED_COPY'
     when spec.relation_name='public.trip_proposals' then 'PROPOSAL_REFERENCE'
     when spec.relation_name in('export_private.core_jobs_v1','export_private.core_artifacts_v1') then null
     when spec.relation_name like 'privacy_private.%' or spec.relation_name like 'conversation_data_private.%' then 'OTHER_DELETE_PENDING'
     else 'SOURCE_UNSUPPORTED' end;
   end if;
  end loop;
  if 'SCOPE_TOO_LARGE'=any(conflicts_n) then exit;end if;
 end loop;
 -- References and source identities are owner-qualified exactly, including every
 -- historical turn; absence/foreign mismatch is never reported as an eligible graph.
 if (retain_n->>'conversations')::integer<>1 or (retain_n->>'goals')::integer<>1 or (retain_n->>'messages')::integer<>1 or (retain_n->>'tasks')::integer<>1
  or (retain_n->>'turns')::integer<>cardinality(turns_n)
  or (retain_n->>'threads')::integer<>jsonb_array_length(refs_n->'threadIds')
  or (retain_n->>'trips')::integer<>jsonb_array_length(refs_n->'tripIds')
  or (retain_n->>'sourceArtifacts')::integer<>jsonb_array_length(refs_n->'sourceArtifactIds')
  or (retain_n->>'proposals')::integer<>jsonb_array_length(refs_n->'proposalIds') then conflicts_n:=conflicts_n||array['SHARED_OR_FOREIGN_SCOPE'];end if;
 if exists(select 1 from export_private.core_artifacts_v1 where owner_id=u) or exists(select 1 from export_private.core_jobs_v1 where owner_id=u and (state in('queued','running') or lease_expires_at>clock_timestamp())) then conflicts_n:=conflicts_n||array['CORE_EXPORT_COPY'];end if;
 if exists(select 1 from privacy_private.trip_deletions where owner_id=u and state='queued' and refs_n->'tripIds' ? trip_id::text)
  or exists(select 1 from privacy_private.linked_delete_fences_v1 where entity_id=root_n or refs_n->'turnIds' ? entity_id::text)
  or exists(select 1 from privacy_private.memory_delete_jobs_v1 j join privacy_private.memory_delete_plans_v1 p on p.id=j.plan_id where j.owner_id=u and j.state='queued' and (p.selection->'artifactIds' ? root_n::text or privacy_private.memory_delete_ids_v1(p.selection)&&privacy_private.linked_delete_array_v1(refs_n->'memoryIds')))
  or exists(select 1 from conversation_data_private.operations_v1 o where owner_id=u and state='previewed' and not preview_erased and expires_at>floor(extract(epoch from clock_timestamp())*1000)::bigint and (o.graph->'artifactIds' ? root_n::text or o.graph->'taskIds' ? a.task_id::text or o.graph->'turnIds' ?| array(select jsonb_array_elements_text(refs_n->'turnIds'))))
  or exists(select 1 from conversation_data_private.operations_v1 o where state='erased' and (o.decision->'graph'->'artifactIds' ? root_n::text or o.decision->'graph'->'taskIds' ? a.task_id::text)) then conflicts_n:=conflicts_n||array['OTHER_DELETE_PENDING'];end if;
 for r in select * from result_data_private.deletion_witnesses_v1(u,refs_n,g) order by relation_name collate "C",document_n::text collate "C" limit 4101 loop
  total_n:=total_n+1;raw_bytes_n:=raw_bytes_n+octet_length(r.document_n::text);
  select pk into spec from result_data_private.relations_v1() where relation_name=r.relation_name;
  key_n:=case when r.relation_name='conversation_data_private.operations_v1' then jsonb_build_object('request_id',r.document_n->'request_id') else result_data_private.row_key_v1(r.document_n,spec.pk) end;
  reverse_n:=reverse_n||jsonb_build_array(jsonb_build_object('table',r.relation_name,'pk',key_n,'digest',result_data_private.digest_v1(r.document_n::text)));
  conflicts_n:=conflicts_n||array['OTHER_DELETE_PENDING'];
 end loop;
 authorities_n:=conversation_data_private.authorities_union_v1(authorities_n);
 if jsonb_array_length(authorities_n)>100 then raise exception 'RESULT_CAPACITY';end if;
 witness_n:=conversation_data_private.authorities_current_v1(u,authorities_n);
 fingerprint_n:=jsonb_build_object('graph',g,'rows',rows_n,'reverse',reverse_n,'retainedReferences',refs_n,'authorities',authorities_n,'witness',witness_n,'conflicts',result_data_private.conflicts_v1(conflicts_n));
 if total_n+coalesce(jsonb_array_length(witness_n),0)>4100 or raw_bytes_n>1000000 or (select sum(jsonb_array_length(value)) from jsonb_each(g))>4100 or octet_length(fingerprint_n::text)>1000000 or jsonb_array_length(g->'eventIds')>3000 then conflicts_n:=conflicts_n||array['SCOPE_TOO_LARGE'];end if;
 if 'SCOPE_TOO_LARGE'=any(conflicts_n) then
  g:=jsonb_set(result_data_private.empty_graph_v1(),'{artifactIds}',jsonb_build_array(root_n));refs_n:=result_data_private.empty_refs_v1();
  erase_n:=result_data_private.zero_counts_v1('erase');retain_n:=result_data_private.zero_counts_v1('retain');rows_n:='[]';
 end if;
 return jsonb_build_object('graph',g,'eraseCounts',erase_n,'retainCounts',retain_n,'retainedReferences',refs_n,'conflicts',result_data_private.conflicts_v1(conflicts_n),
  'sourceAuthorities',authorities_n,'rows',rows_n,'reverse',reverse_n,'sourceDigest',result_data_private.digest_v1(fingerprint_n::text));
end$$;

create function result_data_private.parents_v1(relation_n text,v jsonb) returns table(kind text,entity_id uuid)
language plpgsql volatile security definer set search_path='' as $$
declare doc_n jsonb;sets_n uuid[];seed_n uuid[];n integer:=0;
begin
 return query select * from result_data_private.json_references_v1(result_data_private.documents_v1(relation_n,v));
 for doc_n in select * from result_data_private.notification_parents_v1(relation_n,v) loop
  return query select * from result_data_private.json_references_v1(doc_n);
 end loop;
 if relation_n='turn_private.result_artifacts' and notification_private.uuid(v->'id') then return query select 'artifactIds'::text,(v->>'id')::uuid;end if;
 if relation_n='turn_private.planning_v2_collector_origins' and notification_private.uuid(v->'request_id') then return query select 'journalIds'::text,(v->>'request_id')::uuid;end if;
 if relation_n='turn_private.result_revisions' and notification_private.uuid(v->'idempotency_key') then return query select 'publicationKeys'::text,(v->>'idempotency_key')::uuid;end if;
 if relation_n='turn_private.planning_v2_execution_runs' and notification_private.uuid(v->'id') then return query select 'executionIds'::text,(v->>'id')::uuid;end if;
 if relation_n='turn_private.planning_v2_model_local_journal' and notification_private.uuid(v->'request_id') then return query select 'journalIds'::text,(v->>'request_id')::uuid;end if;
 if relation_n like 'turn_private.planning_%' then
  -- For execution-less callbacks, the retained original job still identifies
  -- the erased parent. Financial tables are not enrolled into this join.
  return query select 'artifactIds'::text,j.artifact_id from turn_private.planning_comparisons j
   where j.turn_id::text=v->>'turn_id' or j.turn_id::text=v->'binding'->>'turn'
    or j.turn_id in(select r.turn_id from turn_private.planning_v2_execution_runs r where r.id::text=v->>'execution_id')
    or j.turn_id in(select b.turn_id from turn_private.planning_v2_model_attempt_bindings b
      where b.scope_id::text=v->>'scope_id' and b.attempt_id::text=v->>'attempt_id');
 end if;
 if relation_n like 'knowledge_review_private.source_impact_%' then
  select coalesce(array_agg(id),array[]::uuid[]) into seed_n from(
   select nullif(v->>'set_id','')::uuid id union select (v->>'id')::uuid where relation_n='knowledge_review_private.source_impact_sets'
   union select set_id from knowledge_review_private.source_impact_items where id=nullif(v->>'item_id','')::uuid
   union select set_id from knowledge_review_private.source_impact_outbox where id=nullif(v->>'delivery_id','')::uuid
   union select set_id from knowledge_review_private.source_impact_projections where id in(nullif(v->>'projection_id','')::uuid,nullif(v->>'receipt_id','')::uuid)) seeds;
  sets_n:=result_data_private.impact_sets_v1(result_data_private.empty_graph_v1(),seed_n);
  if cardinality(sets_n)>4100 then raise exception 'RESULT_CAPACITY';end if;
  for doc_n in select to_jsonb(s) from knowledge_review_private.source_impact_sets s where id=any(sets_n)
   union all select to_jsonb(s) from knowledge_review_private.source_impact_items s where set_id=any(sets_n)
   union all select to_jsonb(s) from knowledge_review_private.source_impact_pages s where set_id=any(sets_n)
   union all select to_jsonb(s) from knowledge_review_private.source_impact_outbox s where set_id=any(sets_n)
   union all select to_jsonb(s) from knowledge_review_private.source_impact_projections s where set_id=any(sets_n)
   union all select to_jsonb(s) from knowledge_review_private.source_impact_review_requests s where delivery_id in(select id from knowledge_review_private.source_impact_outbox where set_id=any(sets_n)) or projection_id in(select id from knowledge_review_private.source_impact_projections where set_id=any(sets_n)) loop
   n:=n+1;if n>4100 then raise exception 'RESULT_CAPACITY';end if;
   return query select * from result_data_private.json_references_v1(doc_n);
  end loop;
 end if;
end$$;
create function result_data_private.guard_source_v1() returns trigger language plpgsql volatile security definer set search_path='' as $$
declare relation_n text:=tg_table_schema||'.'||tg_table_name;new_n jsonb;old_n jsonb;ref record;
begin
 new_n:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 old_n:=case when tg_op='INSERT' then new_n else to_jsonb(old) end;
 -- Original owner account cascade remains possible. No session cascade exists.
 if tg_op='DELETE' and new_n->>'owner_id' is not null and not exists(select 1 from auth.users where id=(new_n->>'owner_id')::uuid) then return old;end if;
 for ref in select distinct p.kind collate "C" kind,p.entity_id from(
  select * from result_data_private.parents_v1(relation_n,new_n) union select * from result_data_private.parents_v1(relation_n,old_n)) p order by p.kind collate "C",p.entity_id loop
  if not pg_try_advisory_xact_lock_shared(hashtextextended('result-data-entity:'||ref.kind||':'||ref.entity_id::text,0)) then raise lock_not_available using message='RESULT_CONFLICT';end if;
  if result_data_private.fenced_v1(ref.kind,ref.entity_id) and not result_data_private.proof_v1(ref.kind,ref.entity_id) then raise exception 'RESULT_CONFLICT';end if;
 end loop;
 if tg_op='DELETE' then return old;else return new;end if;
end$$;
create function result_data_private.lock_source_v1(u uuid,source_n jsonb) returns void language plpgsql volatile security definer set search_path='' as $$
declare r record;v jsonb;pk_n text[];refs_n jsonb:=source_n->'retainedReferences';
begin
 -- Existing publication idempotency locks precede source parent locks. No
 -- owner-wide producer lock is added; only the eraser has exclusive entities.
 for r in select jsonb_array_elements_text(source_n->'graph'->'publicationKeys') id order by 1 loop
  if not pg_try_advisory_xact_lock(hashtextextended('result-idempotency:'||u||':'||r.id,0)) then raise lock_not_available using message='RESULT_CONFLICT';end if;
 end loop;
 perform 1 from turn_private.service_tasks where owner_id=u and refs_n->'taskIds' ? id::text order by id for update nowait;
 perform 1 from public.trips where owner_id=u and refs_n->'tripIds' ? id::text order by id for update nowait;
 perform 1 from turn_private.assistant_conversations where owner_id=u and refs_n->'conversationIds' ? id::text order by id for update nowait;
 perform 1 from public.chat_threads where owner_id=u and refs_n->'threadIds' ? id::text order by id for update nowait;
 perform 1 from public.turns where owner_id=u and refs_n->'turnIds' ? id::text order by id for update nowait;
 perform 1 from turn_private.assistant_goals where owner_id=u and refs_n->'goalIds' ? id::text order by id for update nowait;
 perform 1 from turn_private.assistant_messages where owner_id=u and refs_n->'messageIds' ? id::text order by id for update nowait;
 for r in select groups.key kind,ids.value::uuid id from jsonb_each(source_n->'graph') groups cross join lateral jsonb_array_elements_text(groups.value) ids(value)
  where groups.key in('artifactIds','executionIds','journalIds','publicationKeys') order by groups.key collate "C",ids.value::uuid loop
  if not pg_try_advisory_xact_lock(hashtextextended('result-data-entity:'||r.kind||':'||r.id::text,0)) then raise lock_not_available using message='RESULT_CONFLICT';end if;
  if result_data_private.fenced_v1(r.kind,r.id) then raise exception 'RESULT_CONFLICT';end if;
 end loop;
 perform conversation_data_private.authorities_current_v1(u,source_n->'sourceAuthorities');
 for v in select value from jsonb_array_elements((source_n->'rows')||(source_n->'reverse')) order by value->>'table' collate "C",(value->'pk')::text collate "C" loop
  select pk into pk_n from result_data_private.relations_v1() where relation_name=v->>'table';
  if v->>'table'='conversation_data_private.operations_v1' then pk_n:=array['request_id'];end if;
  if pk_n is null or cardinality(pk_n)=0 then raise exception 'RESULT_SOURCE_UNAVAILABLE';end if;
  execute format('select 1 from %s actual where result_data_private.row_key_v1(to_jsonb(actual),$1)=$2 for update nowait',v->>'table') using pk_n,v->'pk';
 end loop;
end$$;
create function result_data_private.erase_source_v1(u uuid,source_n jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare relation_n text;v jsonb;pk_n text[];count_key text;expected_n integer;actual_n integer;counts_n jsonb:=result_data_private.zero_counts_v1('erase');
begin
 -- Children are explicit and counted. This order leaves no FK cascade effect.
 foreach relation_n in array array['turn_private.result_events','turn_private.result_revisions','turn_private.planning_v2_completed_receipts','turn_private.planning_v2_collector_outputs','turn_private.planning_v2_model_local_journal','turn_private.planning_v2_result_claims','turn_private.planning_v2_external_call_windows','turn_private.planning_v2_collector_origins','turn_private.planning_v2_completion_proofs','turn_private.planning_v2_execution_runs','turn_private.result_artifacts'] loop
  select pk into pk_n from result_data_private.relations_v1() where relation_name=relation_n;
  for v in select value from jsonb_array_elements(source_n->'rows') where value->>'table'=relation_n and value->>'effect'='erase' order by (value->'pk')::text collate "C" loop
   execute format('delete from %s actual where result_data_private.row_key_v1(to_jsonb(actual),$1)=$2 and result_data_private.digest_v1(to_jsonb(actual)::text)=$3',relation_n)
    using pk_n,v->'pk',v->>'digest';get diagnostics actual_n=row_count;
   if actual_n<>1 then raise exception 'RESULT_SOURCE_CHANGED';end if;
   count_key:=v->>'countKey';counts_n:=jsonb_set(counts_n,array[count_key],to_jsonb((counts_n->>count_key)::integer+actual_n));
  end loop;
 end loop;
 if counts_n is distinct from source_n->'eraseCounts' then raise exception 'RESULT_SOURCE_CHANGED';end if;
 -- Source preservation verified after all actual triggers/effects, by full rows.
 for v in select value from jsonb_array_elements(source_n->'rows') where value->>'effect'='retain' loop
  select pk into pk_n from result_data_private.relations_v1() where relation_name=v->>'table';
  execute format('select count(*) from %s actual where result_data_private.row_key_v1(to_jsonb(actual),$1)=$2 and result_data_private.digest_v1(to_jsonb(actual)::text)=$3',v->>'table') into actual_n using pk_n,v->'pk',v->>'digest';
  if actual_n<>1 then raise exception 'RESULT_SOURCE_CHANGED';end if;
 end loop;
 return jsonb_build_object('erasedCounts',counts_n,'retainedCounts',source_n->'retainCounts');
end$$;

create function result_data_private.boundaries_v1(scope_n text) returns jsonb language sql immutable set search_path='' as $$ select case scope_n when 'result-sensitive-data/1' then '{"eraseFields":["one_selected_artifact_all_revisions_and_events","proven_exclusive_completed_planning_result_copies"],"retained":["original_conversations_goals_messages_tasks_turns_threads","confirmed_trip_content_history_proposals","explicit_memory_profiles_receipts_consents","original_source_results_and_evidence","financial_budget_dispatch_and_source_records","permanent_artifact_publication_execution_journal_and_operation_fences","original_source_policy_consent_authority_ids"],"missing":["cross_result_or_conversation_source_dependents_rejected","applied_or_unapplied_proposal_and_decision_dependencies_rejected","active_shared_or_unqualified_copies_rejected","brief_guide_notification_knowledge_and_core_export_copies_rejected","provider_and_external_copies_not_erased","backup_restore_and_old_device_acceptance_unverified"]}'::jsonb else '{"eraseFields":["selected_transient_preview_graph_counts_references_conflicts"],"retained":["selection_actor_epoch_hash_time_operation_fences","immutable_minimal_decisions_and_identity_tombstones","original_source_policy_consent_authority_ids"],"missing":["source_results_not_erased","unselected_operations","external_copies","backup_restore_and_old_device_acceptance_unverified"]}'::jsonb end $$;
create function result_data_private.binding_v1(r result_data_private.operations_v1) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('schemaVersion','result-data/1','scope',r.scope,'requestId',r.request_id,'rootKind',r.root_kind,'rootId',r.root_id,'objectIds',r.object_ids,
  'ownerId',r.owner_id,'sessionId',r.session_id,'mobileEpoch',r.mobile_epoch,'sourceDigest',r.source_digest,'previewDigest',r.preview_digest,
  'sourceAuthorities',r.source_authorities,'capturedAt',r.captured_at,'expiresAt',r.expires_at,'boundaries',result_data_private.boundaries_v1(r.scope),'allUserDataCompleted',false)
$$;

create function result_data_private.preview_v1(r result_data_private.operations_v1) returns jsonb language sql stable set search_path='' as $$
 select result_data_private.binding_v1(r)||jsonb_build_object('kind','preview','graph',r.graph,'eraseCounts',r.erase_counts,'retainCounts',r.retain_counts,
  'retainedReferences',r.retained_references,'conflicts',r.conflicts,'eligible',r.conflicts='[]'::jsonb,'progressCount',case when r.scope='result-delete-progress/1' then cardinality(r.object_ids) else 0 end)
$$;

create function result_data_private.receipt_v1(r result_data_private.operations_v1) returns jsonb language sql stable set search_path='' as $$
 select result_data_private.binding_v1(r)||jsonb_build_object('kind','receipt','state','erased','decision',r.decision)
$$;

create function result_data_private.progress_source_v1(u uuid,ids uuid[],request_n uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare inventory_n jsonb;authorities_n jsonb;witness_n jsonb;count_n integer;
begin
 select coalesce(jsonb_agg(result_data_private.operation_row_v1(actual) order by request_id),'[]'::jsonb),count(*) into inventory_n,count_n
  from result_data_private.operations_v1 actual where owner_id=u and request_id=any(ids) and request_id<>request_n;
 if count_n<>cardinality(ids) then raise exception 'RESULT_SOURCE_UNAVAILABLE';end if;
 select conversation_data_private.authorities_union_v1(coalesce(jsonb_agg(pair),'[]'::jsonb)) into authorities_n
  from jsonb_array_elements(inventory_n) op cross join lateral jsonb_array_elements(op->'sourceAuthorities') pair;
 if jsonb_array_length(authorities_n)>100 or octet_length(inventory_n::text)>1000000 then raise exception 'RESULT_CAPACITY';end if;
 witness_n:=conversation_data_private.authorities_current_v1(u,authorities_n);
 return jsonb_build_object('graph',result_data_private.empty_graph_v1(),'eraseCounts',result_data_private.zero_counts_v1('erase'),
  'retainCounts',result_data_private.zero_counts_v1('retain'),'sourceAuthorities',authorities_n,
  'retainedReferences',result_data_private.empty_refs_v1(),'conflicts','[]'::jsonb,
  'sourceDigest',result_data_private.digest_v1(jsonb_build_array(inventory_n,witness_n)::text));
end$$;




create function public.privacy_result_data_v1(p_action text,p_input_bytes text,p_expected_epoch bigint) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor_n jsonb;u uuid;s uuid;e bigint;v jsonb;mutation_n jsonb;bytes_n text;digest_n text;request_n uuid;ids uuid[];
 scope_n text;kind_n text;root_n uuid;r result_data_private.operations_v1%rowtype;source_n jsonb;rebuilt_n jsonb;
 result_n jsonb;decision_n jsonb;counts_n jsonb;inventory_n jsonb;items_n jsonb;row_n jsonb;preview_hash text;
 captured_n bigint;expires_n bigint;now_n bigint;cleared_n integer:=0;fences_n integer:=0;n integer;after_n uuid;more_n boolean;last_n uuid;new_decision boolean:=false;list_authorities jsonb:='[]'::jsonb;list_sources_n jsonb:='[]';
begin
 actor_n:=result_data_private.actor_v1(p_expected_epoch);u:=(actor_n->>'ownerId')::uuid;s:=(actor_n->>'sessionId')::uuid;e:=(actor_n->>'mobileEpoch')::bigint;
 if p_action is null or p_input_bytes is null or octet_length(p_input_bytes)>(case p_action when 'recover' then 16384 else 8192 end) then raise exception 'INVALID_INPUT';end if;
 begin v:=p_input_bytes::jsonb;exception when others then raise exception 'INVALID_INPUT';end;
 if result_data_private.input_v1(v,p_action) is not true then raise exception 'INVALID_INPUT';end if;
 scope_n:=v->>'scope';kind_n:=v->>'rootKind';root_n:=nullif(v->>'rootId','')::uuid;
 captured_n:=floor(extract(epoch from clock_timestamp())*1000)::bigint;expires_n:=captured_n+30000;
 if p_action='list' then
  if scope_n='result-delete-progress/1' then
   select coalesce(jsonb_agg(result_data_private.operation_row_v1(actual) order by request_id),'[]'::jsonb) into inventory_n from
    (select * from result_data_private.operations_v1 where owner_id=u order by request_id limit 10001) actual;
  else
   inventory_n:='[]';
   for row_n in select to_jsonb(actual) from(select id,created_at,current_revision,lifecycle from turn_private.result_artifacts where owner_id=u order by id limit 10001) actual loop
    source_n:=result_data_private.source_v1(u,(row_n->>'id')::uuid);list_sources_n:=list_sources_n||jsonb_build_array(jsonb_build_array(row_n->'id',source_n->'sourceDigest'));
    if source_n->'conflicts' ? 'SCOPE_TOO_LARGE' then raise exception 'RESULT_CAPACITY';end if;
    if source_n->'conflicts' ? 'SOURCE_UNSUPPORTED' or source_n->'conflicts' ? 'SHARED_OR_FOREIGN_SCOPE' then raise exception 'RESULT_SOURCE_UNAVAILABLE';end if;
    list_authorities:=conversation_data_private.authorities_union_v1(list_authorities||(source_n->'sourceAuthorities'));
    if jsonb_array_length(list_authorities)>100 then raise exception 'RESULT_CAPACITY';end if;
    inventory_n:=inventory_n||jsonb_build_array(jsonb_build_object('rootKind','artifact','rootId',row_n->'id','createdAt',floor(extract(epoch from (row_n->>'created_at')::timestamptz)*1000)::bigint,
     'currentRevision',row_n->'current_revision','revisionCount',jsonb_array_length(source_n->'graph'->'revisions'),'eventCount',jsonb_array_length(source_n->'graph'->'eventIds'),
     'lifecycle',row_n->'lifecycle','resultTypes',(select jsonb_agg(schema_n order by schema_n) from(select distinct content->>'schemaVersion' schema_n from turn_private.result_revisions where artifact_id=(row_n->>'id')::uuid) types)));
   end loop;
  end if;
  if scope_n='result-delete-progress/1' then
   select conversation_data_private.authorities_union_v1(coalesce(jsonb_agg(pair),'[]'::jsonb)) into list_authorities from jsonb_array_elements(inventory_n) op cross join lateral jsonb_array_elements(op->'sourceAuthorities') pair;
   if jsonb_array_length(list_authorities)>100 then raise exception 'RESULT_CAPACITY';end if;
   perform conversation_data_private.authorities_current_v1(u,list_authorities);
  end if;
  if jsonb_array_length(inventory_n)>10000 or octet_length(inventory_n::text)>1000000 then raise exception 'RESULT_CAPACITY';end if;
  digest_n:=result_data_private.digest_v1(jsonb_build_array(inventory_n,list_sources_n,conversation_data_private.authorities_current_v1(u,list_authorities))::text);
  after_n:=case when v->'cursor'='null'::jsonb then null else (v->'cursor'->>'afterId')::uuid end;
  if after_n is not null and (v->'cursor'->>'sourceDigest' is distinct from digest_n or not exists(select 1 from jsonb_array_elements(inventory_n) actual where (case when scope_n='result-delete-progress/1' then actual->>'requestId' else actual->>'rootId' end)=after_n::text)) then raise exception 'RESULT_SOURCE_CHANGED';end if;
  select coalesce(jsonb_agg(value order by (case when scope_n='result-delete-progress/1' then value->>'requestId' else value->>'rootId' end)),'[]'::jsonb) into items_n from
   (select value from jsonb_array_elements(inventory_n) where after_n is null or (case when scope_n='result-delete-progress/1' then value->>'requestId' else value->>'rootId' end)>after_n::text order by (case when scope_n='result-delete-progress/1' then value->>'requestId' else value->>'rootId' end) limit 20) page;
  last_n:=nullif((case when scope_n='result-delete-progress/1' then items_n->-1->>'requestId' else items_n->-1->>'rootId' end),'')::uuid;
  more_n:=exists(select 1 from jsonb_array_elements(inventory_n) where last_n is not null and (case when scope_n='result-delete-progress/1' then value->>'requestId' else value->>'rootId' end)>last_n::text);
  result_n:=jsonb_build_object('schemaVersion','result-data/1','kind','list','scope',scope_n,'rootKind',kind_n,
   'ownerId',u,'sessionId',s,'mobileEpoch',e,'sourceDigest',digest_n,'capturedAt',captured_n,'expiresAt',expires_n,'items',items_n,'hasMore',more_n,
   'nextCursor',case when more_n then jsonb_build_object('sourceDigest',digest_n,'afterId',last_n) else null end,'allUserDataCompleted',false);
 else
  request_n:=(v->>'requestId')::uuid;ids:=privacy_private.linked_delete_array_v1(v->'objectIds');
  if p_action='recover' then bytes_n:=v->>'mutationBytes';mutation_n:=bytes_n::jsonb;else bytes_n:=p_input_bytes;mutation_n:=v;end if;
  digest_n:=result_data_private.digest_v1(bytes_n);
  -- Filter owner BEFORE any tuple lock or foreign/absent distinction.
  select * into r from result_data_private.operations_v1 where request_id=request_n and owner_id=u;
  if p_action='recover' and not found then
   result_n:=jsonb_build_object('schemaVersion','result-data/1','kind','unknown','scope',scope_n,'requestId',request_n,'rootKind',kind_n,'rootId',root_n,'objectIds',ids,
    'ownerId',u,'sessionId',s,'mobileEpoch',e,'requestDigest',digest_n,'allUserDataCompleted',false);
  else
   if r.request_id is not null then
    if r.session_id<>s or r.mobile_epoch<>e then raise exception 'SESSION_REPLACED';end if;
    if r.scope<>scope_n or r.root_kind is distinct from kind_n or r.root_id is distinct from root_n or r.object_ids is distinct from ids then raise exception 'RESULT_SOURCE_CHANGED';end if;
    perform conversation_data_private.authorities_current_v1(u,r.source_authorities);
    if p_action in('erase','recover') and (r.source_digest is distinct from mutation_n->>'sourceDigest' or r.preview_digest is distinct from mutation_n->>'previewDigest') then raise exception 'RESULT_SOURCE_CHANGED';end if;
   elsif p_action<>'preview' then raise exception 'RESULT_SOURCE_UNAVAILABLE';end if;
   if p_action='recover' then
    if r.state='erased' then
     if r.request_digest is distinct from digest_n then raise exception 'RESULT_SOURCE_CHANGED';end if;result_n:=result_data_private.receipt_v1(r);
    else result_n:=jsonb_build_object('schemaVersion','result-data/1','kind','unknown','scope',scope_n,'requestId',request_n,'rootKind',kind_n,'rootId',root_n,'objectIds',ids,
     'ownerId',u,'sessionId',s,'mobileEpoch',e,'requestDigest',digest_n,'allUserDataCompleted',false);end if;
   elsif p_action='erase' and r.state='erased' then
    if r.request_digest is distinct from digest_n then raise exception 'RESULT_SOURCE_CHANGED';end if;result_n:=result_data_private.receipt_v1(r);
   else
    if r.request_id is not null then perform result_data_private.deadline_v1(r.captured_at,r.expires_at);end if;
    if scope_n='result-sensitive-data/1' then
     source_n:=result_data_private.source_v1(u,root_n);
     if source_n->'conflicts'='[]'::jsonb then perform result_data_private.lock_source_v1(u,source_n);
      rebuilt_n:=result_data_private.source_v1(u,root_n);
      if rebuilt_n is distinct from source_n then raise exception 'RESULT_SOURCE_CHANGED';end if;source_n:=rebuilt_n;
     end if;
    else
     perform 1 from result_data_private.operations_v1 where owner_id=u and request_id=any(ids) order by request_id for update nowait;
     source_n:=result_data_private.progress_source_v1(u,ids,request_n);
    end if;
    -- Original source locks precede request-state lock. All later locks NOWAIT.
    if not pg_try_advisory_xact_lock(hashtextextended('result-data-request:'||request_n::text,0)) then raise lock_not_available using message='RESULT_CONFLICT';end if;
    select * into r from result_data_private.operations_v1 where request_id=request_n and owner_id=u for update nowait;
    if p_action='preview' and not found then
     select count(*) into n from result_data_private.operations_v1 where owner_id=u;if n>=10000 then raise exception 'RESULT_CAPACITY';end if;
     preview_hash:=result_data_private.digest_v1(jsonb_build_array(actor_n,v,source_n-array['rows','reverse'],captured_n,expires_n,result_data_private.boundaries_v1(scope_n))::text);
     insert into result_data_private.operations_v1(request_id,owner_id,session_id,mobile_epoch,scope,root_kind,root_id,object_ids,source_digest,preview_digest,source_authorities,
      captured_at,expires_at,graph,erase_counts,retain_counts,retained_references,conflicts)
     values(request_n,u,s,e,scope_n,kind_n,root_n,ids,source_n->>'sourceDigest',preview_hash,source_n->'sourceAuthorities',captured_n,expires_n,
      source_n->'graph',source_n->'eraseCounts',source_n->'retainCounts',source_n->'retainedReferences',source_n->'conflicts') returning * into r;
    else
     if r.request_id is null or r.preview_erased then raise exception 'RESULT_SOURCE_UNAVAILABLE';end if;
     if r.source_digest is distinct from source_n->>'sourceDigest' or r.graph is distinct from source_n->'graph'
      or r.erase_counts is distinct from source_n->'eraseCounts'
      or r.retain_counts is distinct from source_n->'retainCounts' or r.retained_references is distinct from source_n->'retainedReferences'
      or r.conflicts is distinct from source_n->'conflicts' or r.source_authorities is distinct from source_n->'sourceAuthorities' then raise exception 'RESULT_SOURCE_CHANGED';end if;
    end if;
    if p_action='preview' then result_n:=result_data_private.preview_v1(r);
    else
     if r.conflicts<>'[]'::jsonb then raise exception 'RESULT_CONFLICT';end if;
     perform result_data_private.deadline_v1(r.captured_at,r.expires_at);
     insert into result_data_private.transaction_proofs_v1(transaction_id,owner_id,request_id,source_digest,graph,expires_at)
      values(pg_current_xact_id(),u,r.request_id,r.source_digest,r.graph,r.expires_at);
     if scope_n='result-sensitive-data/1' then
      counts_n:=result_data_private.erase_source_v1(u,source_n);
      select coalesce(sum(jsonb_array_length(value)),0) into fences_n from jsonb_each(r.graph) where key in('artifactIds','executionIds','journalIds','publicationKeys');
     else
      update result_data_private.operations_v1 set preview_erased=true,graph=null,erase_counts=null,retain_counts=null,retained_references=null,conflicts=null
       where owner_id=u and request_id=any(ids) and not preview_erased;get diagnostics cleared_n=row_count;
      fences_n:=cardinality(ids);counts_n:=jsonb_build_object('erasedCounts',r.erase_counts,'retainedCounts',r.retain_counts);
     end if;
     perform result_data_private.actor_v1(p_expected_epoch);perform conversation_data_private.authorities_current_v1(u,r.source_authorities);
     now_n:=result_data_private.deadline_v1(r.captured_at,r.expires_at);new_decision:=true;
     decision_n:=jsonb_build_object('requestDigest',digest_n,'decidedAt',now_n,'graph',r.graph,'erasedCounts',counts_n->'erasedCounts',
      'retainedCounts',counts_n->'retainedCounts','clearedPreviews',cleared_n,'retainedFences',fences_n,
      'sourceResult',case scope_n when 'result-sensitive-data/1' then 'erased' else 'not_modified' end,'sourceConversation','not_modified',
      'sourceTrip','not_modified','explicitMemory','not_modified','externalCopies','not_erased');
     update result_data_private.operations_v1 set state='erased',request_digest=digest_n,decision=decision_n,preview_erased=true,
      graph=null,erase_counts=null,retain_counts=null,retained_references=null,conflicts=null where request_id=request_n and owner_id=u returning * into r;
     perform result_data_private.deadline_v1(r.captured_at,r.expires_at);
     delete from result_data_private.transaction_proofs_v1 where transaction_id=pg_current_xact_id();result_n:=result_data_private.receipt_v1(r);
    end if;
    perform result_data_private.deadline_v1(r.captured_at,r.expires_at);
   end if;
  end if;
 end if;
 perform result_data_private.actor_v1(p_expected_epoch);
 if scope_n='result-sensitive-data/1' and (p_action='list' or p_action='preview' and r.conflicts='[]'::jsonb or new_decision)
  and not result_data_private.schema_supported_v1() then raise exception 'RESULT_SOURCE_UNAVAILABLE';end if;
 if octet_length(jsonb_build_object('data',result_n)::text)>1000000 then raise exception 'RESULT_CAPACITY';end if;
 if p_action='list' then
  perform conversation_data_private.authorities_current_v1(u,list_authorities);
  perform result_data_private.deadline_v1(captured_n,expires_n);
 elsif r.request_id is not null then
  perform conversation_data_private.authorities_current_v1(u,r.source_authorities);
  if p_action='preview' or new_decision then perform result_data_private.deadline_v1(r.captured_at,r.expires_at);end if;
 end if;
 return result_n;
exception when lock_not_available then raise lock_not_available using message='RESULT_CONFLICT';
 when unique_violation then raise exception 'RESULT_CONFLICT';
end$$;


create function result_data_private.guard_core_copy_v1() returns trigger language plpgsql volatile security definer set search_path='' as $$
declare job_created timestamptz;may_copy boolean:=true;
begin
 if not exists(select 1 from auth.users where id=new.owner_id) then return new;end if;
 if not pg_try_advisory_xact_lock(hashtextextended(new.owner_id::text,34)) then raise lock_not_available using message='RESULT_CONFLICT';end if;
 if tg_table_name='core_jobs_v1' then job_created:=new.created_at;may_copy:=new.state in('queued','running','ready_partial','ready_complete');else
  select created_at into job_created from export_private.core_jobs_v1 where request_id=new.request_id and owner_id=new.owner_id for share nowait;
 end if;
 if exists(select 1 from result_data_private.operations_v1 r where r.owner_id=new.owner_id and r.scope='result-sensitive-data/1' and r.state='erased'
  and (r.decision->>'decidedAt')::bigint>=floor(extract(epoch from job_created)*1000)::bigint) and may_copy then raise exception 'RESULT_CONFLICT';end if;
 return new;
end$$;
create trigger result_core_job_fence_v1 before insert or update on export_private.core_jobs_v1 for each row execute function result_data_private.guard_core_copy_v1();
create trigger result_core_copy_fence_v1 before insert on export_private.core_artifacts_v1 for each row execute function result_data_private.guard_core_copy_v1();
-- Fixed audited tables only; their original guards/RLS remain installed.
do $$declare spec record;begin
 for spec in select * from result_data_private.relations_v1() loop
  execute format('create trigger result_source_fence_v1 before insert or update or delete on %s for each row execute function result_data_private.guard_source_v1()',spec.relation_name);
 end loop;
end$$;
revoke all on all functions in schema result_data_private from public,anon,authenticated,service_role;
revoke all on function public.privacy_result_data_v1(text,text,bigint) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
