create function public.privacy_profile_data_v1(p_action text,p_input_bytes text,p_expected_epoch bigint) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v jsonb;original jsonb;bytes_n text:=p_input_bytes;actor jsonb;u uuid;s uuid;epoch_n bigint;scope_n text;id uuid;r profile_data_private.operations_v1;
 inv jsonb;items jsonb;result_n jsonb;source_n text;preview_n text;request_n text;now_n bigint;cursor_id text;has_more boolean;count_n integer;cleared integer:=0;
 p public.user_profiles;e public.user_profiles;w profile_data_private.watermarks_v1;before_profile bigint;before_pace bigint;retained jsonb;decision_n jsonb;cases_n jsonb;
begin
 if p_input_bytes is null or octet_length(p_input_bytes)>(case when p_action='recover' then 16384 else 8192 end) then raise exception 'INVALID_INPUT';end if;
 begin v:=p_input_bytes::jsonb;exception when others then raise exception 'INVALID_INPUT';end;
 if profile_data_private.input_v1(v,p_action) is not true then raise exception 'INVALID_INPUT';end if;
 if p_action='erase' and octet_length(jsonb_build_object('action','recover','scope',v->'scope','requestId',v->'requestId','profileId',v->'profileId','objectIds',v->'objectIds','mutationBytes',p_input_bytes)::text)>16384 then raise exception 'INVALID_INPUT';end if;
 actor:=profile_data_private.actor_v1(p_expected_epoch);u:=(actor->>'ownerId')::uuid;s:=(actor->>'sessionId')::uuid;epoch_n:=(actor->>'mobileEpoch')::bigint;
 scope_n:=v->>'scope';
 if scope_n='profile-sensitive-data/1' and p_action<>'list' and v->>'profileId' is distinct from u::text then raise exception 'FORBIDDEN';end if;
 if p_action='recover' then bytes_n:=v->>'mutationBytes';v:=bytes_n::jsonb;end if;
 request_n:=profile_data_private.digest_v1(bytes_n);
 if p_action='list' then
  if scope_n='profile-sensitive-data/1' then
   inv:=profile_data_private.inventory_v1(u);source_n:=inv->>'sourceDigest';
   items:=case when inv->'summary'='null' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('profileId',u,'summary',inv->'summary')) end;
  else inv:=profile_data_private.progress_v1(u);source_n:=inv->>'sourceDigest';items:=inv->'items';end if;
  cursor_id:=v->'cursor'->>'afterId';
  if cursor_id is not null then
   if v->'cursor'->>'sourceDigest' is distinct from source_n or not exists(select 1 from jsonb_array_elements(items) x where case when scope_n='profile-sensitive-data/1' then x->>'profileId' else x->>'requestId' end=cursor_id) then raise exception 'PROFILE_CONFLICT';end if;
  end if;
  select count(*)>20 into has_more from jsonb_array_elements(items) x where cursor_id is null or case when scope_n='profile-sensitive-data/1' then x->>'profileId' else x->>'requestId' end>cursor_id;
  select coalesce(jsonb_agg(x order by sort_id),'[]') into items from (select x,case when scope_n='profile-sensitive-data/1' then x->>'profileId' else x->>'requestId' end sort_id from jsonb_array_elements(items) x where cursor_id is null or case when scope_n='profile-sensitive-data/1' then x->>'profileId' else x->>'requestId' end>cursor_id order by sort_id limit 20) page;
  now_n:=profile_data_private.now_v1();
  result_n:=jsonb_build_object('schemaVersion','profile-data/1','kind','list','scope',scope_n,'sourceDigest',source_n,'capturedAt',now_n,'expiresAt',now_n+30000,'items',items,'hasMore',has_more,'nextCursor',case when has_more then jsonb_build_object('sourceDigest',source_n,'afterId',items->19->>'requestId') else null end,'allUserDataCompleted',false)||actor;
 else
  id:=(v->>'requestId')::uuid;
  -- Request rows are locked after the full source graph for mutation paths.
  if p_action='recover' then
   select * into r from profile_data_private.operations_v1 where request_id=id for update nowait;
   if not found then result_n:=jsonb_build_object('schemaVersion','profile-data/1','kind','unknown','scope',scope_n,'requestId',id,'profileId',v->'profileId','objectIds',v->'objectIds','requestDigest',request_n,'allUserDataCompleted',false)||actor;
   else
    if r.owner_id<>u or r.session_id<>s or r.mobile_epoch<>epoch_n or r.scope<>scope_n or to_jsonb(r.profile_id) is distinct from nullif(v->'profileId','null'::jsonb) or r.object_ids is distinct from v->'objectIds' then raise exception 'PROFILE_REQUEST_REUSE';end if;
    if r.state='erased' then
     if r.request_digest is distinct from request_n or r.source_digest is distinct from v->>'sourceDigest' or r.preview_digest is distinct from v->>'previewDigest' then raise exception 'PROFILE_REQUEST_REUSE';end if;
     result_n:=profile_data_private.binding_v1(r)||jsonb_build_object('kind','receipt','state','erased','decision',r.decision);
    else result_n:=jsonb_build_object('schemaVersion','profile-data/1','kind','unknown','scope',scope_n,'requestId',id,'profileId',v->'profileId','objectIds',v->'objectIds','requestDigest',request_n,'allUserDataCompleted',false)||actor;end if;
   end if;
  else
   if scope_n='profile-sensitive-data/1' then inv:=profile_data_private.inventory_v1(u);if inv->'profile'='null' then raise exception 'PROFILE_NOT_FOUND';end if;
   else inv:=profile_data_private.progress_v1(u,v->'objectIds');inv:=inv||jsonb_build_object('profile',null,'summary',null,'copies',profile_data_private.empty_copies_v1(),'conflicts','[]'::jsonb);end if;
   source_n:=inv->>'sourceDigest';
   select * into r from profile_data_private.operations_v1 where request_id=id for update nowait;
   if found and (r.owner_id<>u or r.session_id<>s or r.mobile_epoch<>epoch_n or r.scope<>scope_n or to_jsonb(r.profile_id) is distinct from nullif(v->'profileId','null'::jsonb) or r.object_ids is distinct from v->'objectIds') then raise exception 'PROFILE_REQUEST_REUSE';end if;
   if p_action='preview' then
    if r.request_id is null then
     if (select count(*) from profile_data_private.operations_v1 where owner_id=u)>=10000 then raise exception 'PROFILE_SCOPE_TOO_LARGE';end if;
     now_n:=profile_data_private.now_v1();
     preview_n:=profile_data_private.digest_v1(jsonb_build_object('actor',actor,'selection',v-array['action'],'sourceDigest',source_n,'capturedAt',now_n,'expiresAt',now_n+30000,'summary',inv->'summary','copies',inv->'copies','conflicts',inv->'conflicts')::text);
     insert into profile_data_private.proofs_v1 values(pg_current_xact_id(),u,'executor',null,null);
     insert into profile_data_private.operations_v1(request_id,owner_id,session_id,mobile_epoch,scope,profile_id,object_ids,source_digest,preview_digest,captured_at,expires_at,state,summary,copies,conflicts)
      values(id,u,s,epoch_n,scope_n,(v->>'profileId')::uuid,v->'objectIds',source_n,preview_n,now_n,now_n+30000,'previewed',nullif(inv->'summary','null'::jsonb),inv->'copies',inv->'conflicts') returning * into r;
     delete from profile_data_private.proofs_v1 where transaction_id=pg_current_xact_id();
    else
     if r.state<>'previewed' or r.preview_erased then raise exception 'PROFILE_REQUEST_REUSE';end if;
     if source_n is distinct from r.source_digest then raise exception 'PROFILE_CONFLICT';end if;
    end if;
    perform profile_data_private.deadline_v1(r.captured_at,r.expires_at);
    result_n:=profile_data_private.binding_v1(r)||jsonb_build_object('kind','preview','profile',inv->'profile','summary',inv->'summary','copies',r.copies,'conflicts',r.conflicts,'eligible',r.conflicts='[]'::jsonb,'progressCount',case when scope_n='profile-sensitive-data/1' then 0 else jsonb_array_length(r.object_ids) end);
   else
    if r.request_id is null then raise exception 'PROFILE_NOT_FOUND';end if;
    if r.state='erased' then
     if r.request_digest is distinct from request_n then raise exception 'PROFILE_REQUEST_REUSE';end if;
     result_n:=profile_data_private.binding_v1(r)||jsonb_build_object('kind','receipt','state','erased','decision',r.decision);
    else
     perform profile_data_private.deadline_v1(r.captured_at,r.expires_at);
     if r.preview_erased or r.source_digest is distinct from v->>'sourceDigest' or r.preview_digest is distinct from v->>'previewDigest' or source_n is distinct from r.source_digest then raise exception 'PROFILE_CONFLICT';end if;
     if r.conflicts<>'[]'::jsonb or inv->'conflicts'<>'[]'::jsonb then raise exception 'PROFILE_CONFLICT';end if;
     retained:=r.copies;cases_n:='[]';
     if scope_n='profile-sensitive-data/1' then
      select * into p from public.user_profiles where owner_id=u for update nowait;
      select * into w from profile_data_private.watermarks_v1 where owner_id=u for update nowait;
      before_profile:=p.profile_revision;before_pace:=p.pace_revision;e:=p;
      e.display_name:=null;e.travel_pace:='balanced';e.locale:='zh';e.currency:='CNY';e.distance_unit:='kilometre';e.temperature_unit:='celsius';e.default_departure_time:='09:00:00';
      e.pace_state:='revoked';e.pace_notice:=null;e.pace_operation:=null;e.pace_request:=null;e.pace_undo:=null;e.pace_revision:=p.pace_revision+1;e.profile_revision:=p.profile_revision+1;e.profile_saved_fields:='[]';
      insert into profile_data_private.proofs_v1 values(pg_current_xact_id(),u,'erase',to_jsonb(e),null);
      update public.user_profiles set display_name=null,travel_pace='balanced',locale='zh',currency='CNY',distance_unit='kilometre',temperature_unit='celsius',default_departure_time='09:00:00',pace_state='revoked',pace_notice=null,pace_operation=null,pace_request=null,pace_undo=null,pace_revision=e.pace_revision,profile_saved_fields='[]',updated_at=clock_timestamp() where owner_id=u returning * into e;
      delete from profile_data_private.proofs_v1 where transaction_id=pg_current_xact_id();
      -- Original source trigger owns these effects; compare every planned edge.
      cases_n:=r.copies->'sharedBriefs';
      if exists(select 1 from service_brief_private.briefs where r.copies->'sharedBriefs' ? case_id::text and (state<>'invalidated' or sources is not null or selected_keys<>'[]')) or exists(select 1 from service_brief_private.previews bp where r.copies->'briefPreviews' ? bp.id::text)
       or e.profile_revision<>before_profile+1 or e.pace_revision<>before_pace+1 or e.profile_saved_fields<>'[]' or e.created_at<>p.created_at then raise exception 'PROFILE_EFFECT_MISMATCH';end if;
      select * into w from profile_data_private.watermarks_v1 where owner_id=u;
      if w.profile_floor<>e.profile_revision or w.pace_floor<>e.pace_revision then raise exception 'PROFILE_EFFECT_MISMATCH';end if;
      perform profile_data_private.verify_effects_v1(inv);
      retained:=jsonb_set(jsonb_set(retained,'{briefPreviews}','[]'),'{sharedBriefs}','[]');
     else
      insert into profile_data_private.proofs_v1 values(pg_current_xact_id(),u,'executor',null,null);
      select count(*) into cleared from profile_data_private.operations_v1 where owner_id=u and r.object_ids ? request_id::text and not preview_erased;
      update profile_data_private.operations_v1 set preview_erased=true,summary=null,copies=null,conflicts=null where owner_id=u and r.object_ids ? request_id::text;
      get diagnostics count_n=row_count;if count_n<>jsonb_array_length(r.object_ids) then raise exception 'PROFILE_EFFECT_MISMATCH';end if;
      delete from profile_data_private.proofs_v1 where transaction_id=pg_current_xact_id();
     end if;
     now_n:=profile_data_private.deadline_v1(r.captured_at,r.expires_at);
     decision_n:=jsonb_build_object('requestDigest',request_n,'decidedAt',now_n,'beforeProfileRevision',before_profile,'afterProfileRevision',case when before_profile is not null then before_profile+1 else null end,'beforePaceRevision',before_pace,'afterPaceRevision',case when before_pace is not null then before_pace+1 else null end,
      'erasedFields',case when scope_n='profile-sensitive-data/1' then profile_data_private.boundaries_v1(scope_n)->'eraseFields' else '[]'::jsonb end,'briefCasesInvalidated',cases_n,'retainedCopies',retained,'clearedPreviews',cleared,'retainedFences',case when scope_n='profile-sensitive-data/1' then 1 else jsonb_array_length(r.object_ids) end,
      'sourceProfile',case when scope_n='profile-sensitive-data/1' then 'cleared' else 'not_modified' end,'paceConsent',case when scope_n='profile-sensitive-data/1' then 'revoked' else 'not_modified' end,'account','not_modified','sourceTrip','not_modified','explicitMemory','not_modified','financialProvider','not_modified','externalCopies','not_erased');
     insert into profile_data_private.proofs_v1 values(pg_current_xact_id(),u,'executor',null,null);
     update profile_data_private.operations_v1 set state='erased',request_digest=request_n,decision=decision_n,preview_erased=true,summary=null,copies=null,conflicts=null where request_id=id returning * into r;
     delete from profile_data_private.proofs_v1 where transaction_id=pg_current_xact_id();
     result_n:=profile_data_private.binding_v1(r)||jsonb_build_object('kind','receipt','state','erased','decision',decision_n);
    end if;
   end if;
  end if;
 end if;
 -- Absolute time and actual authority after all effects: exceptions roll back
 -- original Brief effects, source, floors and immutable receipt together.
 if profile_data_private.actor_v1(p_expected_epoch) is distinct from actor then raise exception 'SESSION_REPLACED';end if;
 if p_action<>'recover' and result_n->>'kind' in('preview','list') then perform profile_data_private.deadline_v1((result_n->>'capturedAt')::bigint,(result_n->>'expiresAt')::bigint);end if;
 if p_action='erase' and r.state='erased' and decision_n is not null then perform profile_data_private.deadline_v1(r.captured_at,r.expires_at);end if;
 if octet_length(result_n::text)>1000000 then raise exception 'PROFILE_SCOPE_TOO_LARGE';end if;
 return result_n;
exception when lock_not_available then raise exception 'PROFILE_CONFLICT';end$$;
