create table if not exists public.kitchen_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.kitchen_audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  detail text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.kitchen_state enable row level security;
alter table public.kitchen_audit_logs enable row level security;

drop policy if exists "kitchen_state_public_read" on public.kitchen_state;
drop policy if exists "kitchen_state_public_write" on public.kitchen_state;
drop policy if exists "kitchen_state_public_update" on public.kitchen_state;
drop policy if exists "kitchen_logs_public_read" on public.kitchen_audit_logs;
drop policy if exists "kitchen_logs_public_write" on public.kitchen_audit_logs;

create policy "kitchen_state_public_read"
on public.kitchen_state for select
to anon
using (true);

create policy "kitchen_state_public_write"
on public.kitchen_state for insert
to anon
with check (true);

create policy "kitchen_state_public_update"
on public.kitchen_state for update
to anon
using (true)
with check (true);

create policy "kitchen_logs_public_read"
on public.kitchen_audit_logs for select
to anon
using (true);

create policy "kitchen_logs_public_write"
on public.kitchen_audit_logs for insert
to anon
with check (true);
