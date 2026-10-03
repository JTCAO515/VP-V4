-- #228 minimal A: original owner command is the only canonical Memory writer.
do $$begin if to_regclass('export_private.memory_source_revisions_v1') is null then raise exception 'MEMORY_DELETE_REQUIRES_210';end if;end $$;
create table privacy_private.memory_delete_plans_v1 (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,session_epoch bigint not null,source_revision bigint not null,
 scope_digest text not null,selection jsonb not null,counts jsonb not null,conflicts jsonb not null,
 graph jsonb not null,operations jsonb not null,expires_at timestamptz not null
);
create table privacy_private.memory_delete_jobs_v1 (
 request_id uuid primary key,plan_id uuid not null unique references privacy_private.memory_delete_plans_v1(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,state text not null default 'queued' check(state in ('queued','completed')),
 requested_at timestamptz not null default clock_timestamp(),completed_at timestamptz,
 deleted_revisions jsonb not null,post_source_revision bigint not null,expected_graph jsonb not null,
 lease_id uuid,lease_operation uuid,lease_expires_at timestamptz,execution_xid xid8,execution_digest text,
 erased_counts jsonb
);
create index memory_delete_jobs_owner on privacy_private.memory_delete_jobs_v1(owner_id) where state='queued';
create table privacy_private.memory_delete_worker_settings_v1 (
 singleton boolean primary key default true check(singleton),enabled boolean not null default false,
 max_lease_ms integer not null check(max_lease_ms between 1 and 30000)
);
do $$declare n text;begin foreach n in array array['memory_delete_plans_v1','memory_delete_jobs_v1','memory_delete_worker_settings_v1'] loop execute format('alter table privacy_private.%I enable row level security',n);execute format('revoke all on privacy_private.%I from public,anon,authenticated,service_role',n);end loop;end $$;
create function privacy_private.memory_delete_ids_v1(s jsonb) returns uuid[] language sql immutable set search_path='' as $$
 select coalesce(array_agg((v->>'memoryId')::uuid order by (v->>'memoryId')::uuid),'{}') from jsonb_array_elements(s->'memories') v;
$$;
create function privacy_private.memory_delete_graph_v1(u uuid,ids uuid[],seed jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare refs uuid[];arts uuid[];outs uuid[];exps uuid[];tasks uuid[];s jsonb;counts jsonb;c jsonb:='[]';g jsonb;
begin
 if exists(select 1 from unnest(ids) x where not exists(select 1 from public.memory_profiles m where m.id=x and m.owner_id=u)) then raise exception 'FORBIDDEN';end if;
 select coalesce(array_agg(id order by id),'{}') into refs from (select id from public.memory_consumer_receipts where memory_id=any(ids) order by id limit 1001) q;
 select coalesce(array_agg(id order by id),'{}') into arts from (select a.id from turn_private.result_artifacts a where exists(select 1 from turn_private.result_revisions r cross join lateral jsonb_array_elements(r.memory_basis) b where r.artifact_id=a.id and b->>'id'=any(ids::text[])) order by a.id limit 1001) q;
 select coalesce(array_agg(turn_id order by turn_id),'{}') into outs from (select distinct t.turn_id from turn_private.text_content t join public.memory_consumer_receipts r on r.turn_id=t.turn_id where r.id=any(refs) and t.output_text is not null order by t.turn_id limit 1001) q;
 select coalesce(array_agg(request_id order by request_id),'{}') into exps from (select request_id from export_private.core_jobs_v1 j where owner_id=u and (state in ('queued','running','ready_partial','ready_complete') or exists(select 1 from export_private.core_artifacts_v1 a where a.request_id=j.request_id) or request_id=any(privacy_private.linked_delete_array_v1(coalesce(seed->'exportRequestIds','[]')))) order by request_id limit 101) q;
 if cardinality(ids)>100 or cardinality(refs)>1000 or cardinality(arts)>1000 or cardinality(outs)>1000 or cardinality(exps)>100 or cardinality(refs)+cardinality(arts)+cardinality(outs)+cardinality(exps)>3100 then
 return jsonb_build_object('selection',jsonb_build_object('memories','[]'::jsonb,'consumerReferenceIds','[]'::jsonb,'artifactIds','[]'::jsonb,'generatedTurnIds','[]'::jsonb,'exportRequestIds','[]'::jsonb),'counts',jsonb_build_object('memories',0,'consumerReferences',0,'artifacts',0,'generatedTurns',0,'exports',0),'conflicts','["SCOPE_TOO_LARGE"]'::jsonb,'graph','{}'::jsonb);end if;
 if seed is null and exists(select 1 from public.memory_profiles where id=any(ids) and state in ('deleted','rejected')) then c:=c||'"TERMINAL_MEMORY"'::jsonb;end if;
 if exists(select 1 from public.memory_consumer_receipts where id=any(refs) and owner_id<>u)
 or exists(select 1 from turn_private.result_artifacts where id=any(arts) and owner_id<>u)
 or exists(select 1 from turn_private.result_revisions where artifact_id=any(arts) and owner_id<>u)
 or exists(select 1 from turn_private.text_content where turn_id=any(outs) and owner_id<>u) then c:=c||'"FOREIGN_REFERENCE"'::jsonb;end if;
 -- Include every referenced Turn in activity checks, even if it has no output yet.
 if exists(select 1 from public.turns t join public.memory_consumer_receipts r on r.turn_id=t.id where r.id=any(refs) and (t.owner_id<>u or t.status not in ('completed','proposal_ready','unavailable','failed','cancelled')))
 or exists(select 1 from turn_private.work w where (w.turn_id=any(outs) or exists(select 1 from public.memory_consumer_receipts r where r.id=any(refs) and r.turn_id=w.turn_id) or exists(select 1 from turn_private.result_revisions r where r.artifact_id=any(arts) and r.task_turn_id=w.turn_id)) and w.state in ('queued','leased')) then c:=c||'"ACTIVE_WORK"'::jsonb;end if;
 select coalesce(array_agg(distinct t.id),'{}') into tasks from turn_private.service_tasks t where t.id in(select task_id from turn_private.result_artifacts where id=any(arts)) or exists(select 1 from turn_private.service_task_turns st join public.memory_consumer_receipts r on r.turn_id=st.turn_id where st.task_id=t.id and r.id=any(refs));
 if exists(select 1 from public.model_budget_attempts where task_id=any(tasks) and status in ('reserved','dispatched','pending')) or exists(select 1 from turn_private.service_task_capacity where task_id=any(tasks) and state='reserved') then if not(c ? 'ACTIVE_WORK') then c:=c||'"ACTIVE_WORK"'::jsonb;end if;end if;
 if exists(select 1 from turn_private.result_revisions where not(artifact_id=any(arts)) and content->'comparisonRef'->>'artifactId'=any(arts::text[])) then c:=c||'"CROSS_SCOPE_REFERENCE"'::jsonb;end if;
 s:=jsonb_build_object('memories',(select coalesce(jsonb_agg(jsonb_build_object('memoryId',id,'revision',revision,'sourceReceiptId',source_receipt_id) order by id),'[]') from public.memory_profiles where id=any(ids)), 'consumerReferenceIds',to_jsonb(refs),'artifactIds',to_jsonb(arts),'generatedTurnIds',to_jsonb(outs),'exportRequestIds',to_jsonb(exps));
 counts:=jsonb_build_object('memories',cardinality(ids),'consumerReferences',cardinality(refs),'artifacts',cardinality(arts),'generatedTurns',cardinality(outs),'exports',cardinality(exps));
 -- Hash bodies; never store summaries, input, generated content or export bytes in plans.
 g:=jsonb_build_object('memories',(select coalesce(jsonb_agg(jsonb_build_array(id,revision,source_receipt_id,consent_id,state,encode(sha256(convert_to(coalesce(summary,''),'UTF8')),'hex')) order by id),'[]') from public.memory_profiles where id=any(ids)),
 'refs',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from public.memory_consumer_receipts r where id=any(refs)),
 'artifacts',(select coalesce(jsonb_agg(jsonb_build_array(a.id,a.owner_id,a.task_id,a.current_revision,a.lifecycle,(select coalesce(jsonb_agg(jsonb_build_array(r.revision,r.owner_id,r.memory_basis,r.request_digest) order by r.revision),'[]') from turn_private.result_revisions r where r.artifact_id=a.id)) order by a.id),'[]') from turn_private.result_artifacts a where id=any(arts)),
 'outputs',(select coalesce(jsonb_agg(jsonb_build_array(turn_id,owner_id,hidden_at,encode(sha256(convert_to(jsonb_build_array(input_text,output_kind,output_text)::text,'UTF8')),'hex')) order by turn_id),'[]') from turn_private.text_content where turn_id=any(outs)),
 'exports',(select coalesce(jsonb_agg(jsonb_build_array(request_id,generation,state,artifact_digest,artifact_expires_at,lease_id,lease_expires_at) order by request_id),'[]') from export_private.core_jobs_v1 where request_id=any(exps)));
 return jsonb_build_object('selection',s,'counts',counts,'conflicts',c,'graph',g);
end $$;
create function privacy_private.memory_delete_lock_v1(u uuid,s jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,34));
 perform 1 from auth.users where id=u for key share nowait;if not found then raise exception 'FORBIDDEN';end if;
 perform 1 from identity_private.mobile_accounts where owner_id=u for update nowait;
 perform 1 from public.memory_consents where id in(select consent_id from public.memory_profiles where id=any(privacy_private.memory_delete_ids_v1(s))) order by id for update nowait;
 perform 1 from public.memory_profiles where id=any(privacy_private.memory_delete_ids_v1(s)) order by id for update nowait;
 insert into export_private.memory_source_revisions_v1(owner_id) values(u) on conflict do nothing;
 perform 1 from export_private.memory_source_revisions_v1 where owner_id=u for update nowait;
 perform 1 from public.memory_consumer_receipts where id=any(privacy_private.linked_delete_array_v1(s->'consumerReferenceIds')) order by id for update nowait;
 perform 1 from turn_private.result_artifacts where id=any(privacy_private.linked_delete_array_v1(s->'artifactIds')) order by id for update nowait;
 perform 1 from turn_private.text_content where turn_id=any(privacy_private.linked_delete_array_v1(s->'generatedTurnIds')) order by turn_id for update nowait;
 perform 1 from export_private.core_jobs_v1 where request_id=any(privacy_private.linked_delete_array_v1(s->'exportRequestIds')) order by request_id for update nowait;
end $$;
create function privacy_private.memory_delete_proof_v1(req uuid,digest text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(exists(select 1 from privacy_private.memory_delete_jobs_v1 j join privacy_private.memory_delete_plans_v1 p on p.id=j.plan_id where j.request_id=req and j.state='queued' and auth.role()='service_role' and j.execution_xid=pg_current_xact_id_if_assigned() and j.execution_digest=digest and digest=p.scope_digest and j.lease_expires_at>clock_timestamp()),false)
$$;
-- All derived writes share account-prefix locks; selected queued edges require exact transaction proof.
create function privacy_private.guard_memory_delete_derived_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb;oldr jsonb;u uuid;j record;hit boolean;b jsonb;
begin
 r:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;oldr:=case when tg_op='UPDATE' then to_jsonb(old) else r end;
 for u in select distinct x from unnest(array[(r->>'owner_id')::uuid,(oldr->>'owner_id')::uuid]) x where x is not null order by x loop
 if not exists(select 1 from auth.users where id=u) then continue;end if;
 perform 1 from auth.users where id=u for key share nowait;perform 1 from identity_private.mobile_accounts where owner_id=u for update nowait;
 for j in select q.request_id,p.scope_digest,p.selection from privacy_private.memory_delete_jobs_v1 q join privacy_private.memory_delete_plans_v1 p on p.id=q.plan_id where q.owner_id=u and q.state='queued' loop
 hit:=false;
 foreach b in array array[r,oldr] loop
 if tg_table_schema='export_private' then
   hit:=hit or tg_table_name='core_jobs_v1' and (b->>'state') in ('queued','running','ready_partial','ready_complete') or tg_table_name='core_artifacts_v1';
 elsif tg_table_name='memory_consumer_receipts' then hit:=hit or (j.selection->'memories') @> jsonb_build_array(jsonb_build_object('memoryId',b->>'memory_id'));
 else
 hit:=hit or (j.selection->'artifactIds') ? coalesce(b->>'artifact_id',b->>'id','') or (j.selection->'generatedTurnIds') ? coalesce(b->>'turn_id','');
 if jsonb_typeof(b->'memory_basis')='array' then hit:=hit or exists(select 1 from jsonb_array_elements(b->'memory_basis') m where (j.selection->'memories') @> jsonb_build_array(jsonb_build_object('memoryId',m->>'id')));end if;
 end if;
 end loop;
 if hit and privacy_private.memory_delete_proof_v1(j.request_id,j.scope_digest) is distinct from true then raise exception 'MEMORY_DELETION_PENDING';end if;
 end loop;
 end loop;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
do $$declare t text;begin foreach t in array array['public.memory_consumer_receipts','turn_private.result_artifacts','turn_private.result_revisions','turn_private.text_content','turn_private.planning_comparisons','turn_private.planning_action_receipts','turn_private.assistant_travel_intakes','export_private.core_jobs_v1','export_private.core_artifacts_v1'] loop execute format('create trigger memory_delete_derived_fence_v1 before insert or update or delete on %s for each row execute function privacy_private.guard_memory_delete_derived_v1()',t);end loop;end $$;
create function privacy_private.memory_delete_receipt_v1(j privacy_private.memory_delete_jobs_v1) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('kind','memory_delete_receipt/1','requestId',j.request_id,'planId',j.plan_id,'scope','memory-bulk-delete-d4/1','scopeDigest',p.scope_digest,'state',j.state,'sourceTombstoned',true,'cleanupPending',j.state='queued','requestedAt',export_private.ms_v1(j.requested_at),'completedAt',export_private.ms_v1(j.completed_at),'selection',p.selection,'deletedRevisions',j.deleted_revisions,'erasedCounts',j.erased_counts,'allUserDataCompleted',false,'retained','["FINANCIAL_RECORDS","USER_TRIP_INTENT","ORIGINAL_CHAT_INPUT","EXTERNAL_COPIES","PROVIDER_ERASURE_UNKNOWN","BACKUP_ERASURE_NOT_VERIFIED"]'::jsonb) from privacy_private.memory_delete_plans_v1 p where p.id=j.plan_id
$$;
create function public.privacy_memory_delete_v1(p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare keys text[];actor jsonb;u uuid;ids uuid[];item jsonb;g jsonb;s jsonb;rev bigint;ops jsonb;request uuid;lease uuid;operation uuid;
 p privacy_private.memory_delete_plans_v1%rowtype;j privacy_private.memory_delete_jobs_v1%rowtype;w privacy_private.memory_delete_worker_settings_v1%rowtype;
 deleted jsonb:='[]';erased jsonb;n integer;
begin
 keys:=case p_action when 'preview' then array['memoryIds'] when 'confirm' then array['requestId','planId','scopeDigest','confirmed','selection'] when 'read' then array['requestId'] when 'claim' then array['requestId','operationId'] when 'execute' then array['requestId','leaseId'] when 'purge' then array['operationId','limit'] end;
 if keys is null or jsonb_typeof(p_input) is distinct from 'object' or not(p_input ?& keys) or exists(select 1 from jsonb_object_keys(p_input) k where not(k=any(keys))) then raise exception 'INVALID_INPUT';end if;
 if p_action in ('claim','execute','purge') then if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 else actor:=privacy_private.linked_delete_actor_v1(p_action<>'read');u:=(actor->>'subject')::uuid;end if;
 foreach item in array array[p_input->'requestId',p_input->'planId',p_input->'operationId',p_input->'leaseId'] loop
 if item is not null and (jsonb_typeof(item) is distinct from 'string' or item#>>'{}' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') then raise exception 'INVALID_INPUT';end if;end loop;
 request:=(p_input->>'requestId')::uuid;
 if p_action='purge' then
 if jsonb_typeof(p_input->'limit') is distinct from 'number' or p_input->>'limit' !~ '^[1-9][0-9]{0,2}$' or (p_input->>'limit')::integer>100 then raise exception 'INVALID_INPUT';end if;
 delete from privacy_private.memory_delete_plans_v1 where id in(select x.id from privacy_private.memory_delete_plans_v1 x where expires_at<=clock_timestamp() and not exists(select 1 from privacy_private.memory_delete_jobs_v1 q where q.plan_id=x.id) order by x.id limit (p_input->>'limit')::integer for update of x skip locked);get diagnostics n=row_count;return jsonb_build_object('kind','memory_delete_purge/1','removedPlans',n);end if;
 if p_action='preview' then
 if jsonb_typeof(p_input->'memoryIds') is distinct from 'array' or jsonb_array_length(p_input->'memoryIds')=0 or jsonb_array_length(p_input->'memoryIds')>101 or exists(select 1 from jsonb_array_elements(p_input->'memoryIds') v where jsonb_typeof(v) is distinct from 'string' or v#>>'{}' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') then raise exception 'INVALID_INPUT';end if;
 ids:=privacy_private.linked_delete_array_v1(p_input->'memoryIds');if (select count(distinct x) from unnest(ids) x)<>cardinality(ids) then raise exception 'INVALID_INPUT';end if;
 insert into export_private.memory_source_revisions_v1(owner_id) values(u) on conflict do nothing;select revision into rev from export_private.memory_source_revisions_v1 where owner_id=u for share nowait;
 g:=privacy_private.memory_delete_graph_v1(u,ids);s:=g->'selection';
 select coalesce(jsonb_object_agg(v->>'memoryId',gen_random_uuid()),'{}') into ops from jsonb_array_elements(s->'memories') v;
 insert into privacy_private.memory_delete_plans_v1(owner_id,session_id,session_epoch,source_revision,scope_digest,selection,counts,conflicts,graph,operations,expires_at) values(u,(actor->>'sessionId')::uuid,(actor->>'mobileEpoch')::bigint,rev,encode(sha256(convert_to(jsonb_build_array(u,rev,g)::text,'UTF8')),'hex'),s,g->'counts',g->'conflicts',g->'graph',ops,clock_timestamp()+interval '5 minutes') returning * into p;
 return jsonb_build_object('kind','memory_delete_plan/1','planId',p.id,'sourceRevision',p.source_revision,'scopeDigest',p.scope_digest,'expiresAt',export_private.ms_v1(p.expires_at),'selection',p.selection,'counts',p.counts,'conflicts',p.conflicts,'retained',privacy_private.memory_delete_receipt_v1(null::privacy_private.memory_delete_jobs_v1)->'retained') || jsonb_build_object('retained','["FINANCIAL_RECORDS","USER_TRIP_INTENT","ORIGINAL_CHAT_INPUT","EXTERNAL_COPIES","PROVIDER_ERASURE_UNKNOWN","BACKUP_ERASURE_NOT_VERIFIED"]'::jsonb);
 end if;
 if p_action='confirm' then
 if p_input->'confirmed' is distinct from 'true'::jsonb then raise exception 'INVALID_INPUT';end if;
 select * into p from privacy_private.memory_delete_plans_v1 where id=(p_input->>'planId')::uuid and owner_id=u;if not found then raise exception 'FORBIDDEN';end if;
 if p_input->>'scopeDigest' is distinct from p.scope_digest or p_input->'selection' is distinct from p.selection then raise exception 'SCOPE_CHANGED';end if;
 select * into j from privacy_private.memory_delete_jobs_v1 where request_id=request;if found then if j.plan_id<>p.id or j.owner_id<>u then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;return privacy_private.memory_delete_receipt_v1(j);end if;
 if exists(select 1 from privacy_private.memory_delete_jobs_v1 where plan_id=p.id) then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
 if p.expires_at<=clock_timestamp() then raise exception 'PLAN_EXPIRED';end if;
 if p.session_id is distinct from (actor->>'sessionId')::uuid or p.session_epoch is distinct from (actor->>'mobileEpoch')::bigint then raise exception 'SESSION_REPLACED';end if;
 if p.conflicts<>'[]'::jsonb then raise exception 'SCOPE_CONFLICT';end if;
 perform privacy_private.memory_delete_lock_v1(u,p.selection);select * into p from privacy_private.memory_delete_plans_v1 where id=p.id for update nowait;
 select revision into rev from export_private.memory_source_revisions_v1 where owner_id=u;
 g:=privacy_private.memory_delete_graph_v1(u,privacy_private.memory_delete_ids_v1(p.selection));
 if rev<>p.source_revision or g->'graph' is distinct from p.graph or g->'selection' is distinct from p.selection or g->'conflicts'<>'[]'::jsonb then raise exception 'SCOPE_CHANGED';end if;
 -- Original authenticated owner, same transaction, immutable operation IDs stored by preview.
 for item in select value from jsonb_array_elements(p.selection->'memories') loop
 perform public.native_memory_command_v1(jsonb_build_object('action','state','operationId',p.operations->>(item->>'memoryId'),'memoryId',item->>'memoryId','sourceReceiptId',item->>'sourceReceiptId','expectedRevision',item->'revision','state','deleted'));
 deleted:=deleted||jsonb_build_object('memoryId',item->>'memoryId','revision',(select revision from public.memory_profiles where id=(item->>'memoryId')::uuid));end loop;
 select revision into rev from export_private.memory_source_revisions_v1 where owner_id=u;
 -- Invalidate whole selected controlled exports before installing the queued fence.
 -- Bytes and ticket hashes remain selected for worker cleanup, but no download stays usable.
 update export_private.core_jobs_v1 set state='expired',lease_id=null,lease_expires_at=null,artifact_expires_at=null where request_id=any(privacy_private.linked_delete_array_v1(p.selection->'exportRequestIds')) and owner_id=u;
 -- Snapshot AFTER own canonical transitions: never compare the pre-delete revision at cleanup.
 g:=privacy_private.memory_delete_graph_v1(u,privacy_private.memory_delete_ids_v1(p.selection),p.selection);
 insert into privacy_private.memory_delete_jobs_v1(request_id,plan_id,owner_id,deleted_revisions,post_source_revision,expected_graph) values(request,p.id,u,deleted,rev,g->'graph') returning * into j;
 return privacy_private.memory_delete_receipt_v1(j);
 end if;
 select * into j from privacy_private.memory_delete_jobs_v1 where request_id=request;if not found or u is not null and j.owner_id<>u then raise exception 'FORBIDDEN';end if;
 if p_action='read' then return privacy_private.memory_delete_receipt_v1(j);end if;
 if j.state='completed' then if p_action='execute' and p_input->>'leaseId' is distinct from j.lease_id::text then raise exception 'FORBIDDEN';end if;return privacy_private.memory_delete_receipt_v1(j);end if;
 select * into w from privacy_private.memory_delete_worker_settings_v1 where singleton and enabled for share nowait;if not found then return jsonb_build_object('kind','blocked');end if;
 select * into p from privacy_private.memory_delete_plans_v1 where id=j.plan_id;perform privacy_private.memory_delete_lock_v1(j.owner_id,p.selection);
 select * into j from privacy_private.memory_delete_jobs_v1 where request_id=request for update nowait;
 if j.state='completed' then return privacy_private.memory_delete_receipt_v1(j);end if;
 if p_action='claim' then
 operation:=(p_input->>'operationId')::uuid;
 if j.lease_operation=operation and j.lease_expires_at>clock_timestamp() then return jsonb_build_object('kind','leased','requestId',request,'leaseId',j.lease_id,'expiresAt',export_private.ms_v1(j.lease_expires_at),'reused',true,'scopeDigest',p.scope_digest,'selection',p.selection);end if;
 if j.lease_expires_at>clock_timestamp() then return jsonb_build_object('kind','blocked');end if;
 update privacy_private.memory_delete_jobs_v1 set lease_id=gen_random_uuid(),lease_operation=operation,lease_expires_at=clock_timestamp()+w.max_lease_ms*interval '1 millisecond' where request_id=request returning * into j;
 return jsonb_build_object('kind','leased','requestId',request,'leaseId',j.lease_id,'expiresAt',export_private.ms_v1(j.lease_expires_at),'reused',false,'scopeDigest',p.scope_digest,'selection',p.selection);end if;
 lease:=(p_input->>'leaseId')::uuid;if j.lease_id is distinct from lease or j.lease_expires_at<=clock_timestamp() then return jsonb_build_object('kind','blocked');end if;
 select revision into rev from export_private.memory_source_revisions_v1 where owner_id=j.owner_id;
 g:=privacy_private.memory_delete_graph_v1(j.owner_id,privacy_private.memory_delete_ids_v1(p.selection),p.selection);
 if rev<>j.post_source_revision or g->'graph' is distinct from j.expected_graph or g->'conflicts'<>'[]'::jsonb or exists(select 1 from public.memory_profiles where id=any(privacy_private.memory_delete_ids_v1(p.selection)) and (state<>'deleted' or summary is not null)) then raise exception 'SCOPE_CHANGED';end if;
 update privacy_private.memory_delete_jobs_v1 set execution_xid=pg_current_xact_id(),execution_digest=p.scope_digest where request_id=request;
 erased:=jsonb_build_object('consumerReferences',0,'artifacts',0,'generatedOutputs',0,'exports',0,'tickets',0);
 delete from turn_private.result_artifacts where id=any(privacy_private.linked_delete_array_v1(p.selection->'artifactIds')) and owner_id=j.owner_id;get diagnostics n=row_count;erased:=jsonb_set(erased,'{artifacts}',to_jsonb(n));
 update turn_private.text_content set output_text=null,output_kind=null where turn_id=any(privacy_private.linked_delete_array_v1(p.selection->'generatedTurnIds')) and owner_id=j.owner_id;get diagnostics n=row_count;erased:=jsonb_set(erased,'{generatedOutputs}',to_jsonb(n));
 delete from public.memory_consumer_receipts where id=any(privacy_private.linked_delete_array_v1(p.selection->'consumerReferenceIds')) and owner_id=j.owner_id;get diagnostics n=row_count;erased:=jsonb_set(erased,'{consumerReferences}',to_jsonb(n));
 delete from export_private.core_artifacts_v1 where request_id=any(privacy_private.linked_delete_array_v1(p.selection->'exportRequestIds')) and owner_id=j.owner_id;
 delete from export_private.core_tickets_v1 where request_id=any(privacy_private.linked_delete_array_v1(p.selection->'exportRequestIds')) and owner_id=j.owner_id;get diagnostics n=row_count;erased:=jsonb_set(erased,'{tickets}',to_jsonb(n));
 update export_private.core_jobs_v1 set state='expired',lease_id=null,lease_expires_at=null,artifact_digest=null,artifact_bytes=null,artifact_expires_at=null,modules='[]' where request_id=any(privacy_private.linked_delete_array_v1(p.selection->'exportRequestIds')) and owner_id=j.owner_id;get diagnostics n=row_count;erased:=jsonb_set(erased,'{exports}',to_jsonb(n));
 update privacy_private.memory_delete_jobs_v1 set state='completed',completed_at=clock_timestamp(),erased_counts=erased,execution_xid=null,execution_digest=null,expected_graph='{}' where request_id=request returning * into j;
 update privacy_private.memory_delete_plans_v1 set graph='{}',operations='{}' where id=p.id;
 return privacy_private.memory_delete_receipt_v1(j);
end $$;
revoke all on function public.privacy_memory_delete_v1(text,jsonb) from public,anon,authenticated,service_role;
do $$declare f regprocedure;begin for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='privacy_private' and p.proname like '%memory_delete%' loop execute 'revoke all on function '||f||' from public,anon,authenticated,service_role';end loop;end $$;
notify pgrst,'reload schema';
