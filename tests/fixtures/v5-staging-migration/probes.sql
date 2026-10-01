-- Claims exercise SQL RLS/session contracts, not real Auth/JWT validation.
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
set request.jwt.claims='{"role":"authenticated","is_anonymous":false,"session_id":"20000000-0000-0000-0000-000000000001"}';
set role authenticated;
do $$begin
  if (select count(*) from public.trips) is distinct from 1 then raise exception 'OWNER_TRIP_READ_FAILED'; end if;
  if (select status from public.memory_consents limit 1) is distinct from 'revoked' then raise exception 'REVOKED_CONSENT_REVIVED'; end if;
  if has_function_privilege(current_user,'public.hosted_planning_target_v1(uuid,uuid,uuid,text,bigint,uuid,uuid)','execute')
    or has_table_privilege(current_user,'public.model_budget_attempts','select')
    or has_table_privilege(current_user,'public.storekit_grants','insert') then raise exception 'SERVER_AUTHORITY_EXPOSED'; end if;
end $$;
select public.native_travel_pace_v1('{"action":"save","operationId":"80000000-0000-0000-0000-000000000001","expectedRevision":0,"travelPace":"relaxed","noticeVersion":"local-planning-cross-trip-v1"}');
select public.native_travel_pace_v1('{"action":"revoke","operationId":"80000000-0000-0000-0000-000000000002","expectedRevision":1}');
do $$begin
  begin
    perform public.native_travel_pace_v1('{"action":"save","operationId":"80000000-0000-0000-0000-000000000001","expectedRevision":0,"travelPace":"relaxed","noticeVersion":"local-planning-cross-trip-v1"}');
    raise exception 'STALE_SAVE_REVIVED';
  exception when others then if sqlerrm is distinct from 'PACE_CONFLICT' then raise; end if; end;
  if public.native_task_travel_pace_v1('{"tripId":"30000000-0000-0000-0000-000000000001","currentPace":null,"useSaved":true}')->>'source' is distinct from 'none' then raise exception 'REVOKED_PACE_USED'; end if;
end $$;
reset role;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
set role authenticated;
do $$begin
  if (select count(*) from public.trips) is distinct from 0 or (select count(*) from public.memory_consents) is distinct from 0 then raise exception 'OTHER_ACTOR_LEAK'; end if;
end $$;
reset role;
set role anon;
do $$begin
  if has_table_privilege(current_user,'public.trips','select')
    or has_function_privilege(current_user,'public.native_travel_pace_v1(jsonb)','execute')
    or has_function_privilege(current_user,'public.storekit_apply_verified_v1(jsonb)','execute') then raise exception 'ANON_AUTHORITY_EXPOSED'; end if;
end $$;
reset role;
-- Exercise the new ledger's verified-input RPC using synthetic claims, then erase.
set request.jwt.claim.role='service_role';
set role service_role;
select public.storekit_apply_verified_v1('{"environment":"Sandbox","transactionId":"synthetic-replay-ledger","ownerId":"10000000-0000-0000-0000-000000000001","appAccountToken":"10000000-0000-0000-0000-000000000001","productId":"synthetic.pass","purchaseAt":"2026-01-01T00:00:00Z","catalogVersion":1,"policyVersion":"synthetic/1","capacitySnapshot":{}}');
reset role;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
set role authenticated;
do $$begin
  if (select count(*) from public.storekit_grants) is distinct from 0 then raise exception 'OTHER_ACTOR_LEDGER_LEAK'; end if;
end $$;
reset role;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
set role authenticated;
do $$begin
  if (select count(*) from public.storekit_grants) is distinct from 1 then raise exception 'OWNER_LEDGER_READ_FAILED'; end if;
end $$;
reset role;
set role service_role;
do $$declare payload jsonb := '{"environment":"Sandbox","transactionId":"synthetic-replay-ledger","ownerId":"10000000-0000-0000-0000-000000000001","appAccountToken":"10000000-0000-0000-0000-000000000001","productId":"synthetic.pass","purchaseAt":"2026-01-01T00:00:00Z","catalogVersion":1,"policyVersion":"synthetic/1","capacitySnapshot":{}}';begin
  if public.storekit_apply_verified_v1(payload || '{"revokedAt":"2026-01-02T00:00:00Z"}'::jsonb)->>'state' is distinct from 'revoked'
    or public.storekit_apply_verified_v1(payload)->>'state' is distinct from 'revoked' then raise exception 'REVOKED_LEDGER_REVIVED'; end if;
end $$;
select public.storekit_erase_owner_v1('10000000-0000-0000-0000-000000000001');
do $$begin
  begin
    perform public.storekit_apply_verified_v1('{"environment":"Sandbox","transactionId":"synthetic-replay-ledger","ownerId":"10000000-0000-0000-0000-000000000001","appAccountToken":"10000000-0000-0000-0000-000000000001","productId":"synthetic.pass","purchaseAt":"2026-01-01T00:00:00Z","catalogVersion":1,"policyVersion":"synthetic/1","capacitySnapshot":{}}');
    raise exception 'ERASED_TRANSACTION_REVIVED';
  exception when others then if sqlerrm is distinct from 'TRANSACTION_CONFLICT' then raise; end if; end;
end $$;
reset role;
do $$begin
  if (select count(*) from public.trips) is distinct from 1
    or (select status||':'||actual_micros from public.model_budget_attempts limit 1) is distinct from 'settled:7'
    or (select enabled or not frozen from public.model_budget_scopes limit 1) is distinct from false
    or (select count(*) from public.storekit_grants where state='erased' and owner_id is null) is distinct from 1
    or (select count(*) from turn_private.planning_policies) is distinct from 0
    or (select enabled from turn_private.hosted_worker_control limit 1) is distinct from false then raise exception 'DATA_OR_DEFAULT_GATE_CHANGED'; end if;
end $$;
