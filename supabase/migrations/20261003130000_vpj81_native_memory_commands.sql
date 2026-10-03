-- #562: ordinary mobile owner commands, existing Memory authority, no target enablement.
create table memory_private.native_command_receipts_v1 (
 owner_id uuid not null references auth.users(id) on delete cascade,
 operation_id uuid not null,
 input_digest text not null check (input_digest ~ '^[0-9a-f]{64}$'),
 memory_id uuid references public.memory_profiles(id) on delete cascade,
 consent_id uuid not null references public.memory_consents(id) on delete cascade,
 receipt jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,operation_id), unique(operation_id)
);
create table memory_private.native_update_preimages_v1 (
 owner_id uuid not null references auth.users(id) on delete cascade,
 operation_id uuid primary key references memory_private.native_command_receipts_v1(operation_id) on delete cascade,
 memory_id uuid not null references public.memory_profiles(id) on delete cascade,
 consent_id uuid not null references public.memory_consents(id) on delete cascade,
 prior_summary text not null check(char_length(prior_summary) between 1 and 500),
 resulting_revision bigint not null,
 expires_at timestamptz not null
);
create table memory_private.native_command_heads_v1 (
 memory_id uuid primary key references public.memory_profiles(id) on delete cascade,
 operation_id uuid not null references memory_private.native_command_receipts_v1(operation_id) on delete cascade
);
revoke all on memory_private.native_command_heads_v1 from public,anon,authenticated,service_role;
revoke all on memory_private.native_command_receipts_v1,memory_private.native_update_preimages_v1 from public,anon,authenticated,service_role;
create function memory_private.immutable_native_receipt_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then raise exception 'MEMORY_OPERATION_REUSE'; end if;
 return new;
end $$;
revoke all on function memory_private.immutable_native_receipt_v1() from public,anon,authenticated,service_role;
create trigger immutable_native_receipt_v1 before update on memory_private.native_command_receipts_v1 for each row execute function memory_private.immutable_native_receipt_v1();

-- Scrub private Undo data also when an old authority performs deletion/revocation.
create function memory_private.scrub_native_preimage_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='memory_profiles' then
   if new.state='deleted' then delete from memory_private.native_update_preimages_v1 where memory_id=new.id; end if;
 elsif tg_table_name='memory_consents' then
   if new.status='revoked' then delete from memory_private.native_update_preimages_v1 where consent_id=new.id; end if;
 end if;
 return new;
end $$;
revoke all on function memory_private.scrub_native_preimage_v1() from public,anon,authenticated,service_role;
create trigger scrub_native_memory_preimage_v1 after update on public.memory_profiles for each row execute function memory_private.scrub_native_preimage_v1();
create trigger scrub_native_consent_preimage_v1 after update on public.memory_consents for each row execute function memory_private.scrub_native_preimage_v1();

create function public.native_memory_command_v1(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); a text; op uuid; mid uuid; source uuid; cid uuid; expected bigint;
 digest text; keys text[]; rec memory_private.native_command_receipts_v1%rowtype;
 profile public.memory_profiles%rowtype; consent public.memory_consents%rowtype;
 pre memory_private.native_update_preimages_v1%rowtype; prior text; r record;
 receipt jsonb; available boolean:=false; state text; v_summary text;
begin
 perform identity_private.guard_mobile_rpc_v2();
 perform public.native_session_v2('session');
 if actor is null then raise exception 'UNAUTHENTICATED'; end if;
 if p_input is null or jsonb_typeof(p_input) is distinct from 'object' then raise exception 'INVALID_INPUT'; end if;
 a:=p_input->>'action';
 keys:=case a
 when 'consentCreate' then array['action','operationId']
 when 'create' then array['action','operationId','memoryId','receiptId','consentId','constraintKind','summary','saveLongTerm']
 when 'createUndo' then array['action','operationId','memoryId','sourceReceiptId','expectedRevision']
 when 'update' then array['action','operationId','memoryId','sourceReceiptId','expectedRevision','summary','saveLongTerm']
 when 'updateUndo' then array['action','operationId','memoryId','sourceReceiptId','expectedRevision','updateOperationId']
 when 'state' then array['action','operationId','memoryId','sourceReceiptId','expectedRevision','state']
 when 'revoke' then array['action','operationId','memoryId','sourceReceiptId','expectedRevision']
 else null end;
 if keys is null or not(p_input ?& keys) or exists(select 1 from jsonb_object_keys(p_input) k where not(k=any(keys)))
 or exists(select 1 from unnest(keys) k where p_input->k='null'::jsonb) then raise exception 'INVALID_INPUT'; end if;
 if jsonb_typeof(p_input->'operationId') is distinct from 'string' or (p_input->>'operationId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'INVALID_INPUT'; end if;
 op:=(p_input->>'operationId')::uuid;
 if a<>'consentCreate' then
   if jsonb_typeof(p_input->'memoryId') is distinct from 'string' or (p_input->>'memoryId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'INVALID_INPUT'; end if;
   mid:=(p_input->>'memoryId')::uuid;
 end if;
 if a in ('create','update') then
   if p_input->'saveLongTerm' is distinct from 'true'::jsonb or jsonb_typeof(p_input->'summary') is distinct from 'string' then raise exception 'INVALID_INPUT'; end if;
   v_summary:=btrim(p_input->>'summary');
   if char_length(v_summary) not between 1 and 500 then raise exception 'INVALID_INPUT'; end if;
 end if;
 if a='create' then
   if jsonb_typeof(p_input->'receiptId') is distinct from 'string' or jsonb_typeof(p_input->'consentId') is distinct from 'string'
   or (p_input->>'receiptId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or (p_input->>'consentId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or coalesce(p_input->>'constraintKind','') not in ('preference','hard_constraint') then raise exception 'INVALID_INPUT'; end if;
   cid:=(p_input->>'consentId')::uuid;source:=(p_input->>'receiptId')::uuid;
 elsif a<>'consentCreate' then
   if jsonb_typeof(p_input->'sourceReceiptId') is distinct from 'string' or (p_input->>'sourceReceiptId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or jsonb_typeof(p_input->'expectedRevision') is distinct from 'number' or (p_input->>'expectedRevision') !~ '^[1-9][0-9]{0,15}$'
   or (p_input->>'expectedRevision')::numeric>9007199254740990 then raise exception 'INVALID_INPUT'; end if;
   source:=(p_input->>'sourceReceiptId')::uuid;expected:=(p_input->>'expectedRevision')::bigint;
   if a='createUndo' and expected<>1 then raise exception 'INVALID_INPUT'; end if;
 end if;
 if a='state' and coalesce(p_input->>'state','') not in ('explicit','confirmed','rejected','paused','deleted') then raise exception 'INVALID_INPUT'; end if;
 if a='updateUndo' and (jsonb_typeof(p_input->'updateOperationId') is distinct from 'string' or (p_input->>'updateOperationId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'INVALID_INPUT'; end if;
 digest:=encode(extensions.digest(convert_to(p_input::text,'UTF8'),'sha256'),'hex');
 -- Serialise each owner's operations; native_session_v2 already locks mobile account.
 perform 1 from auth.users where id=actor for update;
 select * into rec from memory_private.native_command_receipts_v1 where operation_id=op;
 if found then
   if rec.owner_id<>actor then raise exception 'FORBIDDEN'; end if;
   if rec.input_digest<>digest then raise exception 'MEMORY_OPERATION_REUSE'; end if;
   perform public.native_session_v2('session');
   return rec.receipt||jsonb_build_object('reused',true,'undoAvailable',false);
 end if;
 if a='consentCreate' then
   select * into r from public.create_memory_retrieval_consent();cid:=r.consent_id;
 else
   -- Consistent consent-before-profile lock order used by this command family.
   if a<>'create' then
     select consent_id into cid from public.memory_profiles where id=mid and owner_id=actor;
     if not found then raise exception 'FORBIDDEN'; end if;
   end if;
   select * into consent from public.memory_consents where id=cid and owner_id=actor for update;
   if not found then raise exception 'FORBIDDEN'; end if;
   select * into profile from public.memory_profiles where id=mid and owner_id=actor for update;
   if a='create' then
     select * into r from public.create_explicit_memory_profile_v2(mid,source,cid,p_input->>'constraintKind',v_summary);
     available:=r.revision=1;
   else
     if not found or profile.source_receipt_id is distinct from source or profile.consent_id is distinct from cid then raise exception 'MEMORY_CONFLICT'; end if;
     if not exists(select 1 from public.memory_receipts where id=source and memory_id=mid and owner_id=actor) then raise exception 'FORBIDDEN'; end if;
     if profile.revision<>expected then raise exception 'MEMORY_CONFLICT'; end if;
     if a in ('update','updateUndo') then
       if consent.status<>'granted' then raise exception 'CONSENT_REQUIRED'; end if;
       if profile.state not in ('explicit','confirmed') then raise exception 'MEMORY_CONFLICT'; end if;
       prior:=profile.summary;
       if a='updateUndo' then
         select * into pre from memory_private.native_update_preimages_v1 where operation_id=(p_input->>'updateOperationId')::uuid and owner_id=actor and memory_id=mid and consent_id=cid;
         if not found or pre.resulting_revision<>expected then raise exception 'MEMORY_CONFLICT'; end if;
         if pre.expires_at<=clock_timestamp() then raise exception 'MEMORY_UNDO_EXPIRED'; end if;
         if not exists(select 1 from memory_private.native_command_heads_v1 where memory_id=mid and operation_id=pre.operation_id) then raise exception 'MEMORY_CONFLICT'; end if;
         v_summary:=pre.prior_summary;
       end if;
       update public.memory_profiles set summary=v_summary,updated_at=clock_timestamp() where id=mid;
       insert into public.memory_receipts(id,owner_id,memory_id,event_state,source_kind) values(op,actor,mid,profile.state,'user_confirmed');
       available:=a='update';
       if a='updateUndo' then delete from memory_private.native_update_preimages_v1 where operation_id=pre.operation_id; end if;
     elsif a='createUndo' then
       select * into r from public.undo_explicit_memory_create_v1(mid,source,expected,op);
     elsif a='state' then
       select * into r from public.transition_memory_profile(mid,p_input->>'state');
     elsif a='revoke' then
       select * into r from public.revoke_memory_retrieval_consent(cid);
     end if;
   end if;
   select * into profile from public.memory_profiles where id=mid and owner_id=actor;
   state:=profile.state;
 end if;
 receipt:=jsonb_build_object('version',1,'ownerId',actor,'action',a,'operationId',op,'memoryId',mid,'consentId',cid,'sourceReceiptId',source,'revision',case when mid is null then null else profile.revision end,'state',state,'reused',false,'undoAvailable',available);
 insert into memory_private.native_command_receipts_v1(owner_id,operation_id,input_digest,memory_id,consent_id,receipt) values(actor,op,digest,mid,cid,receipt);
 if mid is not null then insert into memory_private.native_command_heads_v1 values(mid,op) on conflict(memory_id) do update set operation_id=excluded.operation_id; end if;
 if a='update' then
   delete from memory_private.native_update_preimages_v1 where memory_id=mid;
   insert into memory_private.native_update_preimages_v1(owner_id,operation_id,memory_id,consent_id,prior_summary,resulting_revision,expires_at) values(actor,op,mid,cid,prior,profile.revision,clock_timestamp()+interval '10 minutes');
 end if;
 perform public.native_session_v2('session');
 return receipt;
end $$;
revoke all on function public.native_memory_command_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.native_memory_command_v1(jsonb) to authenticated;
