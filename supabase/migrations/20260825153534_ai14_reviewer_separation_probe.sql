create table public.review_probe_changes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  reviewer_id uuid references auth.users(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  created_at timestamptz not null default now()
);

create index review_probe_changes_author_id_idx on public.review_probe_changes(author_id);
alter table public.review_probe_changes enable row level security;
revoke all on public.review_probe_changes from anon;
grant select, insert, update on public.review_probe_changes to authenticated;
grant select, insert, update, delete on public.review_probe_changes to service_role;

create policy "review probe author reads own"
on public.review_probe_changes for select to authenticated
using ((select auth.uid()) = author_id);

create policy "review probe author creates own"
on public.review_probe_changes for insert to authenticated
with check ((select auth.uid()) = author_id and reviewer_id is null and status = 'draft');

create policy "review probe independent reviewer approves"
on public.review_probe_changes for update to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'reviewer_probe'
  and (select auth.uid()) <> author_id
)
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'reviewer_probe'
  and reviewer_id = (select auth.uid())
  and reviewer_id <> author_id
  and status = 'approved'
);
