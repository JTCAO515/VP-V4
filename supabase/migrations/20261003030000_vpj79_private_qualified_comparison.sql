-- Private preparation only. Frozen dependencies: intake200000 and bridge020000.
-- No public API, writer, claim, dispatch, completion or execution guard change.
create function turn_private.project_planning_qualified_comparison_v1(
 p_owner uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text,p_place jsonb,p_locale text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare context jsonb;q jsonb;i jsonb;r jsonb;binding jsonb;options jsonb:='[]';obs jsonb;areas jsonb:='[]';
 unknowns jsonb:='["food","photography","pace_suitability","safety","quietness","hotel_price","availability"]';fields jsonb:='[]';
 area jsonb;key text;locale text;environment text;observed timestamptz;now_at timestamptz:=clock_timestamp();
 interests text;pace text;source_name text;summary text;fact text;title text;
begin
 if p_owner is null or p_turn is null or p_intake_digest is null or p_planning_digest is null
  or p_intake_digest !~ '^[a-f0-9]{64}$' or p_planning_digest !~ '^[a-f0-9]{64}$' or p_locale is null or p_locale not in ('zh','en') then return null; end if;
 context:=turn_private.read_planning_qualified_intake_v1(p_owner,p_turn,p_lease);
 if not coalesce(jsonb_typeof(context)='object' and context ?& array['kind','schemaVersion','ownerId','turnId','taskId','artifactId','planningPolicyId','provider','endpoint','goalText','delegation','planningActionBasis','qualifiedIntake','intakeContextDigest','executionAvailable','readyForProvider','planningContextDigest']
  and context-'kind'-'schemaVersion'-'ownerId'-'turnId'-'taskId'-'artifactId'-'planningPolicyId'-'provider'-'endpoint'-'goalText'-'delegation'-'planningActionBasis'-'qualifiedIntake'-'intakeContextDigest'-'executionAvailable'-'readyForProvider'-'planningContextDigest'='{}'
  and context->>'kind'='planning_intake_input' and context->>'schemaVersion'='planning-intake-context/2'
  and context->>'ownerId'=p_owner::text and context->>'turnId'=p_turn::text
  and context->>'intakeContextDigest'=p_intake_digest and context->>'planningContextDigest'=p_planning_digest
  and context->'executionAvailable'='false'::jsonb and context->'readyForProvider'='false'::jsonb,false) then return null; end if;
 q:=context->'qualifiedIntake';i:=q->'intake';r:=q->'readiness';
 if not coalesce(jsonb_typeof(q)='object' and q ?& array['version','kind','schemaVersion','conversationId','goalId','goalVersion','messageId','messageSequence','intakeRevision','sourceKind','intake','memoryBasis','contextDigest','readiness','readyForProvider']
  and q-'version'-'kind'-'schemaVersion'-'conversationId'-'goalId'-'goalVersion'-'messageId'-'messageSequence'-'intakeRevision'-'sourceKind'-'intake'-'memoryBasis'-'contextDigest'-'readiness'-'readyForProvider'='{}'
  and q->'version'='5'::jsonb and q->>'kind'='travel_intake' and q->>'schemaVersion'='assistant-travel-current-basis/1'
  and q->>'sourceKind'='explicit_current_input' and q->'readyForProvider'='false'::jsonb and q->>'contextDigest'=p_intake_digest
  and turn_private.valid_explicit_travel_intake_v1(i) and i->>'city'='shanghai' and i->>'comparisonTarget'='area_transport'
  and jsonb_typeof(r)='object' and r ?& array['kind','scope','unknown'] and r-'kind'-'scope'-'unknown'='{}'
  and r->>'kind'='ready' and r->>'scope'='transport_screening',false) then return null; end if;
 select m.locale into locale from turn_private.assistant_messages m
  join turn_private.planning_comparisons j on j.message_id=m.id and j.task_id=m.task_id and j.goal_id=m.goal_id and j.owner_id=m.owner_id
  where j.turn_id=p_turn and j.owner_id=p_owner and m.id=(q->>'messageId')::uuid
   and m.conversation_id=(q->>'conversationId')::uuid and m.goal_id=(q->>'goalId')::uuid
   and m.sequence=(q->>'messageSequence')::bigint and m.scope_version=(q->>'goalVersion')::integer
   and j.task_id::text=context->>'taskId' and j.artifact_id::text=context->>'artifactId';
 if locale is null or locale<>p_locale then return null; end if;
 select p.environment into environment from turn_private.planning_policies p where p.id=(context->>'planningPolicyId')::uuid;
 if environment is null or not coalesce(turn_private.valid_planning_observation_v1('place.read',p_place),false)
  or (p_place->>'source') is distinct from (case when environment='local_synthetic' then 'synthetic_fixture' when environment='staging' then 'amap' end) then return null; end if;
 begin observed:=(p_place->>'observedAt')::timestamptz;
 exception when invalid_datetime_format or datetime_field_overflow then return null; end;
 if observed>now_at+interval '5 seconds' or observed<now_at-interval '5 minutes' then return null; end if;
 binding:=jsonb_build_object('conversationId',q->'conversationId','goalId',q->'goalId','goalVersion',q->'goalVersion','messageId',q->'messageId',
  'messageSequence',q->'messageSequence','intakeRevision',q->'intakeRevision','contextDigest',q->'contextDigest','memoryBasis',q->'memoryBasis');
 if i->'interests'='null'::jsonb then interests:=case when locale='zh' then '未知' else 'unknown' end;
 elsif i->'interests'='[]'::jsonb then interests:=case when locale='zh' then '未选择' else 'none selected' end;
 else select string_agg(case when locale='zh' then case x when 'food' then '美食' when 'photography' then '摄影' when 'culture' then '文化' when 'nature' then '自然' end else x end,
  case when locale='zh' then '、' else ', ' end order by n) into interests from jsonb_array_elements_text(i->'interests') with ordinality a(x,n);end if;
 pace:=case when i->'pace'='null'::jsonb then case when locale='zh' then '未知' else 'unknown' end when locale='en' then i->>'pace'
  else case i->>'pace' when 'relaxed' then '轻松' when 'balanced' then '均衡' when 'fast' then '紧凑' end end;
 source_name:=case when p_place->>'source'='synthetic_fixture' then case when locale='zh' then '合成样例' else 'synthetic fixture' end else 'AMap' end;
 summary:=case when locale='zh' then format('显式输入：%s天；%s人；关注%s；节奏%s。交通观察：%s，%s。美食、摄影、区域节奏适配、安全、安静程度、酒店价格与空房均未核实；不能据此推荐住宿。',coalesce(i->>'durationDays','未知'),coalesce(i->>'partySize','未知'),interests,pace,source_name,p_place->>'observedAt')
  else format('Explicit input: %s days; %s travellers; interests %s; pace %s. Rail observation: %s, %s. Food, photography, pace suitability, safety, quietness, hotel prices and availability are unverified; this cannot recommend lodging.',coalesce(i->>'durationDays','unknown'),coalesce(i->>'partySize','unknown'),interests,pace,source_name,p_place->>'observedAt') end;
 foreach key in array array['jingan','peoples_square'] loop
  select value into area from jsonb_array_elements(p_place->'areas') where value->>'id'=key;
  if area is null then return null; end if;
  fact:=case when area->'railMinutes'='null'::jsonb then case when locale='zh' then '到上海站交通时间未知' else 'Travel time to Shanghai Railway Station is unknown' end
   when locale='zh' then format('到上海站约%s分钟，%s次换乘',area->>'railMinutes',coalesce(area->>'transfers','未知'))
   else format('About %s minutes and %s transfers to Shanghai Railway Station',area->>'railMinutes',coalesce(area->>'transfers','unknown')) end;
  title:=case when locale='zh' then case key when 'jingan' then '静安寺' else '人民广场' end else case key when 'jingan' then 'Jing''an Temple' else 'People''s Square' end end;
  options:=options||jsonb_build_array(jsonb_build_object('id',key,'title',title,'tradeoff',fact||case when locale='zh' then '；美食/摄影/节奏适配与住宿条件未知。' else '; food/photography/pace suitability and lodging conditions are unknown.' end));
 end loop;
 select coalesce(jsonb_agg(a.value||jsonb_build_object('label',case a.value->>'id' when 'jingan' then 'Jing''an Temple' else 'People''s Square' end) order by n),'[]') into areas from jsonb_array_elements(p_place->'areas') with ordinality a(value,n);
 obs:=p_place||jsonb_build_object('areas',areas);
 foreach key in array array['railMinutes','transfers'] loop
  if exists(select 1 from jsonb_array_elements(p_place->'areas') a where a->key<>'null'::jsonb) then fields:=fields||to_jsonb(key); end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_place->'areas') a where a->'railMinutes'='null'::jsonb) then unknowns:=unknowns||'"rail_minutes"'::jsonb; end if;
 if exists(select 1 from jsonb_array_elements(p_place->'areas') a where a->'transfers'='null'::jsonb) then unknowns:=unknowns||'"transfers"'::jsonb; end if;
 return jsonb_build_object('schemaVersion','qualified-intake-comparison-projection/1','request',i,'binding',binding,'observation',obs,
  'coverage',jsonb_build_object('scope','transport_screening','evidence','not_integrated','observedFields',fields,'unknown',unknowns),
  'content',jsonb_build_object('schemaVersion','comparison/1','title',case when locale='zh' then '上海两区域交通初筛（非住宿推荐）' else 'Shanghai two-area rail screening (not a lodging recommendation)' end,
   'summary',summary,'options',options,'actions','[]'::jsonb),'readyForProvider',false,'readyForPublication',false);
end $$;
revoke all on function turn_private.project_planning_qualified_comparison_v1(uuid,uuid,uuid,text,text,jsonb,text) from public,anon,authenticated,service_role;

create function turn_private.valid_planning_qualified_comparison_v1(
 p_owner uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text,p_place jsonb,p_locale text,p_content jsonb
) returns boolean language plpgsql security definer set search_path='' as $$
declare projection jsonb;
begin
 projection:=turn_private.project_planning_qualified_comparison_v1(p_owner,p_turn,p_lease,p_intake_digest,p_planning_digest,p_place,p_locale);
 return projection is not null and coalesce(projection->'content'=p_content,false);
end $$;
revoke all on function turn_private.valid_planning_qualified_comparison_v1(uuid,uuid,uuid,text,text,jsonb,text,jsonb) from public,anon,authenticated,service_role;
