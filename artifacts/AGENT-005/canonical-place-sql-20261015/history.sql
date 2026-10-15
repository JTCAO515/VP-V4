create or replace function place_actions_private.ask_history_root_v1(tid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare g turn_private.grounded_turns%rowtype;c turn_private.text_content%rowtype;w turn_private.work%rowtype;p jsonb;b jsonb;begin
 select * into g from turn_private.grounded_turns where turn_id=tid;
 if not found or g.selected_place_request is null then return null;end if;
 p:=g.selected_place_request;
 if not place_actions_private.ask_proof_shape_v1(p) then return null;end if;
 select * into w from turn_private.work where turn_id=tid and owner_id=g.owner_id;
 if not found then return null;end if;
 if exists(select 1 from identity_private.mobile_attempts where session_id=w.session_id) and not exists(select 1 from identity_private.mobile_attempts x join identity_private.mobile_accounts a on a.owner_id=x.owner_id and a.session_id=x.session_id and a.epoch=x.epoch where x.owner_id=g.owner_id and x.session_id=w.session_id) then return null;end if;
 if auth.uid() is distinct from g.owner_id or auth.jwt()->>'session_id' is distinct from w.session_id::text then return null;end if;
 perform turn_private.text_owner();
 if not turn_private.lock_trip_account_v1(g.owner_id) then return null;end if;
 perform pg_advisory_xact_lock(hashtextextended(g.owner_id::text,34));
 if not turn_private.lock_turn(tid,g.owner_id,w.session_id) then return null;end if;
 select * into c from turn_private.text_content where turn_id=tid and owner_id=g.owner_id and hidden_at is null;
 if not found or not turn_private.text_policy_current(c.policy_id)
 or not exists(select 1 from turn_private.text_consents where owner_id=g.owner_id and policy_id=c.policy_id and consent_id=c.consent_id and revoked_at is null)

 or not exists(select 1 from turn_private.service_task_turns st join turn_private.service_tasks t on t.id=st.task_id and t.owner_id=st.owner_id
 join turn_private.text_content root on root.turn_id=t.goal_turn_id and root.owner_id=t.owner_id and root.hidden_at is null
 where st.turn_id=tid and st.owner_id=g.owner_id and st.task_id=g.task_id and st.idempotency_key=(p->>'operationId')::uuid
 and st.relationship=p->'originalReceipt'->>'relationship' and st.parent_turn_id is not distinct from (p->'originalReceipt'->>'parentTurnId')::uuid
 and t.thread_id=(p->>'scopeId')::uuid and c.thread_id=t.thread_id and t.policy_id=c.policy_id and t.consent_id=c.consent_id
 and st.request_digest=encode(sha256(convert_to(jsonb_build_array(c.thread_id,c.turn_id,st.idempotency_key,c.policy_id,c.locale,c.input_text,t.id,t.scope_version,st.relationship,st.parent_turn_id)::text,'UTF8')),'hex'))
 or p->'originalReceipt'->>'turnId' is distinct from tid::text or p->'originalReceipt'->>'serviceTaskId' is distinct from g.task_id::text
 or g.city is distinct from p->'basis'->>'city' or g.locale is distinct from p->'expectation'->>'locale' then return null;end if;
 -- Root ownership is retained data authority only, never current fact permission.
 return p;
end $$;
revoke all on function place_actions_private.ask_history_root_v1(uuid) from public,anon,authenticated,service_role;

-- Only a currently qualified selected proof may add the existing GroundedResult
-- to an ordinary Task read/history row. Plain NULL rows retain their old bytes.
create or replace function place_actions_private.ask_text_projection_v1(tid uuid,history_row boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb;p jsonb;g turn_private.grounded_turns%rowtype;c turn_private.text_content%rowtype;state_n text;begin
 if not exists(select 1 from turn_private.grounded_turns where turn_id=tid and selected_place_request is not null) then return null;end if;
 p:=place_actions_private.ask_history_root_v1(tid);
 if p is null then return null;end if;
 q:=public.read_grounded_turn(tid);
 -- Source reads may wait; retained metadata still needs current Root authority.
 p:=place_actions_private.ask_history_root_v1(tid);
 if p is null then return null;end if;
 if q->>'kind' is distinct from 'grounded_turn' or coalesce(q->'result'->>'projection','') not in('pending','current') then
  select * into g from turn_private.grounded_turns where turn_id=tid and owner_id=auth.uid();
  select * into c from turn_private.text_content where turn_id=tid and owner_id=auth.uid() and hidden_at is null;
  select status into state_n from public.turns where id=tid and owner_id=auth.uid();
  q:=jsonb_build_object('kind','grounded_turn','turnId',tid,'threadId',c.thread_id,'locale',c.locale,'input',c.input_text,'outcome',c.output_kind,'output',c.output_text,'status',state_n,'createdAt',c.created_at,
   'result',jsonb_build_object('type','reviewed_answer','city',g.city,'intent',g.intent,'requestScope',g.request_scope,'unansweredNeeds',g.unanswered_needs,'placeSubjectId',g.place_subject_id,'placeName',g.place_name,'placeResolution',g.place_resolution,'originalOutcome',g.original_outcome,'completedAt',g.completed_at,'projection','unavailable','knowledge',null));
 end if;
 if history_row then
  return jsonb_build_object('turnId',q->'turnId','threadId',q->'threadId','locale',q->'locale','input',q->'input','outcome',q->'outcome','output',q->'output','status',q->'status','createdAt',q->'createdAt','result',q->'result','canonicalPlaceProof',p);
 end if;
 return jsonb_build_object('kind','text','schemaVersion','text-turn-v1','turnId',q->'turnId','locale',q->'locale','input',q->'input','outcome',q->'outcome','output',q->'output','result',q->'result','canonicalPlaceProof',p);
end $$;
revoke all on function place_actions_private.ask_text_projection_v1(uuid,boolean) from public,anon,authenticated,service_role;
