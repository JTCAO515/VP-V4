-- V4-15: immutable owner-scoped links from an accepted Memory source receipt to a
-- future Turn or Proposal. Current client routes cannot write this table.
alter table public.memory_receipts add constraint memory_receipts_id_memory_owner_unique unique (id, memory_id, owner_id);
alter table public.turns add constraint turns_id_owner_unique unique (id, owner_id);
alter table public.trip_proposals add constraint trip_proposals_id_owner_unique unique (id, owner_id);

create table public.memory_consumer_receipts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  memory_id uuid not null references public.memory_profiles(id) on delete restrict,
  source_receipt_id uuid not null references public.memory_receipts(id) on delete restrict,
  consumer_kind text not null check (consumer_kind in ('turn', 'proposal')),
  turn_id uuid,
  proposal_id uuid,
  constraint_kind text not null check (constraint_kind in ('preference', 'hard_constraint')),
  created_at timestamptz not null default now(),
  check ((turn_id is not null)::integer + (proposal_id is not null)::integer = 1),
  check ((consumer_kind = 'turn') = (turn_id is not null)),
  check ((consumer_kind = 'proposal') = (proposal_id is not null)),
  foreign key (source_receipt_id, memory_id, owner_id)
    references public.memory_receipts(id, memory_id, owner_id) on delete restrict,
  foreign key (turn_id, owner_id) references public.turns(id, owner_id) on delete cascade,
  foreign key (proposal_id, owner_id) references public.trip_proposals(id, owner_id) on delete cascade,
  unique (turn_id, memory_id),
  unique (proposal_id, memory_id)
);

create index memory_consumer_receipts_owner_created_idx on public.memory_consumer_receipts(owner_id, created_at desc);
alter table public.memory_consumer_receipts enable row level security;
revoke all on public.memory_consumer_receipts from anon;
grant select on public.memory_consumer_receipts to authenticated;
grant select, insert, update, delete on public.memory_consumer_receipts to service_role;
create policy "memory consumer receipt owner selects"
  on public.memory_consumer_receipts for select to authenticated
  using ((select auth.uid()) = owner_id);
