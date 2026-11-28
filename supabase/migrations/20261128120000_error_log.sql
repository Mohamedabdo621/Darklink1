-- DARKLINK — error log table (2026-11-28)
-- Client error reporter inserts rows here; the admin dashboard reads them.
-- RLS follows the app's existing admin pattern (public.is_admin()).
create table if not exists public.error_logs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid,
    message text not null,
    stack text,
    route text,
    created_at timestamptz not null default now()
);

alter table public.error_logs enable row level security;

drop policy if exists error_logs_insert on public.error_logs;
create policy error_logs_insert on public.error_logs
    for insert with check (auth.uid() is not null);

drop policy if exists error_logs_admin_read on public.error_logs;
create policy error_logs_admin_read on public.error_logs
    for select using (public.is_admin());
