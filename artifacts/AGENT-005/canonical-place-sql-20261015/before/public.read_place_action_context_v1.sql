CREATE OR REPLACE FUNCTION public.read_place_action_context_v1(p_trip uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
declare u uuid:=place_actions_private.actor_v1();t public.trips%rowtype;m jsonb;s place_actions_private.saved_places%rowtype;r uuid;saved jsonb;basis jsonb;src jsonb;stamp timestamptz;snapshot jsonb;
begin
 if p_input->>'action'='saved' then return place_actions_private.saved_v1(p_trip,p_input,u);end if;
 if not place_actions_private.valid_v1(p_input,true) then raise exception 'INVALID_INPUT';end if;
 select * into t from public.trips where id=p_trip and owner_id=u for share;if not found then raise exception 'FORBIDDEN';end if;
 if exists(select 1 from public.trip_archives where trip_id=t.id) or exists(select 1 from privacy_private.trip_deletions where trip_id=t.id) then return jsonb_build_object('kind','unavailable','reason','ARCHIVED');end if;
 if t.head_version<>(p_input->>'expectedTripVersion')::numeric then return jsonb_build_object('kind','unavailable','reason','STALE_TRIP_VERSION');end if;
 if (select count(*) from public.trip_place_references where trip_id=t.id)>100 or (select count(*) from public.trip_days where trip_id=t.id)>100 or (select count(*) from public.trip_items where trip_id=t.id)>500 then return jsonb_build_object('kind','unavailable','reason','CAPACITY');end if;
 m:=place_actions_private.mapping_v1(p_input->'selection');if m is null then return jsonb_build_object('kind','unavailable','reason',case when exists(select 1 from public.canonical_pois where id=(p_input->'selection'->>'canonicalPoiId')::uuid) then 'MAPPING_CHANGED' else 'PLACE_NOT_FOUND' end);end if;
 select * into s from place_actions_private.saved_places where owner_id=u and trip_id=t.id and canonical_poi_id=(p_input->'selection'->>'canonicalPoiId')::uuid for share;
 if found then
  perform 1 from public.trip_place_references where id=s.reference_id and trip_id=t.id and owner_id=u and canonical_poi_id=s.canonical_poi_id and reference_kind='canonical';if not found then raise exception 'PLACE_ACTION_UNAVAILABLE';end if;
  saved:=jsonb_build_object('referenceId',s.reference_id,'revision',s.revision,'status',s.status,'mappingDigest',s.mapping_digest);r:=s.reference_id;
 else select id into r from public.trip_place_references where trip_id=t.id and owner_id=u and reference_kind='canonical' and canonical_poi_id=(p_input->'selection'->>'canonicalPoiId')::uuid order by created_at,id limit 1;end if;
 snapshot:=place_actions_private.snapshot_v1(t.id,t.title,t.head_version);
 if place_actions_private.utf16_length_v1(m->>(p_input->>'locale'))>160 or place_actions_private.utf16_length_v1(t.title)>160 or exists(select 1 from public.trip_items where trip_id=t.id and place_actions_private.utf16_length_v1(title)>160) then return jsonb_build_object('kind','unavailable','reason','CAPACITY');end if;
 src:=place_actions_private.sources_v1((p_input->'selection'->>'canonicalPoiId')::uuid,p_input->>'locale');
 basis:=jsonb_build_object('kind','place_action_context','tripId',t.id,'tripVersion',t.head_version,'selection',p_input->'selection','mappingDigest',m->>'digest','snapshot',snapshot,'displayTitle',m->>(p_input->>'locale'),'referenceId',r,'saved',saved,'sourceCandidates',src->'entries','sourceCandidatesStatus',src->>'status');
 stamp:=clock_timestamp();
 return basis||jsonb_build_object('contextDigest',place_actions_private.hash_v1(jsonb_build_object('owner',u,'session',auth.jwt()->>'session_id','basis',basis)),'evaluatedAt',recovery_private.ms_v1(stamp),'expiresAt',recovery_private.ms_v1(least(stamp+interval '30 seconds',(src->>'expiresAt')::timestamptz)));
exception when lock_not_available then raise exception 'PLACE_ACTION_UNAVAILABLE';end $function$
