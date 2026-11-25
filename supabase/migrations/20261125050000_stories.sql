-- ============================================================
-- DARKLINK — ستوري ٢٤ ساعة (نص أو صورة، تختفي تلقائيًا)
-- 2026-11-25 — مرحلة الستوري (v1.2)
-- ============================================================

create table if not exists public.stories (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references public.profiles (id) on delete cascade,
    type       text not null check (type in ('text', 'image')),
    body       text,
    media_path text,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default now() + interval '24 hours'
);
create index if not exists stories_active
    on public.stories (expires_at desc, user_id);
alter table public.stories enable row level security;

-- القراءة: أي مستخدم مسجل، ستوري سارية، ولا يوجد حظر بين الطرفين
drop policy if exists stories_read on public.stories;
create policy stories_read on public.stories
    for select using (
        auth.uid() is not null
        and expires_at > now()
        and not exists (
            select 1 from public.blocks b
             where (b.blocker_id = auth.uid() and b.blocked_id = user_id)
                or (b.blocker_id = user_id and b.blocked_id = auth.uid())));

drop policy if exists stories_insert on public.stories;
create policy stories_insert on public.stories
    for insert with check (user_id = auth.uid());

drop policy if exists stories_delete on public.stories;
create policy stories_delete on public.stories
    for delete using (user_id = auth.uid());

-- حاوية ملفات الستوري (خاصة — روابط موقعة)
insert into storage.buckets (id, name, public)
values ('stories', 'stories', false)
on conflict (id) do nothing;

drop policy if exists stories_obj_insert on storage.objects;
create policy stories_obj_insert on storage.objects
    for insert with check (
        bucket_id = 'stories'
        and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists stories_obj_read on storage.objects;
create policy stories_obj_read on storage.objects
    for select using (bucket_id = 'stories' and auth.uid() is not null);

drop policy if exists stories_obj_delete on storage.objects;
create policy stories_obj_delete on storage.objects
    for delete using (
        bucket_id = 'stories'
        and (storage.foldername(name))[1] = auth.uid()::text);
