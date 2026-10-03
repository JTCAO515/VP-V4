-- #228 D2 only. No role/GRANT/target activation, no215 metadata rights.
create schema if not exists export_private;
revoke all on schema export_private from public,anon,authenticated,service_role;
create table export_private.core_policies_v1 (
 id uuid primary key,revision integer not null check(revision>0),enabled boolean not null default false,revoked_at timestamptz,
 environment text not null check(environment in ('local','staging','production')),
 key_id text not null check(octet_length(key_id) between 1 and 128 and key_id !~ '[^!-~]'),
 max_run_ms integer not null check(max_run_ms between 1 and 90000),artifact_ttl_ms integer not null check(artifact_ttl_ms between 1 and 86400000),
 ticket_ttl_ms integer not null check(ticket_ttl_ms between 1 and 300000),max_pages integer not null check(max_pages between 1 and 1000),
 page_size integer not null check(page_size between 1 and 100),max_bytes integer not null check(max_bytes between 1 and 8388608),valid_until timestamptz not null
);
create unique index single_core_export_policy on export_private.core_policies_v1(enabled) where enabled;
create table export_private.core_jobs_v1 (
 request_id uuid primary key references public.privacy_requests(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,session_id uuid not null,session_epoch bigint not null,
 scope text not null default 'core-export-d2/1' check(scope='core-export-d2/1'),
 policy_id uuid not null references export_private.core_policies_v1(id),policy_snapshot jsonb not null,
 state text not null check(state in ('queued','running','ready_partial','ready_complete','failed','expired')),
 generation integer not null default 1 check(generation between 1 and 3),
 lease_id uuid,lease_expires_at timestamptz,claim_operation uuid,claim_digest text,
 committed_lease uuid,completed_at timestamptz,modules jsonb not null default '[]',
 artifact_digest text,artifact_bytes integer,artifact_expires_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null
);
create table export_private.core_artifacts_v1 (
 request_id uuid primary key references export_private.core_jobs_v1(request_id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,generation integer not null,lease_id uuid not null,
 key_id text not null,nonce bytea not null check(octet_length(nonce)=12),tag bytea not null check(octet_length(tag)=16),
 ciphertext bytea not null check(octet_length(ciphertext) between 1 and 8388608),
 plaintext_digest text not null check(plaintext_digest ~ '^[a-f0-9]{64}$'),plaintext_bytes integer not null check(plaintext_bytes between 1 and 8388608),
 ciphertext_digest text not null,aad text not null,expires_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),
 unique(key_id,nonce),check(octet_length(ciphertext)=plaintext_bytes)
);
create table export_private.core_tickets_v1 (
 operation_id uuid primary key,request_id uuid not null references export_private.core_artifacts_v1(request_id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,session_id uuid not null,session_epoch bigint not null,
 generation integer not null,artifact_digest text not null,token_hash text not null check(token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),consumed_at timestamptz,revoked_at timestamptz,
 unique(token_hash)
);
create index core_export_owner_request on export_private.core_jobs_v1(owner_id,request_id);
create index core_export_ticket_expiry on export_private.core_tickets_v1(expires_at);
do $$ declare name text;begin foreach name in array array['core_policies_v1','core_jobs_v1','core_artifacts_v1','core_tickets_v1'] loop execute format('alter table export_private.%I enable row level security',name);execute format('revoke all on export_private.%I from public,anon,authenticated,service_role',name);end loop;end $$;

create function export_private.ms_v1(v timestamptz) returns text language sql immutable set search_path='' as $$select to_char(v at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')$$;
create function export_private.unb64_v1(v text,max_bytes integer) returns bytea language plpgsql immutable set search_path='' as $$
declare b bytea;
begin
 if v is null or v !~ '^[A-Za-z0-9_-]+$' or length(v)>((max_bytes+2)/3)*4 then return null;end if;
 b:=decode(translate(v,'-_','+/')||repeat('=',(4-length(v)%4)%4),'base64');
 if octet_length(b)>max_bytes or translate(replace(encode(b,'base64'),E'\n',''),'+/','-_')<>v||repeat('=',(4-length(v)%4)%4) then return null;end if;
 return b;
exception when others then return null;
end $$;
create function export_private.b64_v1(v bytea) returns text language sql immutable set search_path='' as $$select rtrim(translate(replace(encode(v,'base64'),E'\n',''),'+/','-_'),'=')$$;
create function export_private.current_native_v1(fresh boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();s jsonb;
begin
 if u is null or auth.role() is distinct from 'authenticated' then raise exception 'UNAUTHENTICATED';end if;
 perform 1 from auth.users where id=u for key share nowait;if not found then raise exception 'UNAUTHENTICATED';end if;
 perform identity_private.guard_mobile_rpc_v2();s:=public.native_session_v2('session');
 if (s->>'mobileEpoch')::bigint not between 1 and 9007199254740991 then raise exception 'UNAUTHENTICATED';end if;
 perform 1 from auth.sessions where id=(s->>'sessionId')::uuid and user_id=u for key share;
 if not found then raise exception 'UNAUTHENTICATED';end if;
 if fresh and not exists(select 1 from auth.sessions where id=(s->>'sessionId')::uuid and user_id=u and created_at between clock_timestamp()-interval '5 minutes' and clock_timestamp()) then raise exception 'REAUTHENTICATION_REQUIRED';end if;
 return s;
end $$;
create function export_private.job_receipt_v1(j export_private.core_jobs_v1) returns jsonb language plpgsql stable set search_path='' as $$
declare state text:=j.state;ready boolean;
begin
 if j.expires_at<=clock_timestamp() or j.artifact_expires_at<=clock_timestamp() then state:='expired';end if;
 ready:=state in ('ready_partial','ready_complete');
 return jsonb_build_object('kind','privacy_export_job/1','requestId',j.request_id,'scope',j.scope,'state',state,'generation',j.generation,'createdAt',export_private.ms_v1(j.created_at),'completedAt',case when ready or state='failed' then export_private.ms_v1(j.completed_at) else null end,'artifactDigest',case when ready then j.artifact_digest else null end,'artifactBytes',case when ready then j.artifact_bytes else null end,'artifactExpiresAt',case when ready then export_private.ms_v1(j.artifact_expires_at) else null end,'modules',case when ready then j.modules else '[]'::jsonb end,'allUserDataCompleted',false);
end $$;
create function export_private.lock_job_v1(p_request uuid,worker boolean) returns export_private.core_jobs_v1 language plpgsql security definer set search_path='' as $$
declare j export_private.core_jobs_v1;p export_private.core_policies_v1%rowtype;
begin
 select * into j from export_private.core_jobs_v1 where request_id=p_request;if not found then return null;end if;
 select * into p from export_private.core_policies_v1 where id=j.policy_id for share nowait;
 if not found or not p.enabled or p.revoked_at is not null or p.valid_until<=clock_timestamp() or to_jsonb(p) is distinct from j.policy_snapshot then return null;end if;
 perform 1 from auth.users where id=j.owner_id for key share nowait;if not found then return null;end if;
 perform 1 from identity_private.mobile_accounts where owner_id=j.owner_id for update;if not found then return null;end if;
 if worker then
  if not exists(select 1 from identity_private.mobile_accounts where owner_id=j.owner_id and session_id=j.session_id and epoch=j.session_epoch) then return null;end if;
  perform 1 from auth.sessions where id=j.session_id and user_id=j.owner_id for key share;if not found then return null;end if;
 end if;
 perform 1 from public.privacy_requests where id=p_request and owner_id=j.owner_id and action='export' and scope_version='all-user-data-v1' and status='requested' and execution_state='not_started' for share nowait;if not found then return null;end if;
 select * into j from export_private.core_jobs_v1 where request_id=p_request for update nowait;
 return j;
exception when lock_not_available then return null;
end $$;
create function export_private.live_lease_v1(j export_private.core_jobs_v1,l uuid,g integer) returns boolean language sql stable set search_path='' as $$
 select coalesce(j.state='running' and j.lease_id=l and j.generation=g and j.lease_expires_at>clock_timestamp() and j.expires_at>clock_timestamp(),false);
$$;
alter table export_private.core_jobs_v1 add column commit_digest text;
create function export_private.artifact_wire_v1(a export_private.core_artifacts_v1) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('schemaVersion','privacy-export-artifact/1','keyId',a.key_id,'nonce',export_private.b64_v1(a.nonce),'tag',export_private.b64_v1(a.tag),'ciphertext',export_private.b64_v1(a.ciphertext),'plaintextDigest',a.plaintext_digest,'plaintextBytes',a.plaintext_bytes,'expiresAt',export_private.ms_v1(a.expires_at));
$$;
create function export_private.valid_modules_v1(v jsonb,max_pages integer) returns boolean language plpgsql immutable set search_path='' as $$
declare names text[]:=array['trip','conversations','results','profile','memory','turn','user_artifact','brief','entitlements'];m jsonb;n integer:=0;pages integer:=0;
begin
 if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)<>9 then return false;end if;
 for m in select value from jsonb_array_elements(v) loop
  n:=n+1;
  if jsonb_typeof(m) is distinct from 'object' or m-array['module','status','reason','pages','rows','digest']<>'{}' or (select count(*) from jsonb_object_keys(m))<>6
  or m->>'module' is distinct from names[n] or coalesce(m->>'status','') not in ('complete','partial','unavailable','failed') or coalesce(m->>'reason','') not in ('NONE','HANDLER_MISSING','BOUNDED_LIMIT','LIVE_TRAVERSAL','SOURCE_UNAVAILABLE')
  or jsonb_typeof(m->'pages') is distinct from 'number' or m->>'pages' !~ '^(0|[1-9][0-9]{0,3})$' or jsonb_typeof(m->'rows') is distinct from 'number' or m->>'rows' !~ '^(0|[1-9][0-9]{0,5})$'
  or (m->>'rows')::integer>100000 or (m->>'rows')::integer>(m->>'pages')::integer*100 then return false;end if;
  pages:=pages+(m->>'pages')::integer;
  if m->>'status'='unavailable' then
   if m->>'reason'<>'HANDLER_MISSING' or m->'digest' is distinct from 'null'::jsonb or (m->>'pages')::integer<>0 or (m->>'rows')::integer<>0 then return false;end if;
  else
   if jsonb_typeof(m->'digest') is distinct from 'string' or m->>'digest' !~ '^[a-f0-9]{64}$' then return false;end if;
   if m->>'status'='complete' and (m->>'reason'<>'NONE' or (m->>'pages')::integer<1) or m->>'status'='partial' and m->>'reason' not in ('BOUNDED_LIMIT','LIVE_TRAVERSAL') or m->>'status'='failed' and m->>'reason'<>'SOURCE_UNAVAILABLE' then return false;end if;
  end if;
 end loop;
 return pages<=max_pages;
end $$;

create function export_private.trip_content_v1(v jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare d jsonb;i jsonb;days jsonb:='[]';items jsonb;
begin
 if jsonb_typeof(v->'days') is distinct from 'array' then raise exception 'SOURCE_UNAVAILABLE';end if;
 for d in select value from jsonb_array_elements(v->'days') loop
  if jsonb_typeof(d) is distinct from 'object' or jsonb_typeof(d->'id') is distinct from 'string' or jsonb_typeof(d->'date') is distinct from 'string' or jsonb_typeof(d->'items') is distinct from 'array' then raise exception 'SOURCE_UNAVAILABLE';end if;
  items:='[]';for i in select value from jsonb_array_elements(d->'items') loop
   if jsonb_typeof(i) is distinct from 'object' or jsonb_typeof(i->'id') is distinct from 'string' or jsonb_typeof(i->'title') is distinct from 'string' then raise exception 'SOURCE_UNAVAILABLE';end if;
   items:=items||jsonb_build_array(jsonb_build_object('id',i->'id','dayId',d->'id','title',i->'title')||case when i ? 'startsAt' then jsonb_build_object('startsAt',i->'startsAt') else '{}'::jsonb end||case when i ? 'endsAt' then jsonb_build_object('endsAt',i->'endsAt') else '{}'::jsonb end);
  end loop;
  days:=days||jsonb_build_array(jsonb_build_object('id',d->'id','date',d->'date','items',items)||case when d ? 'timeZone' then jsonb_build_object('timeZone',d->'timeZone') else '{}'::jsonb end);
 end loop;return jsonb_build_object('days',days);
end $$;

create function public.privacy_core_export_v1(p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare keys text[];role text:=auth.role();req uuid;op uuid;lease uuid;gen integer;actor jsonb;u uuid;
 policy export_private.core_policies_v1%rowtype;j export_private.core_jobs_v1%rowtype;ticket export_private.core_tickets_v1%rowtype;a export_private.core_artifacts_v1%rowtype;
 artifact jsonb;nonce bytea;tag bytea;cipher bytea;digest text;expires timestamptz;run_ms integer;ttl integer;limit_n integer;cursor uuid;page jsonb;more boolean;next_id uuid;all_complete boolean;
 removed integer:=0;removed_tickets integer:=0;c record;old_intent public.privacy_requests%rowtype;
begin
 keys:=case p_action
 when 'request' then array['requestId','confirmed'] when 'read' then array['requestId']
 when 'claim' then array['requestId','operationId','maxRunMs','expectedEnvironment','expectedKeyId']
 when 'validate' then array['requestId','leaseId','generation'] when 'trip_page' then array['requestId','leaseId','generation','afterTripId','limit']
 when 'commit' then array['requestId','leaseId','generation','artifact','modules','coverage']
 when 'execution_receipt' then array['requestId','leaseId','generation','expectedArtifactDigest']
 when 'fail' then array['requestId','leaseId','generation','reason']
 when 'ticket' then array['requestId','operationId','tokenHash','ticketTtlMs']
 when 'download_prepare' then array['requestId','operationId','tokenHash']
 when 'download_consume' then array['requestId','operationId','tokenHash','artifactDigest','generation']
 when 'purge' then array['operationId','limit'] else null end;
 if keys is null or jsonb_typeof(p_input) is distinct from 'object' or not(p_input ?& keys) or exists(select 1 from jsonb_object_keys(p_input) k where not(k=any(keys))) then raise exception 'INVALID_INPUT';end if;
 if p_action in ('request','read','ticket','download_prepare','download_consume') then
  if role is distinct from 'authenticated' then raise exception 'FORBIDDEN';end if;
 else if role is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;end if;
 if p_input ? 'requestId' then
  if jsonb_typeof(p_input->'requestId') is distinct from 'string' or p_input->>'requestId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'INVALID_INPUT';end if;req:=(p_input->>'requestId')::uuid;
 end if;
 if p_input ? 'operationId' then
  if jsonb_typeof(p_input->'operationId') is distinct from 'string' or p_input->>'operationId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'INVALID_INPUT';end if;op:=(p_input->>'operationId')::uuid;
 end if;
 if p_input ? 'leaseId' then
  if jsonb_typeof(p_input->'leaseId') is distinct from 'string' or p_input->>'leaseId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'INVALID_INPUT';end if;lease:=(p_input->>'leaseId')::uuid;
 end if;
 if p_input ? 'generation' then
  if jsonb_typeof(p_input->'generation') is distinct from 'number' or p_input->>'generation' !~ '^[1-3]$' then raise exception 'INVALID_INPUT';end if;gen:=(p_input->>'generation')::integer;
 end if;
 if p_input ? 'tokenHash' and (jsonb_typeof(p_input->'tokenHash') is distinct from 'string' or p_input->>'tokenHash' !~ '^[a-f0-9]{64}$') then raise exception 'INVALID_INPUT';end if;
 if p_action='request' then
  if p_input->'confirmed' is distinct from 'true'::jsonb then raise exception 'INVALID_INPUT';end if;
  select * into policy from export_private.core_policies_v1 where enabled for share nowait;
  if not found or policy.revoked_at is not null or policy.valid_until<=clock_timestamp() then raise exception 'EXPORT_POLICY_UNCONFIGURED';end if;
  actor:=export_private.current_native_v1(true);u:=(actor->>'subject')::uuid;
  select * into old_intent from public.privacy_requests where id=req for update;
  if found and (old_intent.owner_id<>u or old_intent.action<>'export' or old_intent.scope_version<>'all-user-data-v1' or old_intent.status<>'requested' or old_intent.execution_state<>'not_started') then raise exception 'EXPORT_CONFLICT';end if;
  perform public.request_privacy_action(req,'export');
  select * into j from export_private.core_jobs_v1 where request_id=req for update;
  if found then if j.owner_id<>u or j.scope<>'core-export-d2/1' then raise exception 'EXPORT_CONFLICT';end if;return export_private.job_receipt_v1(j);end if;
  insert into export_private.core_jobs_v1(request_id,owner_id,session_id,session_epoch,policy_id,policy_snapshot,state,expires_at)
  values(req,u,(actor->>'sessionId')::uuid,(actor->>'mobileEpoch')::bigint,policy.id,to_jsonb(policy),'queued',least(policy.valid_until,clock_timestamp()+2*policy.artifact_ttl_ms*interval '1 millisecond')) returning * into j;
  return export_private.job_receipt_v1(j);
 end if;
 if p_action='purge' then
  if jsonb_typeof(p_input->'limit') is distinct from 'number' or p_input->>'limit' !~ '^[1-9][0-9]{0,2}$' or (p_input->>'limit')::integer>100 then raise exception 'INVALID_INPUT';end if;limit_n:=(p_input->>'limit')::integer;
  for c in select request_id,owner_id from export_private.core_jobs_v1 where expires_at<=clock_timestamp() or artifact_expires_at<=clock_timestamp() order by request_id limit limit_n loop
   begin
    perform 1 from auth.users where id=c.owner_id for key share nowait;
    perform 1 from identity_private.mobile_accounts where owner_id=c.owner_id for update nowait;
    select * into j from export_private.core_jobs_v1 where request_id=c.request_id for update nowait;
    delete from export_private.core_tickets_v1 where request_id=j.request_id;get diagnostics ttl=row_count;removed_tickets:=removed_tickets+ttl;
    delete from export_private.core_artifacts_v1 where request_id=j.request_id;get diagnostics ttl=row_count;removed:=removed+ttl;
    update export_private.core_jobs_v1 set state='expired',lease_id=null,lease_expires_at=null,artifact_digest=null,artifact_bytes=null,artifact_expires_at=null,modules='[]' where request_id=j.request_id;
   exception when lock_not_available then null;end;
  end loop;
  delete from export_private.core_tickets_v1 where operation_id in (select operation_id from export_private.core_tickets_v1 where expires_at<=clock_timestamp() order by operation_id limit limit_n);get diagnostics ttl=row_count;
  return jsonb_build_object('kind','privacy_export_purge/1','removedArtifacts',removed,'removedTickets',removed_tickets+ttl);
 end if;
 -- Pin job policy before native/current actor locks. Metadata lookup is not authority.
 select p.* into policy from export_private.core_policies_v1 p join export_private.core_jobs_v1 q on q.policy_id=p.id where q.request_id=req for share of p nowait;
 if not found then if p_action='execution_receipt' then return jsonb_build_object('kind','privacy_export_execution_receipt/1','outcome','unknown','receipt',null);else raise exception 'FORBIDDEN';end if;end if;
 if p_action in ('read','ticket','download_prepare','download_consume') then
  actor:=export_private.current_native_v1(p_action='ticket');u:=(actor->>'subject')::uuid;
 end if;
 if u is not null and not exists(select 1 from export_private.core_jobs_v1 where request_id=req and owner_id=u) then raise exception 'FORBIDDEN';end if;
 j:=export_private.lock_job_v1(req,p_action not in ('read','ticket','download_prepare','download_consume'));
 if j.request_id is null then
  if p_action='execution_receipt' then return jsonb_build_object('kind','privacy_export_execution_receipt/1','outcome','unknown','receipt',null);end if;
  if p_action='validate' then return jsonb_build_object('kind','privacy_export_lease_state/1','current',false);end if;
  return jsonb_build_object('kind','unavailable');
 end if;
 if u is not null and j.owner_id<>u then raise exception 'FORBIDDEN';end if;
 if p_action='read' then return export_private.job_receipt_v1(j);end if;
 if p_action='execution_receipt' then
  if jsonb_typeof(p_input->'expectedArtifactDigest') is distinct from 'string' or p_input->>'expectedArtifactDigest' !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT';end if;
  if j.committed_lease=lease and j.generation=gen and j.state in ('ready_partial','ready_complete') and j.artifact_digest=p_input->>'expectedArtifactDigest' and j.artifact_expires_at>clock_timestamp() then return jsonb_build_object('kind','privacy_export_execution_receipt/1','outcome','terminal','receipt',export_private.job_receipt_v1(j));end if;
  if j.committed_lease=lease and j.generation=gen and j.state='failed' then return jsonb_build_object('kind','privacy_export_execution_receipt/1','outcome','terminal','receipt',export_private.job_receipt_v1(j));end if;
  return jsonb_build_object('kind','privacy_export_execution_receipt/1','outcome','unknown','receipt',null);
 end if;
 if p_action='claim' then
  if jsonb_typeof(p_input->'maxRunMs') is distinct from 'number' or p_input->>'maxRunMs' !~ '^[1-9][0-9]{0,4}$' or (p_input->>'maxRunMs')::integer>policy.max_run_ms or (p_input->>'maxRunMs')::integer>90000
  or jsonb_typeof(p_input->'expectedEnvironment') is distinct from 'string' or jsonb_typeof(p_input->'expectedKeyId') is distinct from 'string' or p_input->>'expectedEnvironment' is distinct from policy.environment or p_input->>'expectedKeyId' is distinct from policy.key_id then raise exception 'INVALID_INPUT';end if;run_ms:=(p_input->>'maxRunMs')::integer;
  digest:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
  if j.claim_operation=op then
   if j.claim_digest<>digest then raise exception 'EXPORT_CONFLICT';end if;
   if j.state='running' and j.lease_expires_at>clock_timestamp() then return jsonb_build_object('kind','privacy_export_lease/1','requestId',req,'ownerId',j.owner_id,'leaseId',j.lease_id,'generation',j.generation,'expiresAt',export_private.ms_v1(j.lease_expires_at),'reused',true);end if;
   return jsonb_build_object('kind','unavailable');
  end if;
  if j.expires_at<=clock_timestamp() or j.state not in ('queued','running') or j.state='running' and (j.lease_expires_at>clock_timestamp() or j.generation>=3) then return jsonb_build_object('kind','unavailable');end if;
  update export_private.core_jobs_v1 set generation=case when state='running' then generation+1 else generation end,state='running',claim_operation=op,claim_digest=digest,lease_id=gen_random_uuid(),lease_expires_at=least(clock_timestamp()+run_ms*interval '1 millisecond',expires_at,policy.valid_until) where request_id=req returning * into j;
  return jsonb_build_object('kind','privacy_export_lease/1','requestId',req,'ownerId',j.owner_id,'leaseId',j.lease_id,'generation',j.generation,'expiresAt',export_private.ms_v1(j.lease_expires_at),'reused',false);
 end if;
 if p_action='validate' then return jsonb_build_object('kind','privacy_export_lease_state/1','current',export_private.live_lease_v1(j,lease,gen));end if;
 if p_action='trip_page' then
  if not export_private.live_lease_v1(j,lease,gen) then return jsonb_build_object('kind','unavailable');end if;
  if jsonb_typeof(p_input->'limit') is distinct from 'number' or p_input->>'limit' !~ '^[1-9][0-9]{0,2}$' or (p_input->>'limit')::integer>policy.page_size then raise exception 'INVALID_INPUT';end if;limit_n:=(p_input->>'limit')::integer;
  if p_input->'afterTripId'='null'::jsonb then cursor:=null;
  elsif jsonb_typeof(p_input->'afterTripId')='string' and p_input->>'afterTripId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then cursor:=(p_input->>'afterTripId')::uuid;
  else raise exception 'INVALID_INPUT';end if;
  if cursor is not null and not exists(select 1 from public.trips where id=cursor and owner_id=j.owner_id and not exists(select 1 from privacy_private.trip_deletions where trip_id=cursor)) then raise exception 'INVALID_EXPORT_CURSOR';end if;
  if exists(select 1 from public.trips t left join public.trip_version_snapshots s on s.trip_id=t.id and s.version=t.head_version and s.owner_id=t.owner_id where t.owner_id=j.owner_id and (cursor is null or t.id>cursor) and not exists(select 1 from privacy_private.trip_deletions where trip_id=t.id) and (s.trip_id is null or s.title<>t.title) order by t.id limit limit_n+1) then raise exception 'SOURCE_UNAVAILABLE';end if;
  with candidates as (
   select t.id,jsonb_build_object('tripId',t.id,'title',t.title,'headVersion',t.head_version,'confirmationState',case when t.head_version=0 then 'initial' when exists(select 1 from public.trip_events e join public.trip_proposals p on p.id=e.proposal_id and p.owner_id=e.owner_id join public.trip_idempotency r on r.proposal_id=p.id and r.owner_id=p.owner_id and r.resulting_version=e.resulting_version where e.trip_id=t.id and e.owner_id=t.owner_id and e.resulting_version=t.head_version and p.status='applied' and p.base_trip_version+1=t.head_version) then 'confirmed' else 'unknown' end,'content',export_private.trip_content_v1(s.content)) as item
   from public.trips t join public.trip_version_snapshots s on s.trip_id=t.id and s.version=t.head_version and s.owner_id=t.owner_id where t.owner_id=j.owner_id and (cursor is null or t.id>cursor) and not exists(select 1 from privacy_private.trip_deletions where trip_id=t.id) order by t.id limit limit_n+1
  ),delivered as(select * from candidates order by id limit limit_n)
  select coalesce((select jsonb_agg(item order by id) from delivered),'[]'),(select count(*)>limit_n from candidates),(select id from delivered order by id desc limit 1) into page,more,next_id;
  return jsonb_build_object('schemaVersion','trip-core-export/1','section','trips','items',page,'hasMore',more,'nextCursor',case when more then next_id else null end,'sectionComplete',not more);
 end if;
 if p_action='commit' then
  artifact:=p_input->'artifact';
  if jsonb_typeof(artifact) is distinct from 'object' or artifact-array['schemaVersion','keyId','nonce','tag','ciphertext','plaintextDigest','plaintextBytes','expiresAt']<>'{}' or (select count(*) from jsonb_object_keys(artifact))<>8
  or jsonb_typeof(artifact->'keyId') is distinct from 'string' or artifact->>'schemaVersion' is distinct from 'privacy-export-artifact/1' or artifact->>'keyId' is distinct from policy.key_id or jsonb_typeof(artifact->'plaintextDigest') is distinct from 'string' or artifact->>'plaintextDigest' !~ '^[a-f0-9]{64}$'
  or jsonb_typeof(artifact->'plaintextBytes') is distinct from 'number' or artifact->>'plaintextBytes' !~ '^[1-9][0-9]{0,6}$' or (artifact->>'plaintextBytes')::integer>policy.max_bytes
  or turn_private.planning_v2_valid_ms_v1(artifact->'expiresAt') is distinct from true then raise exception 'INVALID_OUTPUT';end if;
  nonce:=export_private.unb64_v1(artifact->>'nonce',12);tag:=export_private.unb64_v1(artifact->>'tag',16);cipher:=export_private.unb64_v1(artifact->>'ciphertext',policy.max_bytes);
  if nonce is null or tag is null or cipher is null or octet_length(nonce)<>12 or octet_length(tag)<>16 or octet_length(cipher)<>(artifact->>'plaintextBytes')::integer then raise exception 'INVALID_OUTPUT';end if;
  if export_private.valid_modules_v1(p_input->'modules',policy.max_pages) is distinct from true then raise exception 'INVALID_OUTPUT';end if;
  select bool_and(m->>'status'='complete') into all_complete from jsonb_array_elements(p_input->'modules') m;
  if p_input->>'coverage' is distinct from (case when all_complete then 'complete' else 'partial' end) then raise exception 'INVALID_OUTPUT';end if;
  digest:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
  if j.state in ('ready_partial','ready_complete') then
   if j.committed_lease=lease and j.generation=gen and j.commit_digest=digest and j.artifact_expires_at>clock_timestamp() then return export_private.job_receipt_v1(j);end if;raise exception 'EXPORT_CONFLICT';
  end if;
  if not export_private.live_lease_v1(j,lease,gen) then return jsonb_build_object('kind','unavailable');end if;
  expires:=(artifact->>'expiresAt')::timestamptz;
  if expires<=clock_timestamp() or expires>clock_timestamp()+interval '24 hours' then raise exception 'INVALID_OUTPUT';end if;
  expires:=least(expires,clock_timestamp()+policy.artifact_ttl_ms*interval '1 millisecond',j.expires_at);
  if expires<=clock_timestamp() then return jsonb_build_object('kind','unavailable');end if;
  insert into export_private.core_artifacts_v1(request_id,owner_id,generation,lease_id,key_id,nonce,tag,ciphertext,plaintext_digest,plaintext_bytes,ciphertext_digest,aad,expires_at)
   values(req,j.owner_id,gen,lease,policy.key_id,nonce,tag,cipher,artifact->>'plaintextDigest',(artifact->>'plaintextBytes')::integer,encode(sha256(cipher),'hex'),'["privacy-core-export/1",'||turn_private.planning_v2_json_string_v1(req::text)||','||turn_private.planning_v2_json_string_v1(j.owner_id::text)||','||gen::text||']',expires);
  update export_private.core_jobs_v1 set state=case when all_complete then 'ready_complete' else 'ready_partial' end,modules=p_input->'modules',completed_at=clock_timestamp(),artifact_digest=artifact->>'plaintextDigest',artifact_bytes=(artifact->>'plaintextBytes')::integer,artifact_expires_at=expires,committed_lease=lease,commit_digest=digest,lease_id=null,lease_expires_at=null where request_id=req returning * into j;
  return export_private.job_receipt_v1(j);
 end if;
 if p_action='fail' then
  if p_input->>'reason' not in ('SOURCE_UNAVAILABLE','INVALID_OUTPUT') or p_input->>'reason' is null then raise exception 'INVALID_INPUT';end if;
  if not export_private.live_lease_v1(j,lease,gen) then return jsonb_build_object('kind','unavailable');end if;
  update export_private.core_jobs_v1 set state='failed',committed_lease=lease,completed_at=clock_timestamp(),lease_id=null,lease_expires_at=null where request_id=req returning * into j;return export_private.job_receipt_v1(j);
 end if;
 -- Owner-only protected download: no token/body in URLs or stored rows.
 select * into a from export_private.core_artifacts_v1 where request_id=req and owner_id=u for share;
 if not found or j.state not in ('ready_partial','ready_complete') or a.expires_at<=clock_timestamp() or j.expires_at<=clock_timestamp() or a.generation<>j.generation or a.plaintext_digest<>j.artifact_digest then return jsonb_build_object('kind','unavailable');end if;
 if p_action='ticket' then
  if jsonb_typeof(p_input->'ticketTtlMs') is distinct from 'number' or p_input->>'ticketTtlMs' !~ '^[1-9][0-9]{0,5}$' or (p_input->>'ticketTtlMs')::integer>policy.ticket_ttl_ms or (p_input->>'ticketTtlMs')::integer>300000 then raise exception 'INVALID_INPUT';end if;ttl:=(p_input->>'ticketTtlMs')::integer;
  select * into ticket from export_private.core_tickets_v1 where operation_id=op for update;
  if found then
   if ticket.request_id<>req or ticket.owner_id<>u or ticket.token_hash<>p_input->>'tokenHash' then raise exception 'EXPORT_CONFLICT';end if;
   if ticket.session_id<>(actor->>'sessionId')::uuid or ticket.session_epoch<>(actor->>'mobileEpoch')::bigint or ticket.generation<>a.generation or ticket.artifact_digest<>a.plaintext_digest or ticket.revoked_at is not null or ticket.consumed_at is not null or ticket.expires_at<=clock_timestamp() then return jsonb_build_object('kind','unavailable');end if;
  else
   update export_private.core_tickets_v1 set revoked_at=clock_timestamp() where request_id=req and owner_id=u and consumed_at is null and revoked_at is null;
   insert into export_private.core_tickets_v1(operation_id,request_id,owner_id,session_id,session_epoch,generation,artifact_digest,token_hash,expires_at)
    values(op,req,u,(actor->>'sessionId')::uuid,(actor->>'mobileEpoch')::bigint,a.generation,a.plaintext_digest,p_input->>'tokenHash',least(clock_timestamp()+ttl*interval '1 millisecond',a.expires_at,j.expires_at)) returning * into ticket;
  end if;
  return jsonb_build_object('kind','privacy_export_ticket/1','requestId',req,'operationId',op,'generation',ticket.generation,'artifactDigest',ticket.artifact_digest,'expiresAt',export_private.ms_v1(ticket.expires_at));
 end if;
 select * into ticket from export_private.core_tickets_v1 where operation_id=op and request_id=req and owner_id=u for update;
 if not found or ticket.token_hash<>p_input->>'tokenHash' or ticket.session_id<>(actor->>'sessionId')::uuid or ticket.session_epoch<>(actor->>'mobileEpoch')::bigint or ticket.generation<>a.generation or ticket.artifact_digest<>a.plaintext_digest or ticket.revoked_at is not null or ticket.consumed_at is not null or ticket.expires_at<=clock_timestamp() then return jsonb_build_object('kind','unavailable');end if;
 if p_action='download_prepare' then return jsonb_build_object('kind','privacy_export_download/1','requestId',req,'operationId',op,'generation',a.generation,'ownerId',u,'artifactDigest',a.plaintext_digest,'artifact',export_private.artifact_wire_v1(a),'ticketExpiresAt',export_private.ms_v1(ticket.expires_at));end if;
 if p_action='download_consume' then
  if jsonb_typeof(p_input->'artifactDigest') is distinct from 'string' or p_input->>'artifactDigest' is distinct from a.plaintext_digest or gen is distinct from a.generation then return jsonb_build_object('kind','unavailable');end if;
  update export_private.core_tickets_v1 set consumed_at=clock_timestamp() where operation_id=op;
  return jsonb_build_object('kind','privacy_export_download_consumed/1','requestId',req,'operationId',op,'generation',a.generation,'artifactDigest',a.plaintext_digest);
 end if;
 raise exception 'INVALID_INPUT';
end $$;
revoke all on function public.privacy_core_export_v1(text,jsonb) from public,anon,authenticated,service_role;
do $$ declare f regprocedure;begin for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='export_private' loop execute 'revoke all on function '||f||' from public,anon,authenticated,service_role';end loop;end $$;
notify pgrst,'reload schema';

create function export_private.protect_policy_v1() returns trigger language plpgsql set search_path='' as $$
begin
 if old.revoked_at is not null and (new.enabled or new.revoked_at is distinct from old.revoked_at) then raise exception 'EXPORT_POLICY_REVOKED';end if;
 if old.enabled and not new.enabled then new.revoked_at:=coalesce(new.revoked_at,clock_timestamp());end if;
 return new;
end $$;
create trigger protect_core_export_policy before update on export_private.core_policies_v1 for each row execute function export_private.protect_policy_v1();
create function export_private.immutable_artifact_v1() returns trigger language plpgsql set search_path='' as $$begin raise exception 'IMMUTABLE_EXPORT_ARTIFACT';end $$;
create trigger immutable_core_export_artifact before update on export_private.core_artifacts_v1 for each row execute function export_private.immutable_artifact_v1();
revoke all on function export_private.protect_policy_v1(),export_private.immutable_artifact_v1() from public,anon,authenticated,service_role;
