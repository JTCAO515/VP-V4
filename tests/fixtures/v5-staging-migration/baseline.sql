-- Synthetic identities only; seed before the missing-set replay.
insert into auth.users(id) values('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
insert into auth.sessions(id,user_id) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
insert into identity_private.mobile_accounts(owner_id,epoch,session_id) values('10000000-0000-0000-0000-000000000001',1,'20000000-0000-0000-0000-000000000001');
insert into public.trips(id,owner_id,title) values('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Synthetic migration invariant');
insert into public.memory_consents(id,owner_id,status) values('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','revoked');
insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,frozen,expires_at)
values('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','CNY',10000,1000,4,1,false,true,'2099-01-01');
insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled)
values('50000000-0000-0000-0000-000000000001','qwen','synthetic','synthetic-v1',10000,1000,false);
insert into public.model_budget_attempts(scope_id,attempt_id,task_id,provider,model,price_version,reserved_micros,actual_micros,status)
values('50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','qwen','synthetic','synthetic-v1',100,7,'settled');
