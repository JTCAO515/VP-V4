-- #228 bounded D4 Memory export, no old writer/history/GRANT or material domain change.
do $$begin if to_regclass('export_private.core_jobs_v1') is null or to_regclass('memory_private.native_update_preimages_v1') is null then raise exception 'D4_MEMORY_DEPENDENCY_MISSING';end if;end $$;
create table export_private.memory_source_revisions_v1 (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 1 check(revision between 1 and 9007199254740990)
);
alter table export_private.memory_source_revisions_v1 enable row level security;
revoke all on export_private.memory_source_revisions_v1 from public,anon,authenticated,service_role;
alter table export_private.core_jobs_v1 add column memory_source_revision bigint check(memory_source_revision between 1 and 9007199254740990);
create table export_private.memory_section_progress_v1 (
 request_id uuid not null references export_private.core_jobs_v1(request_id) on delete cascade,
 lease_id uuid not null,generation integer not null,source_revision bigint not null,
 section text not null check(section in ('profiles','consents','receipts','consumerReferences','commands','undoMetadata')),
 pages integer not null default 0,rows integer not null default 0,
 last_cursor uuid,last_limit integer,next_cursor uuid,terminal boolean not null default false,
 primary key(request_id,generation,section)
);
alter table export_private.memory_section_progress_v1 enable row level security;
revoke all on export_private.memory_section_progress_v1 from public,anon,authenticated,service_role;
create function export_private.bump_memory_source_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare owners uuid[];u uuid;
begin
 owners:=case when tg_op='INSERT' then array[new.owner_id] when tg_op='DELETE' then array[old.owner_id] else array[old.owner_id,new.owner_id] end;
 for u in select distinct x from unnest(owners) x where x is not null order by x loop
  -- Root account deletion must cascade, never recreate a new counter or take job locks.
  if not exists(select 1 from auth.users where id=u) then continue;end if;
  perform 1 from auth.users where id=u for key share nowait;
  perform 1 from identity_private.mobile_accounts where owner_id=u for update nowait;
  insert into export_private.memory_source_revisions_v1(owner_id) values(u) on conflict do nothing;
  update export_private.memory_source_revisions_v1 set revision=revision+1 where owner_id=u;
 end loop;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
revoke all on function export_private.bump_memory_source_v1() from public,anon,authenticated,service_role;
do $$declare tab text;begin foreach tab in array array['public.memory_profiles','public.memory_consents','public.memory_receipts','public.memory_consumer_receipts','memory_private.native_command_receipts_v1','memory_private.native_update_preimages_v1'] loop execute format('create trigger memory_export_source_v1 before insert or update or delete on %s for each row execute function export_private.bump_memory_source_v1()',tab);end loop;end $$;
create function export_private.memory_source_current_v1(j export_private.core_jobs_v1) returns boolean language plpgsql security definer set search_path='' as $$
declare source bigint;
begin
 if j.memory_source_revision is null then return true;end if;
 select revision into source from export_private.memory_source_revisions_v1 where owner_id=j.owner_id for share nowait;
 return coalesce(source=j.memory_source_revision,false);
exception when lock_not_available then return false;
end $$;
revoke all on function export_private.memory_source_current_v1(export_private.core_jobs_v1) from public,anon,authenticated,service_role;
create function export_private.memory_rows_v1(p_owner uuid,p_section text) returns table(id uuid,item jsonb)
language sql stable security definer set search_path='' as $$
 select p.id,jsonb_build_object('memoryId',p.id,'revision',p.revision,'state',p.state,'constraintKind',p.constraint_kind,'summary',case when p.state='deleted' or c.status='revoked' then null else p.summary end,'sourceReceiptId',p.source_receipt_id,'consentId',p.consent_id,'consentStatus',c.status,'createdAt',export_private.ms_v1(p.created_at),'updatedAt',export_private.ms_v1(p.updated_at)) from public.memory_profiles p join public.memory_consents c on c.id=p.consent_id and c.owner_id=p.owner_id where p_section='profiles' and p.owner_id=p_owner
 union all select c.id,jsonb_build_object('consentId',c.id,'status',c.status,'createdAt',export_private.ms_v1(c.created_at),'updatedAt',export_private.ms_v1(c.updated_at)) from public.memory_consents c where p_section='consents' and c.owner_id=p_owner
 union all select r.id,jsonb_build_object('receiptId',r.id,'memoryId',r.memory_id,'eventState',r.event_state,'sourceKind',r.source_kind,'createdAt',export_private.ms_v1(r.created_at)) from public.memory_receipts r where p_section='receipts' and r.owner_id=p_owner
 union all select r.id,jsonb_build_object('referenceId',r.id,'memoryId',r.memory_id,'sourceReceiptId',r.source_receipt_id,'consumerKind',r.consumer_kind,'turnId',r.turn_id,'proposalId',r.proposal_id,'constraintKind',r.constraint_kind,'createdAt',export_private.ms_v1(r.created_at)) from public.memory_consumer_receipts r where p_section='consumerReferences' and r.owner_id=p_owner
 union all select c.operation_id,jsonb_build_object('commandId',c.operation_id,'memoryId',c.memory_id,'consentId',c.consent_id,'action',c.receipt->'action','state',c.receipt->'state','revision',c.receipt->'revision','sourceReceiptId',c.receipt->'sourceReceiptId','createdAt',export_private.ms_v1(c.created_at)) from memory_private.native_command_receipts_v1 c where p_section='commands' and c.owner_id=p_owner
 union all select u.operation_id,jsonb_build_object('commandId',u.operation_id,'memoryId',u.memory_id,'consentId',u.consent_id,'resultingRevision',u.resulting_revision,'expiresAt',export_private.ms_v1(u.expires_at)) from memory_private.native_update_preimages_v1 u where p_section='undoMetadata' and u.owner_id=p_owner;
$$;
revoke all on function export_private.memory_rows_v1(uuid,text) from public,anon,authenticated,service_role;

create function export_private.core_memory_page_v1(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare j export_private.core_jobs_v1;progress export_private.memory_section_progress_v1%rowtype;req uuid;lease uuid;gen integer;section text;cursor uuid;limit_n integer;revision bigint;page jsonb;more boolean;next_id uuid;n integer;replay boolean:=false;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or not(p_input ?& array['requestId','leaseId','generation','section','cursor','limit']) or p_input-array['requestId','leaseId','generation','section','cursor','limit']<>'{}' then raise exception 'INVALID_INPUT';end if;
 if jsonb_typeof(p_input->'requestId') is distinct from 'string' or p_input->>'requestId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or jsonb_typeof(p_input->'leaseId') is distinct from 'string' or p_input->>'leaseId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or jsonb_typeof(p_input->'generation') is distinct from 'number' or p_input->>'generation' !~ '^[1-3]$' then raise exception 'INVALID_INPUT';end if;
 req:=(p_input->>'requestId')::uuid;lease:=(p_input->>'leaseId')::uuid;gen:=(p_input->>'generation')::integer;section:=p_input->>'section';
 if jsonb_typeof(p_input->'section') is distinct from 'string' or section not in ('profiles','consents','receipts','consumerReferences','commands','undoMetadata') or jsonb_typeof(p_input->'limit') is distinct from 'number' or p_input->>'limit' !~ '^[1-9][0-9]{0,2}$' then raise exception 'INVALID_INPUT';end if;limit_n:=(p_input->>'limit')::integer;
 if p_input->'cursor'='null'::jsonb then cursor:=null;elsif jsonb_typeof(p_input->'cursor')='string' and p_input->>'cursor' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then cursor:=(p_input->>'cursor')::uuid;else raise exception 'INVALID_INPUT';end if;
 j:=export_private.lock_job_v1(req,true);if j.request_id is null or not export_private.live_lease_v1(j,lease,gen) then return jsonb_build_object('kind','unavailable');end if;
 if limit_n>(j.policy_snapshot->>'page_size')::integer or limit_n>100 then raise exception 'INVALID_INPUT';end if;
 insert into export_private.memory_source_revisions_v1(owner_id) values(j.owner_id) on conflict do nothing;
 select s.revision into revision from export_private.memory_source_revisions_v1 s where s.owner_id=j.owner_id for share nowait;
 if j.memory_source_revision is null then update export_private.core_jobs_v1 set memory_source_revision=revision where request_id=req returning * into j;elsif j.memory_source_revision<>revision then return jsonb_build_object('kind','unavailable');end if;
 select * into progress from export_private.memory_section_progress_v1 where request_id=req and generation=gen and memory_section_progress_v1.section=section for update;
 if found then
  if progress.lease_id<>lease or progress.source_revision<>revision then raise exception 'EXPORT_SOURCE_CHANGED';end if;
  if progress.last_cursor is not distinct from cursor then
   if progress.last_limit<>limit_n then raise exception 'EXPORT_SOURCE_CURSOR_CONFLICT';end if;replay:=true;
  elsif progress.terminal or progress.next_cursor is distinct from cursor then raise exception 'INVALID_EXPORT_CURSOR';end if;
 elsif cursor is not null then raise exception 'INVALID_EXPORT_CURSOR';end if;
 if cursor is not null and not exists(select 1 from export_private.memory_rows_v1(j.owner_id,section) r where r.id=cursor) then raise exception 'INVALID_EXPORT_CURSOR';end if;
 with candidates as(select * from export_private.memory_rows_v1(j.owner_id,section) r where cursor is null or r.id>cursor order by id limit limit_n+1),delivered as(select * from candidates order by id limit limit_n)
 select coalesce((select jsonb_agg(item order by id) from delivered),'[]'),(select count(*)>limit_n from candidates),(select id from delivered order by id desc limit 1),(select count(*) from delivered) into page,more,next_id,n;
 if not replay then
  if coalesce((select sum(p.pages) from export_private.memory_section_progress_v1 p where p.request_id=req and p.generation=gen),0)>=(j.policy_snapshot->>'max_pages')::integer then raise exception 'EXPORT_PAGE_LIMIT';end if;
  insert into export_private.memory_section_progress_v1(request_id,lease_id,generation,source_revision,section,pages,rows,last_cursor,last_limit,next_cursor,terminal)
  values(req,lease,gen,revision,section,1,n,cursor,limit_n,case when more then next_id else null end,not more)
  on conflict on constraint memory_section_progress_v1_pkey do update set pages=memory_section_progress_v1.pages+1,rows=memory_section_progress_v1.rows+n,last_cursor=cursor,last_limit=limit_n,next_cursor=case when more then next_id else null end,terminal=not more;
 end if;
 return jsonb_build_object('schemaVersion','memory-core-export/1','section',section,'sourceRevision',revision,'items',page,'hasMore',more,'nextCursor',case when more then next_id else null end,'sectionComplete',not more);
end $$;
revoke all on function export_private.core_memory_page_v1(jsonb) from public,anon,authenticated,service_role;
create function export_private.memory_commit_progress_v1(j export_private.core_jobs_v1,v jsonb,p_lease uuid,p_gen integer) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare m jsonb;pages bigint;rows bigint;terminals integer;
begin
 if jsonb_typeof(v) is distinct from 'array' then return false;end if;
 select x into m from jsonb_array_elements(v) x where x->>'module'='memory';if m is null then return false;end if;
 select coalesce(sum(p.pages),0),coalesce(sum(p.rows),0),count(*) filter(where terminal) into pages,rows,terminals from export_private.memory_section_progress_v1 p where p.request_id=j.request_id and p.generation=p_gen and p.lease_id=p_lease and p.source_revision=j.memory_source_revision;
 if m->'pages' is distinct from to_jsonb(pages) or m->'rows' is distinct from to_jsonb(rows) then return false;end if;
 if pages=0 then return j.memory_source_revision is null and m->>'status' in ('unavailable','failed','partial') and m->>'reason' in ('HANDLER_MISSING','SOURCE_UNAVAILABLE','BOUNDED_LIMIT');end if;
 if j.memory_source_revision is null or export_private.memory_source_current_v1(j) is distinct from true then return false;end if;
 if m->>'status'='complete' or m->>'reason'='LIVE_TRAVERSAL' then return terminals=6;end if;
 return m->>'status'='partial' and m->>'reason' in ('SOURCE_UNAVAILABLE','BOUNDED_LIMIT');
end $$;
revoke all on function export_private.memory_commit_progress_v1(export_private.core_jobs_v1,jsonb,uuid,integer) from public,anon,authenticated,service_role;
-- Narrow current-source hook after original policy/account/request/job locks. Original body preserved.
do $$declare definition text;needle text;begin
 definition:=pg_get_functiondef('export_private.lock_job_v1(uuid,boolean)'::regprocedure);
 needle:=E'select * into j from export_private.core_jobs_v1 where request_id=p_request for update nowait;\n return j;';
 if position(needle in definition)=0 or position('memory_source_current_v1' in definition)>0 then raise exception 'D4_LOCK_JOB_DEPENDENCY_CHANGED';end if;
 execute replace(definition,needle,E'select * into j from export_private.core_jobs_v1 where request_id=p_request for update nowait;\n if export_private.memory_source_current_v1(j) is distinct from true then return null;end if;\n return j;');
end $$;
-- Sole existing domain entry, same signature/ACL, no client counter authority.
do $$declare definition text;needle text;begin
 definition:=pg_get_functiondef('public.privacy_core_export_v1(text,jsonb)'::regprocedure);
 needle:=E'begin\n keys:=case p_action';
 if position(needle in definition)=0 or position('core_memory_page_v1' in definition)>0 or position('artifact:=p_input->''artifact'';' in definition)=0 then raise exception 'D4_EXPORT_ENTRY_DEPENDENCY_CHANGED';end if;
 definition:=replace(definition,needle,E'begin\n if p_action=''memory_page'' then return export_private.core_memory_page_v1(p_input);end if;\n keys:=case p_action');
 definition:=replace(definition,'artifact:=p_input->''artifact'';',E'if export_private.memory_commit_progress_v1(j,p_input->''modules'',lease,gen) is distinct from true then raise exception ''INVALID_OUTPUT'';end if;\n  artifact:=p_input->''artifact'';');
 execute definition;
end $$;
notify pgrst,'reload schema';
