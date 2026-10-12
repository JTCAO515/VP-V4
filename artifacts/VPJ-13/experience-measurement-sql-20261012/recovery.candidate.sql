-- Private Core K1 constituent. No public RPC/grant, ingress or live adapter is
-- introduced. Original protected Core recovery must authenticate and acquire
-- a STILL-LIVE source outside the restored instance/payload. Until that source
-- binding is installed every acquisition check below denies.
create function journey_measurement_private.record_floor_v1(u uuid,authority_n uuid,kind_n text,n timestamptz,until_n timestamptz) returns void
language plpgsql volatile security definer set search_path='' as $$
declare floor_n bigint:=floor(extract(epoch from n)*1000)::bigint;old_n journey_measurement_private.journals_v1%rowtype;
begin
 if u is null or authority_n is null or kind_n not in('withdrawal','erasure','source_expiry','copy_obligation','copy_ack')
  or n>clock_timestamp() or until_n>n+interval '30 days' then raise exception 'MEASUREMENT_JOURNAL_UNQUALIFIED';end if;
 if not exists(select 1 from auth.users where id=u) then return;end if;
 if until_n<=clock_timestamp() then return;end if;
 select * into old_n from journey_measurement_private.journals_v1 where owner_id=u and event_kind=kind_n and authority_id=authority_n;
 if found then return;end if; -- immutable event receipt; no replay TTL renewal
 insert into journey_measurement_private.journals_v1 values(u,gen_random_uuid(),kind_n,authority_n,floor_n,n,until_n);
 insert into journey_measurement_private.recovery_controls_v1 values(u,gen_random_uuid(),1,
  case when kind_n in('withdrawal','erasure','source_expiry') then floor_n else 0 end,n,n,false,n,until_n)
 on conflict(owner_id) do update set
  erasure_floor=greatest(journey_measurement_private.recovery_controls_v1.erasure_floor,
   case when kind_n in('withdrawal','erasure','source_expiry') then floor_n else 0 end),
  covered_through_at=greatest(journey_measurement_private.recovery_controls_v1.covered_through_at,n),
  coverage_complete=false;
 -- This table is an inventory, not independent evidence. Complete coverage
 -- cannot be inferred from its existence, emptiness, a backup or a boolean.
 perform journey_measurement_private.cap_v1(u);
end $$;

create function journey_measurement_private.core_recovery_binding_v1(context_n jsonb,frame_n jsonb) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare valid_n boolean;
begin
 if to_regprocedure('export_private.measurement_live_acquisition_v1(jsonb,jsonb)') is null then return false;end if;
 -- The required original protected adapter checks authenticated source origin,
 -- current barrier, Core lease, layout/pins, seal/challenge and coverage. It is
 -- deliberately absent in this base; placeholder/config never means support.
 execute 'select export_private.measurement_live_acquisition_v1($1,$2)' into valid_n using context_n,frame_n;
 return valid_n is true;
exception when others then return false;
end $$;

create function journey_measurement_private.issue_recovery_v1(committed export_private.core_jobs_v1,context_n jsonb,request_n jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' set statement_timeout='5s' set lock_timeout='250ms' as $$
declare j export_private.core_jobs_v1;r journey_measurement_private.recovery_controls_v1%rowtype;
 source_n jsonb;inventory_n jsonb;copies_n jsonb;frame_n jsonb;now_n timestamptz:=clock_timestamp();
 captured_n bigint:=floor(extract(epoch from now_n)*1000)::bigint;expires_n bigint;rows_n integer;
 floor_n bigint;journal_n uuid;seal_n jsonb;current_n jsonb;
begin
 if auth.role() is distinct from 'service_role' or journey_measurement_private.exact_v1(request_n,array['requestId','leaseId','generation','acquisitionId','challenge']) is not true
  or journey_measurement_private.uuid_v1(request_n->'requestId') is not true or journey_measurement_private.uuid_v1(request_n->'leaseId') is not true
  or journey_measurement_private.uuid_v1(request_n->'acquisitionId') is not true or journey_measurement_private.uuid_v1(request_n->'challenge') is not true
  then raise exception 'MEASUREMENT_RECOVERY_DENIED';end if;
 select * into j from export_private.core_jobs_v1 where request_id=committed.request_id for update nowait;
 if not found or to_jsonb(j) is distinct from to_jsonb(committed)
  or request_n->>'requestId'<>j.request_id::text or request_n->>'leaseId'<>j.lease_id::text
  or (request_n->>'generation')::integer<>j.generation
  or export_private.live_lease_v1(j,j.lease_id,j.generation) is not true then raise exception 'MEASUREMENT_RECOVERY_DENIED';end if;
 if context_n->>'schemaVersion' is distinct from 'journey-experience-measurement/1'
  or context_n->>'purpose' is distinct from 'journey_experience_measurement'
  or context_n->>'scope' is distinct from 'journey-experience-measurement/1'
  or context_n->>'ownerId' is distinct from j.owner_id::text or context_n->>'mode' is distinct from 'scoped_restore'
  or context_n->'source'->'instanceId'=context_n->'targetInstanceId'
  or context_n->'barrier'->>'kind' is distinct from 'writers_quiesced'
  then raise exception 'MEASUREMENT_RECOVERY_DENIED';end if;
 if not pg_try_advisory_xact_lock(hashtextextended(j.owner_id::text,34)) then raise exception 'MEASUREMENT_CONFLICT';end if;
 select * into r from journey_measurement_private.recovery_controls_v1 where owner_id=j.owner_id for update nowait;
 if not found or r.expires_at<=now_n or not r.coverage_complete
  or r.covered_from_at>to_timestamp((context_n->>'backupCutoffAt')::numeric/1000)
  or r.covered_through_at<to_timestamp((context_n->'barrier'->>'closedAt')::numeric/1000)
  then raise exception 'MEASUREMENT_RECOVERY_COVERAGE_UNKNOWN';end if;
 source_n:=journey_measurement_private.export_source_v1(j.owner_id);
 inventory_n:=source_n->'sourceRows';select sum(value::text::integer) into rows_n from jsonb_each(inventory_n);
 if rows_n>10000 or octet_length(source_n::text)>1000000 then raise exception 'MEASUREMENT_CAPACITY';end if;
 select coalesce(max(floor),0),(array_agg(journal_id order by journal_id))[1] into floor_n,journal_n from journey_measurement_private.journals_v1
  where owner_id=j.owner_id and event_kind in('withdrawal','erasure','source_expiry') and expires_at>now_n;
 if journal_n is null or floor_n<>r.erasure_floor then raise exception 'MEASUREMENT_RECOVERY_COVERAGE_UNKNOWN';end if;
 select coalesce(jsonb_agg(jsonb_build_object('copyId',copy_id,'executorId',null,'ackId',null,
  'state',case when state='erased' then 'acknowledged' when state='pending' then 'outstanding' else 'unknown' end,
  'authorityReceivedAt',floor(extract(epoch from received_at)*1000)::bigint,'expiresAt',floor(extract(epoch from expires_at)*1000)::bigint) order by copy_id),'[]') into copies_n
 from journey_measurement_private.copy_obligations_v1 where owner_id=j.owner_id and expires_at>now_n;
 -- No copied receipt means ACK. Absent executor/ACK cannot be acknowledged.
 if exists(select 1 from journey_measurement_private.copy_obligations_v1 where owner_id=j.owner_id and expires_at>now_n) then raise exception 'MEASUREMENT_EXTERNAL_COPY_UNKNOWN';end if;
 expires_n:=least(captured_n+30000,(context_n->>'expiresAt')::bigint,floor(extract(epoch from r.expires_at)*1000)::bigint);
 if expires_n<=captured_n then raise exception 'MEASUREMENT_RECOVERY_DENIED';end if;
 frame_n:=jsonb_build_object('schemaVersion','journey-experience-measurement/1','purpose','journey_experience_measurement','kind','measurement_recovery_journal',
  'requestId',j.request_id,'leaseId',j.lease_id,'generation',j.generation,'acquisitionId',request_n->'acquisitionId','challenge',request_n->'challenge',
  'ownerId',j.owner_id,'scope','journey-experience-measurement/1','source',context_n->'source','targetInstanceId',context_n->'targetInstanceId',
  'layoutDigest',context_n->'layoutDigest','pinsDigest',context_n->'pinsDigest','reconciliationGeneration',j.generation,'journalId',journal_n,'floor',floor_n,
  'cutoffAt',context_n->'backupCutoffAt','coveredFromAt',floor(extract(epoch from r.covered_from_at)*1000)::bigint,
  'coveredThroughAt',floor(extract(epoch from r.covered_through_at)*1000)::bigint,'barrierId',context_n->'barrier'->'barrierId',
  'capturedAt',captured_n,'expiresAt',expires_n,'authorityReceivedAt',floor(extract(epoch from r.authority_received_at)*1000)::bigint,
  'retainedUntil',floor(extract(epoch from r.expires_at)*1000)::bigint,'coverage',jsonb_build_object('withdrawals','complete','erasures','complete','sourceExpiry','complete','copies','complete'),
  'inventory',inventory_n,'copies',copies_n,'authorityInventoryDigest',notification_private.hash(source_n));
 -- Authentication is supplied by the original still-live Core source, never
 -- a client signing key or this metadata integrity hash.
 if journey_measurement_private.core_recovery_binding_v1(context_n,frame_n) is not true then raise exception 'MEASUREMENT_RECOVERY_SOURCE_UNAVAILABLE';end if;
 execute 'select export_private.measurement_source_seal_v1($1,$2)' into seal_n using context_n,frame_n;
 if journey_measurement_private.exact_v1(seal_n,array['kind','sealId','digest']) is not true or seal_n->>'kind'<>'source_obtained'
  or journey_measurement_private.uuid_v1(seal_n->'sealId') is not true or coalesce(seal_n->>'digest','') !~ '^[a-f0-9]{64}$' then raise exception 'MEASUREMENT_RECOVERY_SOURCE_UNAVAILABLE';end if;
 frame_n:=frame_n||jsonb_build_object('sourceSeal',seal_n);
 return frame_n||jsonb_build_object('integrityDigest',notification_private.hash(frame_n));
end $$;

create function journey_measurement_private.reconcile_recovery_v1(committed export_private.core_jobs_v1,context_n jsonb,frame_n jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' set statement_timeout='5s' set lock_timeout='250ms' as $$
declare j export_private.core_jobs_v1;now_n bigint:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 rows_n integer;floor_n bigint;fresh_source_n boolean;
begin
 if auth.role() is distinct from 'service_role' or context_n->>'mode' is distinct from 'scoped_restore'
  or context_n->'source'->'instanceId'=context_n->'targetInstanceId'
  or (frame_n->>'expiresAt')::bigint<=now_n
  or frame_n->'ownerId' is distinct from context_n->'ownerId'
  or frame_n->'scope' is distinct from context_n->'scope'
  or frame_n->'layoutDigest' is distinct from context_n->'layoutDigest'
  or frame_n->'pinsDigest' is distinct from context_n->'pinsDigest'
  or frame_n->'barrierId' is distinct from context_n->'barrier'->'barrierId'
  or frame_n->'source' is distinct from context_n->'source'
  or notification_private.hash(frame_n-'integrityDigest') is distinct from frame_n->>'integrityDigest'
  or journey_measurement_private.core_recovery_binding_v1(context_n,frame_n) is not true
  then raise exception 'MEASUREMENT_RECOVERY_DENIED';end if;
 select * into j from export_private.core_jobs_v1 where request_id=committed.request_id for update nowait;
 if not found or to_jsonb(j) is distinct from to_jsonb(committed) or j.owner_id::text is distinct from frame_n->>'ownerId'
  or j.request_id::text is distinct from frame_n->>'requestId' or j.lease_id::text is distinct from frame_n->>'leaseId'
  or j.generation is distinct from (frame_n->>'generation')::integer or export_private.live_lease_v1(j,j.lease_id,j.generation) is not true
  then raise exception 'MEASUREMENT_RECOVERY_DENIED';end if;
 if (frame_n->'inventory'->>'copyObligations')::integer<>0 or frame_n->'copies'<>'[]'::jsonb
  or frame_n->'coverage'<>jsonb_build_object('withdrawals','complete','erasures','complete','sourceExpiry','complete','copies','complete')
  then raise exception 'MEASUREMENT_EXTERNAL_COPY_UNKNOWN';end if;
 if not pg_try_advisory_xact_lock(hashtextextended(j.owner_id::text,34)) then raise exception 'MEASUREMENT_CONFLICT';end if;
 floor_n:=(frame_n->>'floor')::bigint;
 -- Reapply independently acquired original erasure floor, not restored control
 -- data. Expired or pre-floor consent/admissions are physically removed. The
 -- original live source/current barrier is rechecked before returning proof.
 delete from journey_measurement_private.consents_v1 where owner_id=j.owner_id and
  (floor(extract(epoch from accepted_at)*1000)::bigint<=floor_n or expires_at<=clock_timestamp());
 delete from journey_measurement_private.reports_v1 where owner_id=j.owner_id and expires_at<=clock_timestamp();
 delete from journey_measurement_private.admissions_v1 where owner_id=j.owner_id and expires_at<=clock_timestamp();
 if exists(select 1 from journey_measurement_private.copy_obligations_v1 where owner_id=j.owner_id and state<>'erased') then raise exception 'MEASUREMENT_EXTERNAL_COPY_UNKNOWN';end if;
 if journey_measurement_private.core_recovery_binding_v1(context_n,frame_n) is not true then raise exception 'MEASUREMENT_RECOVERY_DENIED';end if;
 return jsonb_build_object('schemaVersion','journey-experience-measurement/1','purpose','journey_experience_measurement','kind','measurement_recovery_reconciliation',
  'requestId',j.request_id,'leaseId',j.lease_id,'generation',j.generation,'ownerId',j.owner_id,'scope','journey-experience-measurement/1',
  'sourceId',frame_n->'source'->'sourceId','targetInstanceId',frame_n->'targetInstanceId','journalId',frame_n->'journalId','acquisitionId',frame_n->'acquisitionId',
  'reconciliationGeneration',frame_n->'reconciliationGeneration','layoutDigest',frame_n->'layoutDigest','pinsDigest',frame_n->'pinsDigest',
  'barrierId',frame_n->'barrierId','floor',floor_n,'authorityInventoryDigest',frame_n->'authorityInventoryDigest','integrityDigest',frame_n->'integrityDigest',
  'expiresAt',frame_n->'expiresAt','state','reconciled','copies',jsonb_build_object('state','acknowledged','obligations',0,'acknowledged',0));
end $$;
revoke all on all functions in schema journey_measurement_private from public,anon,authenticated,service_role;
