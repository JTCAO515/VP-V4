create or replace function turn_private.require_text_task()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from turn_private.text_policies where id=NEW.policy_id and context_mode in ('task_history_v1','knowledge_intent_v1'))
    and not exists(select 1 from turn_private.service_task_turns l join turn_private.service_tasks s on s.id=l.task_id
      where l.turn_id=NEW.turn_id and l.owner_id=NEW.owner_id and s.owner_id=NEW.owner_id and s.thread_id=NEW.thread_id
        and s.policy_id=NEW.policy_id and s.consent_id=NEW.consent_id) then raise exception 'DATA_POLICY_BLOCKED'; end if;
  if exists(select 1 from turn_private.text_policies where id=NEW.policy_id and context_mode='knowledge_intent_v1')
    and not exists(select 1 from turn_private.grounded_turns g where g.turn_id=NEW.turn_id and g.owner_id=NEW.owner_id and g.locale=NEW.locale) then raise exception 'DATA_POLICY_BLOCKED'; end if;
  return NEW;
end $$;
