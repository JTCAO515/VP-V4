-- V4-09: owner-visible, structured feedback only. No prompt, result body, or free-text correction is retained.
create table public.turn_feedback (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  turn_id uuid not null references public.turns(id) on delete cascade,
  feedback_kind text not null check (feedback_kind in ('another_option', 'inaccurate', 'reject_reason', 'correction')),
  reason_code text not null check (reason_code in ('different_preference', 'not_relevant', 'missing_evidence', 'incorrect_detail')),
  created_at timestamptz not null default now(),
  unique (owner_id, turn_id, feedback_kind, reason_code),
  check ((feedback_kind, reason_code) in (
    ('another_option', 'different_preference'), ('inaccurate', 'not_relevant'),
    ('reject_reason', 'missing_evidence'), ('correction', 'incorrect_detail')
  ))
);

create index turn_feedback_owner_turn_idx on public.turn_feedback(owner_id, turn_id, created_at);
alter table public.turn_feedback enable row level security;
revoke all on public.turn_feedback from anon;
grant select on public.turn_feedback to authenticated;
grant select, insert, update, delete on public.turn_feedback to service_role;
create policy "turn feedback owner selects" on public.turn_feedback for select to authenticated using ((select auth.uid()) = owner_id);

create function public.record_turn_feedback(p_turn_id uuid, p_feedback_kind text, p_reason_code text)
returns table(feedback_id uuid, reused boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  turn_row public.turns%rowtype;
  previous public.turn_feedback%rowtype;
  created_id uuid;
begin
  select * into turn_row from public.turns where id = p_turn_id and owner_id = (select auth.uid()) for update;
  if not found or turn_row.thread_id is null or not exists (
    select 1 from public.chat_threads where id = turn_row.thread_id and owner_id = (select auth.uid())
  ) then raise exception 'FORBIDDEN'; end if;
  if turn_row.status not in ('completed', 'proposal_ready', 'unavailable', 'failed') then raise exception 'NO_RESULT_TO_FEEDBACK'; end if;
  if (p_feedback_kind, p_reason_code) not in (
    ('another_option', 'different_preference'), ('inaccurate', 'not_relevant'),
    ('reject_reason', 'missing_evidence'), ('correction', 'incorrect_detail')
  ) then raise exception 'INVALID_FEEDBACK'; end if;
  select * into previous from public.turn_feedback where owner_id = (select auth.uid()) and turn_id = p_turn_id and feedback_kind = p_feedback_kind and reason_code = p_reason_code;
  if found then return query select previous.id, true; return; end if;
  insert into public.turn_feedback(owner_id, thread_id, turn_id, feedback_kind, reason_code)
    values ((select auth.uid()), turn_row.thread_id, p_turn_id, p_feedback_kind, p_reason_code) returning id into created_id;
  return query select created_id, false;
end;
$$;

revoke all on function public.record_turn_feedback(uuid, text, text) from public;
grant execute on function public.record_turn_feedback(uuid, text, text) to authenticated;
