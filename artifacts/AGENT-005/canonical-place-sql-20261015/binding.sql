create or replace function place_actions_private.ask_proof_shape_v1(v jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(place_actions_private.exact_v1(v,array['schemaVersion','operationId','scopeKind','scopeId','operation','requestDigest','expectation','basis','originalReceipt'])
 and place_actions_private.ask_expectation_shape_v1(v->'expectation')
 and place_actions_private.exact_v1(v->'operation',array['operationId','scopeKind','scopeId','messageId','turnId'])
 and v->'operation'->'operationId'=v->'operationId' and v->'operation'->'scopeId'=v->'scopeId' and v->'operation'->'scopeKind'=v->'scopeKind'
 and v->'operation'->'messageId'='null'::jsonb and v->'operation'->'turnId'=v->'originalReceipt'->'turnId'
 and v->'basis'->'city' is not null and v->'expectation'->'locale' is not null
 and v->>'schemaVersion'='canonical-place-proof/1' and v->>'scopeKind'='thread'
 and place_actions_private.ask_uuid_v1(v->'operationId') and place_actions_private.ask_uuid_v1(v->'scopeId')
 and jsonb_typeof(v->'requestDigest')='string' and v->>'requestDigest' ~ '^[a-f0-9]{64}$'
 and place_actions_private.exact_v1(v->'basis',array['subjectId','city','scene','sourceDigest'])
 and v->'basis'->>'city' in('shanghai','beijing','guangzhou','chongqing')
 and jsonb_typeof(v->'basis'->'subjectId')='string' and length(v->'basis'->>'subjectId') between 1 and 160
 and jsonb_typeof(v->'basis'->'scene')='string' and length(v->'basis'->>'scene') between 1 and 80
 and jsonb_typeof(v->'basis'->'sourceDigest')='string' and v->'basis'->>'sourceDigest' ~ '^[a-f0-9]{64}$'
 and place_actions_private.exact_v1(v->'originalReceipt',array['version','kind','turnId','reused','serviceTaskId','scopeVersion','relationship','parentTurnId'])
 and v->'originalReceipt'->>'kind'='accepted' and v->'originalReceipt'->'version'='2'::jsonb
 and v->'originalReceipt'->'reused'='false'::jsonb
 and place_actions_private.ask_uuid_v1(v->'originalReceipt'->'turnId') and place_actions_private.ask_uuid_v1(v->'originalReceipt'->'serviceTaskId')
 and v->'originalReceipt'->'scopeVersion'='1'::jsonb and v->'originalReceipt'->>'relationship' in('new_goal','clarification','repair')
 and (v->'originalReceipt'->'parentTurnId'='null'::jsonb or place_actions_private.ask_uuid_v1(v->'originalReceipt'->'parentTurnId'))
 and ((v->'originalReceipt'->>'relationship'='new_goal')=(v->'originalReceipt'->'parentTurnId'='null'::jsonb)),false)
$$;
revoke all on function place_actions_private.ask_proof_shape_v1(jsonb) from public,anon,authenticated,service_role;
alter table turn_private.grounded_turns add column selected_place_request jsonb;
alter table turn_private.grounded_turns add constraint grounded_selected_place_request_shape check(selected_place_request is null or place_actions_private.ask_proof_shape_v1(selected_place_request));

create or replace function place_actions_private.ask_root_current_v1(tid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare g turn_private.grounded_turns%rowtype;c turn_private.text_content%rowtype;w turn_private.work%rowtype;p jsonb;b jsonb;begin
 select * into g from turn_private.grounded_turns where turn_id=tid;
 if not found or g.selected_place_request is null then return null;end if;
 p:=g.selected_place_request;
 if not place_actions_private.ask_proof_shape_v1(p) then return null;end if;
 select * into w from turn_private.work where turn_id=tid and owner_id=g.owner_id;
 if not found then return null;end if;
 if exists(select 1 from identity_private.mobile_attempts where session_id=w.session_id) and not exists(select 1 from identity_private.mobile_attempts x join identity_private.mobile_accounts a on a.owner_id=x.owner_id and a.session_id=x.session_id and a.epoch=x.epoch where x.owner_id=g.owner_id and x.session_id=w.session_id) then return null;end if;

 select * into c from turn_private.text_content where turn_id=tid and owner_id=g.owner_id and hidden_at is null;
 if not found or not turn_private.text_policy_current(c.policy_id)
 or not exists(select 1 from turn_private.text_consents where owner_id=g.owner_id and policy_id=c.policy_id and consent_id=c.consent_id and revoked_at is null)
 or exists(select 1 from public.turns where id=tid and status='cancelled') or exists(select 1 from turn_private.work where turn_id=tid and state='cancelled')
 or not exists(select 1 from turn_private.service_task_turns st join turn_private.service_tasks t on t.id=st.task_id and t.owner_id=st.owner_id
 join turn_private.text_content root on root.turn_id=t.goal_turn_id and root.owner_id=t.owner_id and root.hidden_at is null
 where st.turn_id=tid and st.owner_id=g.owner_id and st.task_id=g.task_id and st.idempotency_key=(p->>'operationId')::uuid
 and st.relationship=p->'originalReceipt'->>'relationship' and st.parent_turn_id is not distinct from (p->'originalReceipt'->>'parentTurnId')::uuid
 and t.thread_id=(p->>'scopeId')::uuid and c.thread_id=t.thread_id and t.policy_id=c.policy_id and t.consent_id=c.consent_id
 and st.request_digest=encode(sha256(convert_to(jsonb_build_array(c.thread_id,c.turn_id,st.idempotency_key,c.policy_id,c.locale,c.input_text,t.id,t.scope_version,st.relationship,st.parent_turn_id)::text,'UTF8')),'hex'))
 or p->'originalReceipt'->>'turnId' is distinct from tid::text or p->'originalReceipt'->>'serviceTaskId' is distinct from g.task_id::text
 or g.city is distinct from p->'basis'->>'city' or g.locale is distinct from p->'expectation'->>'locale' then return null;end if;
 -- Stored proof is a witness, never a grant. Requalify the original source chain.
 begin b:=place_actions_private.ask_basis_v1(g.owner_id,w.session_id,p->'expectation');
 exception when raise_exception then return null;end;
 if b is distinct from p->'basis' then return null;end if;
 return p;
end $$;
revoke all on function place_actions_private.ask_root_current_v1(uuid) from public,anon,authenticated,service_role;

create or replace function place_actions_private.ask_bound_v1(tid uuid,token uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare g turn_private.grounded_turns%rowtype;c turn_private.text_content%rowtype;w turn_private.work%rowtype;p jsonb;b jsonb;begin
 select * into g from turn_private.grounded_turns where turn_id=tid;
 if not found or g.selected_place_request is null then return null;end if;
 p:=g.selected_place_request;
 if not place_actions_private.ask_proof_shape_v1(p) then return null;end if;
 select * into w from turn_private.work where turn_id=tid and owner_id=g.owner_id;
 if not found then return null;end if;
 if exists(select 1 from identity_private.mobile_attempts where session_id=w.session_id) and not exists(select 1 from identity_private.mobile_attempts x join identity_private.mobile_accounts a on a.owner_id=x.owner_id and a.session_id=x.session_id and a.epoch=x.epoch where x.owner_id=g.owner_id and x.session_id=w.session_id) then return null;end if;
 if token is null then
  if auth.uid() is distinct from g.owner_id or auth.jwt()->>'session_id' is distinct from w.session_id::text then return null;end if;
  perform turn_private.text_owner();
  if not turn_private.lock_turn(tid,g.owner_id,w.session_id) then return null;end if;
 else
  if not turn_private.lock_text_work(tid,token) then return null;end if;
 end if;
 select * into c from turn_private.text_content where turn_id=tid and owner_id=g.owner_id and hidden_at is null;
 if not found or not turn_private.text_policy_current(c.policy_id)
 or not exists(select 1 from turn_private.text_consents where owner_id=g.owner_id and policy_id=c.policy_id and consent_id=c.consent_id and revoked_at is null)
 or exists(select 1 from public.turns where id=tid and status='cancelled') or exists(select 1 from turn_private.work where turn_id=tid and state='cancelled')
 or not exists(select 1 from turn_private.service_task_turns st join turn_private.service_tasks t on t.id=st.task_id and t.owner_id=st.owner_id
 join turn_private.text_content root on root.turn_id=t.goal_turn_id and root.owner_id=t.owner_id and root.hidden_at is null
 where st.turn_id=tid and st.owner_id=g.owner_id and st.task_id=g.task_id and st.idempotency_key=(p->>'operationId')::uuid
 and st.relationship=p->'originalReceipt'->>'relationship' and st.parent_turn_id is not distinct from (p->'originalReceipt'->>'parentTurnId')::uuid
 and t.thread_id=(p->>'scopeId')::uuid and c.thread_id=t.thread_id and t.policy_id=c.policy_id and t.consent_id=c.consent_id
 and st.request_digest=encode(sha256(convert_to(jsonb_build_array(c.thread_id,c.turn_id,st.idempotency_key,c.policy_id,c.locale,c.input_text,t.id,t.scope_version,st.relationship,st.parent_turn_id)::text,'UTF8')),'hex'))
 or p->'originalReceipt'->>'turnId' is distinct from tid::text or p->'originalReceipt'->>'serviceTaskId' is distinct from g.task_id::text
 or g.city is distinct from p->'basis'->>'city' or g.locale is distinct from p->'expectation'->>'locale' then return null;end if;
 -- Stored proof is a witness, never a grant. Requalify the original source chain.
 begin b:=place_actions_private.ask_basis_v1(g.owner_id,w.session_id,p->'expectation');
 exception when raise_exception then return null;end;
 if b is distinct from p->'basis' then return null;end if;
 return p;
end $$;
revoke all on function place_actions_private.ask_bound_v1(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function place_actions_private.ask_receipt_v1(tid uuid,p jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('schemaVersion','canonical-place-ask/1','kind','accepted','operation',p->'operation','originalReceipt',p->'originalReceipt',
 'binding',jsonb_build_object('turnId',tid,'serviceTaskId',p->'originalReceipt'->'serviceTaskId','goalId',null,'goalVersion',null,'requestDigest',p->'requestDigest','expectation',p->'expectation'),
 'readyForProvider',false,'currentEligibilityRequiresRead',true)
$$;
revoke all on function place_actions_private.ask_receipt_v1(uuid,jsonb) from public,anon,authenticated,service_role;

create or replace function place_actions_private.ask_submit_v1(request_bytes text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=place_actions_private.actor_v1();s uuid:=(auth.jwt()->>'session_id')::uuid;v jsonb:=request_bytes::jsonb;r jsonb:=v->'submission';e jsonb:=v->'expectation';b jsonb;old turn_private.grounded_turns%rowtype;receipt jsonb;p jsonb;tid uuid;begin
 if not place_actions_private.exact_v1(v,array['schemaVersion','submission','expectation']) or v->>'schemaVersion' is distinct from 'canonical-place-ask/1' or octet_length(request_bytes)>24000 then raise exception 'INVALID_INPUT';end if;
 -- The original assistant envelope does not admit a Task Turn. Do not invent one.
 if r ? 'conversationId' then return jsonb_build_object('schemaVersion','canonical-place-ask/1','kind','unavailable','reason','original_submission_unsupported','readyForProvider',false);end if;
 if not place_actions_private.exact_v1(r,array['threadId','turnId','idempotencyKey','policyId','locale','text','serviceTask'])
 or not place_actions_private.exact_v1(r->'serviceTask',array['id','scopeVersion','relationship','parentTurnId'])
 or not place_actions_private.ask_uuid_v1(r->'threadId') or not place_actions_private.ask_uuid_v1(r->'turnId') or not place_actions_private.ask_uuid_v1(r->'idempotencyKey')
 or not place_actions_private.ask_uuid_v1(r->'policyId') or not place_actions_private.ask_uuid_v1(r->'serviceTask'->'id')
 or r->'serviceTask'->'scopeVersion' is distinct from '1'::jsonb
 or coalesce(r->'serviceTask'->>'relationship','') not in('new_goal','clarification','repair')
 or ((r->'serviceTask'->>'relationship'='new_goal') is distinct from (r->'serviceTask'->'parentTurnId'='null'::jsonb))
 or (r->'serviceTask'->'parentTurnId'<>'null'::jsonb and not place_actions_private.ask_uuid_v1(r->'serviceTask'->'parentTurnId'))
 or jsonb_typeof(r->'text') is distinct from 'string' or not turn_private.valid_text(r->>'text',4000)
 or coalesce(r->>'locale','') not in('zh','en') or r->'locale' is distinct from e->'locale' then raise exception 'INVALID_INPUT';end if;
 tid:=(r->>'turnId')::uuid;
 -- Account/auth first, mobile UPDATE then 34, then operation/root/Trip/context.
 perform 1 from identity_private.mobile_accounts where owner_id=u for update;
 perform pg_advisory_xact_lock(hashtextextended(u::text,34));
 perform pg_advisory_xact_lock(hashtextextended('selected-place:'||u::text||':'||(r->>'idempotencyKey'),0));
 select g.* into old from turn_private.grounded_turns g where owner_id=u and (selected_place_request->>'operationId')::uuid=(r->>'idempotencyKey')::uuid;
 if found then
  if old.turn_id<>tid or old.selected_place_request->>'requestDigest'<>encode(sha256(convert_to(request_bytes,'UTF8')),'hex') then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
  if place_actions_private.ask_bound_v1(tid,null) is null then raise exception 'DATA_POLICY_BLOCKED';end if;
  return place_actions_private.ask_receipt_v1(tid,old.selected_place_request);
 end if;
 -- Reject prior admission rather than attaching to already committed ordinary work.
 if exists(select 1 from public.turns where id=tid) or exists(select 1 from turn_private.text_content where turn_id=tid)
 or exists(select 1 from turn_private.service_task_turns where owner_id=u and idempotency_key=(r->>'idempotencyKey')::uuid) then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
 -- Original admission chooses and meters exactly one Task, retaining all original semantics.
 receipt:=public.submit_service_task_turn((r->>'threadId')::uuid,tid,(r->>'idempotencyKey')::uuid,(r->>'policyId')::uuid,r->>'locale',r->>'text',
 (r->'serviceTask'->>'id')::uuid,(r->'serviceTask'->>'scopeVersion')::integer,r->'serviceTask'->>'relationship',(r->'serviceTask'->>'parentTurnId')::uuid);
 if receipt->>'kind' is distinct from 'accepted' or receipt->'reused' is distinct from 'false'::jsonb then raise exception 'SERVICE_TASK_CONFLICT';end if;
 -- Current-input policy only: no additional source facts/caption enter any model prompt.
 if not exists(select 1 from turn_private.text_policies where id=(r->>'policyId')::uuid and context_mode='current_input_v1') then raise exception 'DATA_POLICY_BLOCKED';end if;
 b:=place_actions_private.ask_basis_v1(u,s,e);
 -- Match the original Native v2 receipt projection; retain its actual identities/relationship.
 receipt:=jsonb_build_object('version',2,'kind',receipt->'kind','turnId',receipt->'turnId','reused',receipt->'reused','serviceTaskId',receipt->'serviceTaskId','scopeVersion',receipt->'scopeVersion','relationship',receipt->'relationship','parentTurnId',receipt->'parentTurnId');
 p:=jsonb_build_object('schemaVersion','canonical-place-proof/1','operationId',(r->>'idempotencyKey')::uuid,'scopeKind','thread','scopeId',(r->>'threadId')::uuid,'operation',jsonb_build_object('operationId',(r->>'idempotencyKey')::uuid,'scopeKind','thread','scopeId',(r->>'threadId')::uuid,'messageId',null,'turnId',tid),'requestDigest',encode(sha256(convert_to(request_bytes,'UTF8')),'hex'),'expectation',e,'basis',b,'originalReceipt',receipt);
 insert into turn_private.grounded_turns(turn_id,owner_id,task_id,city,locale,selected_place_request) values(tid,u,(r->'serviceTask'->>'id')::uuid,b->>'city',r->>'locale',p);
 if place_actions_private.ask_bound_v1(tid,null) is null then raise exception 'DATA_POLICY_BLOCKED';end if;
 return place_actions_private.ask_receipt_v1(tid,p);
exception when raise_exception then
 if SQLERRM in('PLACE_ASK_SOURCE_UNAVAILABLE','PLACE_ASK_SELECTION_AMBIGUOUS') then
  return jsonb_build_object('schemaVersion','canonical-place-ask/1','kind','unavailable','reason',case SQLERRM when 'PLACE_ASK_SELECTION_AMBIGUOUS' then 'selection_ambiguous' else 'source_unavailable' end,'readyForProvider',false);
 end if;raise;
end $$;
revoke all on function place_actions_private.ask_submit_v1(text) from public,anon,authenticated,service_role;

create or replace function place_actions_private.ask_read_v1(v jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=place_actions_private.actor_v1();g turn_private.grounded_turns%rowtype;p jsonb;current_n jsonb;begin
 if not place_actions_private.exact_v1(v,array['operationId','scopeKind','scopeId','messageId','turnId']) or not place_actions_private.ask_uuid_v1(v->'operationId') or not place_actions_private.ask_uuid_v1(v->'scopeId') or v->>'scopeKind' not in('thread','conversation') or (v->>'scopeKind'='thread' and (v->'messageId'<>'null'::jsonb or not place_actions_private.ask_uuid_v1(v->'turnId'))) or (v->>'scopeKind'='conversation' and (not place_actions_private.ask_uuid_v1(v->'messageId') or (v->'turnId'<>'null'::jsonb and not place_actions_private.ask_uuid_v1(v->'turnId')))) then raise exception 'INVALID_INPUT';end if;
 v:=jsonb_set(jsonb_set(jsonb_set(v,'{operationId}',to_jsonb((v->>'operationId')::uuid)),'{scopeId}',to_jsonb((v->>'scopeId')::uuid)),'{turnId}',coalesce(to_jsonb((v->>'turnId')::uuid),'null'::jsonb));
 select * into g from turn_private.grounded_turns where owner_id=u and selected_place_request->'operationId'=v->'operationId' and selected_place_request->'scopeKind'=v->'scopeKind' and selected_place_request->'scopeId'=v->'scopeId';
 if not found then
 if exists(select 1 from turn_private.grounded_turns where selected_place_request->'operationId'=v->'operationId')
 or exists(select 1 from turn_private.service_task_turns where idempotency_key=(v->>'operationId')::uuid and owner_id<>u)
 or exists(select 1 from public.turns where id=(v->>'turnId')::uuid and owner_id<>u) then raise exception 'FORBIDDEN';end if;
 -- Erasure deletes the sensitive proof, not the authoritative admission/fences.
 -- A missing proof is never evidence that this original operation did not commit.
 if exists(select 1 from turn_private.service_task_turns where owner_id=u and idempotency_key=(v->>'operationId')::uuid)
 or exists(select 1 from turn_private.assistant_messages where owner_id=u and idempotency_key=(v->>'operationId')::uuid)
 or exists(select 1 from public.turns where id=(v->>'turnId')::uuid and owner_id=u)
 or (v->>'turnId' is not null and turn_data_private.fenced_v1('turnIds',(v->>'turnId')::uuid)) then
  return jsonb_build_object('schemaVersion','canonical-place-ask/1','kind','unknown','operation',v,'readyForProvider',false);
 end if;
 return jsonb_build_object('schemaVersion','canonical-place-ask/1','kind','not_submitted','operation',v,'readyForProvider',false);end if;
 if g.selected_place_request->'operation' is distinct from v or not exists(select 1 from turn_private.work where turn_id=g.turn_id and session_id=(auth.jwt()->>'session_id')::uuid) then raise exception 'FORBIDDEN';end if;
 p:=place_actions_private.ask_bound_v1(g.turn_id,null);
 current_n:=case when p is null then jsonb_build_object('kind','unavailable','reason','source_unavailable') else jsonb_build_object('kind','pending') end;
 if p is not null then
  current_n:=public.read_grounded_turn(g.turn_id);
  current_n:=case when current_n->>'kind'='grounded_turn' and current_n->'result'->>'projection'='pending' then jsonb_build_object('kind','pending') when current_n->>'kind'='grounded_turn' and current_n->'result'->>'projection'='current' then jsonb_build_object('kind','grounded','turn',current_n) else jsonb_build_object('kind','unavailable','reason','source_unavailable') end;
 end if;
 return jsonb_build_object('schemaVersion','canonical-place-ask/1','kind','recovered','operation',v,'receipt',place_actions_private.ask_receipt_v1(g.turn_id,g.selected_place_request),'current',current_n,'readyForProvider',false);
end $$;
revoke all on function place_actions_private.ask_read_v1(jsonb) from public,anon,authenticated,service_role;
