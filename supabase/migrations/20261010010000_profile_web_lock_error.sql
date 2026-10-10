-- PR673 same-task Web error-family compatibility, original Profile owner/Main lease.
-- Applied07020000 stays immutable. Exact a2f body/metadata/ACL baseline is required.
-- Only an unversioned owner with an already committed clear floor translates
-- new owner-source lock contention into the original PROFILE_WRITE_FENCE.
-- No permission/config/schema/lock/timeout/validation/row-effect change.
do $profile_web_before$
declare actual_metadata jsonb;actual_source text;begin
 select jsonb_build_object('signature','profile_data_private.web_save_v1(text,text,text,text,text,text,time without time zone,bigint)','owner',pg_get_userbyid(p.proowner),'language',l.lanname,'kind',p.prokind,'volatile',p.provolatile,'definer',p.prosecdef,'strict',p.proisstrict,'leakproof',p.proleakproof,'returnsSet',p.proretset,'returnType',p.prorettype::regtype::text,'config',to_jsonb(p.proconfig),'acl',to_jsonb(p.proacl),'argumentNames',to_jsonb(p.proargnames),'argumentModes',to_jsonb(p.proargmodes),'allArgumentTypes',(select jsonb_agg(x::regtype::text order by n) from unnest(p.proallargtypes)with ordinality a(x,n)),'defaults',p.pronargdefaults),md5(p.prosrc) into actual_metadata,actual_source from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure('profile_data_private.web_save_v1(text,text,text,text,text,text,time,bigint)');
 if actual_source is distinct from '5b8e7a781f70ba4dfab448a2b0233f01' or actual_metadata is distinct from '{"acl":["postgres=X/postgres"],"kind":"f","owner":"postgres","config":["search_path=\"\""],"strict":false,"definer":true,"defaults":0,"language":"plpgsql","volatile":"v","leakproof":false,"signature":"profile_data_private.web_save_v1(text,text,text,text,text,text,time without time zone,bigint)","returnType":"record","returnsSet":true,"argumentModes":["i","i","i","i","i","i","i","i","t","t"],"argumentNames":["p_display_name","p_travel_pace","p_locale","p_currency","p_distance_unit","p_temperature_unit","p_default_departure_time","p_expected_profile_revision","owner_id","updated_at"],"allArgumentTypes":["text","text","text","text","text","text","time without time zone","bigint","uuid","timestamp with time zone"]}'::jsonb then raise exception 'PROFILE_WEB_LOCK_BEFORE_MISMATCH';end if;
end $profile_web_before$;

create or replace function profile_data_private.web_save_v1(p_display_name text,p_travel_pace text,p_locale text,p_currency text,p_distance_unit text,p_temperature_unit text,p_default_departure_time time,p_expected_profile_revision bigint)
returns table(owner_id uuid,updated_at timestamptz) language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();w profile_data_private.watermarks_v1;p public.user_profiles;e public.user_profiles;begin
 -- Original Web compatibility guard: no new mobile enrollment prerequisite.
 perform identity_private.guard_mobile_rpc_v2();
 if u is null then raise exception 'FORBIDDEN';end if;
 begin
  w:=profile_data_private.lock_owner_v1(u);
 exception when lock_not_available then
  if p_expected_profile_revision is null and exists(select 1 from profile_data_private.watermarks_v1 mw where mw.owner_id=u and mw.profile_floor>0) then raise exception 'PROFILE_WRITE_FENCE';end if;
  raise;
 end;
 if p_expected_profile_revision is null then if w.profile_floor>0 then raise exception 'PROFILE_WRITE_FENCE';end if;
 elsif p_expected_profile_revision<0 or p_expected_profile_revision>9007199254740990 then raise exception 'INVALID_PROFILE';
 elsif p_expected_profile_revision<>w.profile_revision then raise exception 'PROFILE_CONFLICT';end if;
 if nullif(trim(p_display_name),'') is not null and char_length(trim(p_display_name)) not between 1 and 80 then raise exception 'INVALID_PROFILE';end if;
 if p_travel_pace is null or p_locale is null or p_currency is null or p_distance_unit is null or p_temperature_unit is null or p_default_departure_time is null or p_travel_pace not in('relaxed','balanced','packed') or p_locale not in('zh','en','es','ru','ar') or p_currency not in('CNY','USD','EUR','RUB','SAR') or p_distance_unit not in('kilometre','mile') or p_temperature_unit not in('celsius','fahrenheit') then raise exception 'INVALID_PROFILE';end if;
 select * into p from public.user_profiles where public.user_profiles.owner_id=u for update nowait;
 if p.owner_id is null then
  e:=jsonb_populate_record(null::public.user_profiles,jsonb_build_object('owner_id',u,'profile_revision',w.profile_revision,'pace_revision',w.pace_revision,'pace_state',case when w.pace_floor>0 then 'revoked' else 'unset' end));
 else e:=p;end if;
 e.display_name:=nullif(trim(p_display_name),'');e.travel_pace:=p_travel_pace;e.locale:=p_locale;e.currency:=p_currency;e.distance_unit:=p_distance_unit;e.temperature_unit:=p_temperature_unit;e.default_departure_time:=p_default_departure_time;
 e.profile_saved_fields:='["display_name","travel_pace","locale","currency","distance_unit","temperature_unit","default_departure_time"]';
 if p.owner_id is not null and e.travel_pace is distinct from p.travel_pace then e.pace_revision:=p.pace_revision+1;e.pace_state:='unset';e.pace_notice:=null;e.pace_operation:=null;e.pace_request:=null;e.pace_undo:=null;end if;
 insert into profile_data_private.proofs_v1 values(pg_current_xact_id(),u,'web',to_jsonb(e),null);
 if p.owner_id is null then
  insert into public.user_profiles(owner_id,display_name,travel_pace,locale,currency,distance_unit,temperature_unit,default_departure_time,pace_revision,pace_state,profile_saved_fields)
   values(u,e.display_name,e.travel_pace,e.locale,e.currency,e.distance_unit,e.temperature_unit,e.default_departure_time,e.pace_revision,e.pace_state,e.profile_saved_fields);
  -- First explicit Web form save advances its source revision too.
  select * into e from public.user_profiles where public.user_profiles.owner_id=u;
  update profile_data_private.proofs_v1 set expected_row=to_jsonb(e) where transaction_id=pg_current_xact_id();
  update public.user_profiles set updated_at=clock_timestamp() where public.user_profiles.owner_id=u;
 else
  update public.user_profiles set display_name=e.display_name,travel_pace=e.travel_pace,locale=e.locale,currency=e.currency,distance_unit=e.distance_unit,temperature_unit=e.temperature_unit,default_departure_time=e.default_departure_time,pace_revision=e.pace_revision,pace_state=e.pace_state,pace_notice=e.pace_notice,pace_operation=e.pace_operation,pace_request=e.pace_request,pace_undo=e.pace_undo,profile_saved_fields=e.profile_saved_fields,updated_at=clock_timestamp() where public.user_profiles.owner_id=u;
 end if;
 delete from profile_data_private.proofs_v1 where transaction_id=pg_current_xact_id();
 return query select p2.owner_id,p2.updated_at from public.user_profiles p2 where p2.owner_id=u;
end$$;


do $profile_web_after$
declare actual_metadata jsonb;actual_source text;begin
 select jsonb_build_object('signature','profile_data_private.web_save_v1(text,text,text,text,text,text,time without time zone,bigint)','owner',pg_get_userbyid(p.proowner),'language',l.lanname,'kind',p.prokind,'volatile',p.provolatile,'definer',p.prosecdef,'strict',p.proisstrict,'leakproof',p.proleakproof,'returnsSet',p.proretset,'returnType',p.prorettype::regtype::text,'config',to_jsonb(p.proconfig),'acl',to_jsonb(p.proacl),'argumentNames',to_jsonb(p.proargnames),'argumentModes',to_jsonb(p.proargmodes),'allArgumentTypes',(select jsonb_agg(x::regtype::text order by n) from unnest(p.proallargtypes)with ordinality a(x,n)),'defaults',p.pronargdefaults),md5(p.prosrc) into actual_metadata,actual_source from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure('profile_data_private.web_save_v1(text,text,text,text,text,text,time,bigint)');
 if actual_source is distinct from '783359ac74880bcba2261894453706dc' or actual_metadata is distinct from '{"acl":["postgres=X/postgres"],"kind":"f","owner":"postgres","config":["search_path=\"\""],"strict":false,"definer":true,"defaults":0,"language":"plpgsql","volatile":"v","leakproof":false,"signature":"profile_data_private.web_save_v1(text,text,text,text,text,text,time without time zone,bigint)","returnType":"record","returnsSet":true,"argumentModes":["i","i","i","i","i","i","i","i","t","t"],"argumentNames":["p_display_name","p_travel_pace","p_locale","p_currency","p_distance_unit","p_temperature_unit","p_default_departure_time","p_expected_profile_revision","owner_id","updated_at"],"allArgumentTypes":["text","text","text","text","text","text","time without time zone","bigint","uuid","timestamp with time zone"]}'::jsonb then raise exception 'PROFILE_WEB_LOCK_AFTER_MISMATCH';end if;
end $profile_web_after$;
