-- Project orphaned terminal work without rewriting public Turn/event history.
create or replace function public.read_grounded_turn(p_turn_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); g turn_private.grounded_turns%rowtype; c turn_private.text_content%rowtype;
 s turn_private.service_tasks%rowtype; l turn_private.service_task_turns%rowtype; answer jsonb; failure text; projection text; effective_status text; work_state text;
begin
 if not turn_private.lock_turn(p_turn_id,u,(auth.jwt()->>'session_id')::uuid) then return jsonb_build_object('kind','unavailable'); end if;
 select * into c from turn_private.text_content where turn_id=p_turn_id and owner_id=u and hidden_at is null;
 if not found or not turn_private.text_policy_current(c.policy_id) then return jsonb_build_object('kind','unavailable'); end if;
 perform 1 from turn_private.text_consents where owner_id=u and policy_id=c.policy_id and consent_id=c.consent_id and revoked_at is null for share;
 if not found then return jsonb_build_object('kind','unavailable'); end if;
 select * into g from turn_private.grounded_turns where turn_id=p_turn_id and owner_id=u;
 if not found then return jsonb_build_object('kind','unavailable'); end if;
 select * into s from turn_private.service_tasks where id=g.task_id and owner_id=u and policy_id=c.policy_id and consent_id=c.consent_id and expected_result='reviewed_answer';
 if not found or not exists(select 1 from turn_private.text_content x join public.turns t on t.id=x.turn_id and t.owner_id=u where x.turn_id=s.goal_turn_id and x.hidden_at is null) then return jsonb_build_object('kind','unavailable'); end if;
 select * into l from turn_private.service_task_turns where turn_id=p_turn_id and task_id=s.id and owner_id=u;
 if not found then return jsonb_build_object('kind','unavailable'); end if;
 select status into effective_status from public.turns where id=c.turn_id and owner_id=u;
 if g.completed_at is null and effective_status in ('accepted','planning','retrieving','generating','validating') then
  select state into work_state from turn_private.work where turn_id=c.turn_id and owner_id=u;
  if work_state='cancelled' then effective_status:='cancelled';
  elsif work_state in ('failed','quarantined') then effective_status:='failed'; end if;
 end if;
 projection:=case when g.completed_at is null then 'pending' else 'current' end;
 if knowledge_review_private.question_definition(g.intent) is not null then
  begin
   answer:=knowledge_review_private.resolve_question(jsonb_build_object('questionId',g.intent,'questionVersion',1,'city',g.city,'locale',g.locale),g.basis)-'_basis';
  exception when raise_exception then
   get stacked diagnostics failure=MESSAGE_TEXT;
   if failure not in ('KNOWLEDGE_DISABLED','KNOWLEDGE_CAPACITY','KNOWLEDGE_SNAPSHOT_CHANGED') then raise; end if;
   projection:='unavailable';answer:=null;
  end;
 end if;
 return jsonb_build_object('kind','grounded_turn','schemaVersion','grounded-turn/1','turnId',c.turn_id,'threadId',c.thread_id,
  'locale',c.locale,'input',c.input_text,'outcome',c.output_kind,'output',c.output_text,'status',effective_status,'createdAt',c.created_at,
  'serviceTaskId',s.id,'scopeVersion',s.scope_version,'relationship',l.relationship,'parentTurnId',l.parent_turn_id,
  'result',jsonb_build_object('type','reviewed_answer','city',g.city,'intent',g.intent,'requestScope',g.request_scope,
    'originalOutcome',g.original_outcome,'completedAt',g.completed_at,'projection',projection,'knowledge',answer));
end $$;

notify pgrst, 'reload schema';
