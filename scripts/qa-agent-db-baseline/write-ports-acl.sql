-- Original closed QA public and worker ports. No non-QA writer is exposed.
grant execute on function public.qa_submit_message_v1(uuid,uuid,uuid,uuid,text,text,uuid,text),public.qa_cancellation_v1(text,uuid,uuid) to authenticated;
grant execute on function public.qa_ready_groups_v3(integer,text,text,text,uuid,uuid,uuid,text),public.qa_claim_work_v1(uuid,uuid),public.qa_read_work_v1(uuid,uuid),public.qa_authorize_dispatch_v1(uuid,uuid,uuid,uuid,text,text),public.qa_authorize_dispatch_v2(uuid,uuid,uuid,uuid,text,text,uuid,text),public.qa_complete_work_v1(uuid,uuid,text,text),public.reserve_model_budget(uuid,uuid,uuid,uuid,text,text,text,bigint),public.dispatch_model_budget(uuid,uuid,uuid),public.finish_model_budget(uuid,uuid,uuid,text,bigint),public.read_hosted_worker_status(),public.hosted_worker_heartbeat(uuid,text,timestamptz,text,text,bigint,bigint,bigint,bigint,text) to service_role;
grant select,insert,update on public.model_budget_scopes,public.model_budget_provider_limits,public.model_budget_attempts to service_role;
insert into turn_private.hosted_worker_control(singleton) values(true);
insert into turn_private.service_task_capacity_settings(singleton) values(true);
create trigger qa_link_mode_v1 before insert or update on turn_private.service_task_turns for each row execute function turn_private.qa_link_mode_v1();
create trigger baseline_require_task before insert or update on turn_private.text_content for each row execute function turn_private.require_text_task();
create trigger hide_text_on_user_delete after delete on auth.users for each row execute function turn_private.hide_text_content();
create trigger hide_text_on_thread_delete after delete on public.chat_threads for each row execute function turn_private.hide_text_content();
create trigger hide_text_on_thread_archive after update of status on public.chat_threads for each row when (new.status='archived') execute function turn_private.hide_text_content();
create trigger hide_text_on_turn_delete after delete on public.turns for each row execute function turn_private.hide_text_content();
