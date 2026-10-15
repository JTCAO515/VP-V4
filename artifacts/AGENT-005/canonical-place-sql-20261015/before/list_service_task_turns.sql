CREATE OR REPLACE FUNCTION public.list_service_task_turns(p_policy_id uuid, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=turn_private.text_owner(); base jsonb; rows jsonb;
begin
  base:=public.list_text_turns(p_policy_id,p_limit);
  if base->>'kind'<>'history' then return base; end if;
  select coalesce(jsonb_agg(e.value||jsonb_build_object('serviceTaskId',s.id,'scopeVersion',s.scope_version,
    'relationship',l.relationship,'parentTurnId',l.parent_turn_id) order by e.ordinality),'[]'::jsonb) into rows
  from jsonb_array_elements(base->'turns') with ordinality e(value,ordinality)
    join turn_private.service_task_turns l on l.turn_id=(e.value->>'turnId')::uuid and l.owner_id=u
    join turn_private.service_tasks s on s.id=l.task_id and s.owner_id=u
    join turn_private.text_content g on g.turn_id=s.goal_turn_id and g.hidden_at is null
    join public.turns t on t.id=g.turn_id and t.owner_id=u;
  return jsonb_build_object('kind','history','turns',rows);
end $function$
