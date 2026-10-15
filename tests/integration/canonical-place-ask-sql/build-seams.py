from pathlib import Path
root=Path('artifacts/AGENT-005/canonical-place-sql-20261015');out=root/'after';out.mkdir(exist_ok=True)
def change(name,fn):
 s=(root/'before'/f'{name}.sql').read_text();a=fn(s);assert a!=s,name;(out/f'{name}.sql').write_text(a+';\n')
def begin(s,text):return s.replace('\nbegin\n','\nbegin\n'+text+'\n',1)
change('grounded_ai_assist_work_v1',lambda s:begin(s,"  if p_input->>'action'='selected_submit' then\n    if not place_actions_private.exact_v1(p_input,array['action','requestBytes']) or jsonb_typeof(p_input->'requestBytes') is distinct from 'string' then raise exception 'INVALID_INPUT';end if;\n    return place_actions_private.ask_submit_v1(p_input->>'requestBytes');\n  elsif p_input->>'action'='selected_read' then\n    if not place_actions_private.exact_v1(p_input,array['action','operation']) then raise exception 'INVALID_INPUT';end if;\n    return place_actions_private.ask_read_v1(p_input->'operation');\n  end if;"))
for name in ['read_grounded_work','authorize_grounded_dispatch','complete_grounded_place_work','turn_private.complete_selected_grounded_work','read_grounded_turn']:
 def patch(s):
  token='null' if name=='read_grounded_turn' else 'p_lease_token'
  s=begin(s,f" if exists(select 1 from turn_private.grounded_turns where turn_id=p_turn_id and selected_place_request is not null) and place_actions_private.ask_bound_v1(p_turn_id,{token}) is null then return jsonb_build_object('kind','blocked');end if;")
  if name=='read_grounded_work':s=s.replace("id=c.policy_id and context_mode='knowledge_intent_v1'","id=c.policy_id and (context_mode='knowledge_intent_v1' or (context_mode='current_input_v1' and exists(select 1 from turn_private.grounded_turns where turn_id=p_turn_id and selected_place_request is not null)))")
  if name=='turn_private.complete_selected_grounded_work':
   s=begin(s," if exists(select 1 from turn_private.grounded_turns where turn_id=p_turn_id and selected_place_request is not null) and knowledge_review_private.question_definition(p_intent) is not null and (p_intent not in('place_address','place_opening_hours','place_address_and_hours') or p_subject is distinct from (select selected_place_request->'basis'->>'subjectId' from turn_private.grounded_turns where turn_id=p_turn_id)) then return jsonb_build_object('kind','blocked');end if;")
   s=s.replace("p.context_mode='knowledge_intent_v1' where g0.turn_id=p_turn_id","(p.context_mode='knowledge_intent_v1' or (p.context_mode='current_input_v1' and g0.selected_place_request is not null)) where g0.turn_id=p_turn_id")
   # Resolver waits may outlive qualifications: re-read before immutable writes.
   s=s.replace(" select * into w from turn_private.work where turn_id=p_turn_id;"," if exists(select 1 from turn_private.grounded_turns where turn_id=p_turn_id and selected_place_request is not null) and place_actions_private.ask_bound_v1(p_turn_id,p_lease_token) is null then return jsonb_build_object('kind','blocked');end if;\n select * into w from turn_private.work where turn_id=p_turn_id;")
  if name=='complete_grounded_place_work':s=begin(s," if exists(select 1 from turn_private.grounded_turns where turn_id=p_turn_id and selected_place_request is not null) then return place_actions_private.ask_complete_v1(p_turn_id,p_lease_token,p_intent,p_request_scope,p_unanswered_needs,p_place_name);end if;")
  if name=='read_grounded_turn':s=s.replace("expected_result='reviewed_answer'","(expected_result='reviewed_answer' or (expected_result='text_answer' and g.selected_place_request is not null))")
  return s
 change(name,patch)
def claim(s):
 anchor='p.context_mode=p_context_mode';assert anchor in s
 s=s.replace(anchor,"((p.context_mode=p_context_mode and not exists(select 1 from turn_private.grounded_turns g where g.turn_id=q.turn_id and g.selected_place_request is not null)) or (p_context_mode='knowledge_intent_v1' and p.context_mode='current_input_v1' and exists(select 1 from turn_private.grounded_turns g where g.turn_id=q.turn_id and g.selected_place_request is not null)))")
 anchor="    update turn_private.work set state='leased'";assert anchor in s
 return s.replace(anchor,"    if exists(select 1 from turn_private.grounded_turns where turn_id=w.turn_id and selected_place_request is not null) and not place_actions_private.ask_claim_current_v1(w.turn_id) then return jsonb_build_object('kind','empty');end if;\n"+anchor)
change('turn_private.claim_text_mode',claim)

for name in ['read_text_work','authorize_text_dispatch','authorize_text_task_dispatch','complete_text_work']:
 change(name,lambda s:begin(s," if exists(select 1 from turn_private.grounded_turns where turn_id=p_turn_id and selected_place_request is not null) then return jsonb_build_object('kind','blocked');end if;"))
