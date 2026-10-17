-- Fixed final shape for the selected read/session contract, not historical apply.
alter table public.turns add column thread_id uuid references public.chat_threads(id) on delete cascade;
alter table public.turns add column updated_at timestamptz not null default now();
alter table public.turns drop constraint turns_status_check;
alter table public.turns add constraint turns_status_check check(status in ('accepted','planning','retrieving','generating','validating','completed','proposal_ready','unavailable','failed','cancelled'));
alter table turn_private.text_policies add column context_mode text not null default 'current_input_v1' check(context_mode in ('current_input_v1','task_history_v1','knowledge_intent_v1','qa_session_history_v1'));
alter table turn_private.service_task_turns drop constraint service_task_turns_relationship_check;
alter table turn_private.service_task_turns add constraint service_task_turns_relationship_check check(relationship in ('new_goal','clarification','repair','qa_followup','qa_correction'));
create index baseline_threads_owner on public.chat_threads(owner_id,updated_at desc);
create index baseline_turns_thread on public.turns(thread_id,created_at);
create index baseline_content_thread on turn_private.text_content(thread_id);
alter table turn_private.work add column execution_mode text not null default 'text' check(execution_mode in ('text','planning_comparison_v1'));
alter table turn_private.service_tasks add column capacity_enforced boolean not null default false;
alter table turn_private.grounded_turns add column selected_place_request jsonb;
