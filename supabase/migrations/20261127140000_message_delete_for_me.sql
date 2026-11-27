-- ============================================================
-- DARKLINK — "الحذف لدي": إخفاء رسالة عندي بس
-- 2026-11-27 — لما المستخدم يحذف رسالة "لدي" بتختفي عنده بس
-- والطرف التاني بيشوفها عادي (على عكس الحذف للجميع اللي بيمسحها
-- من الطرفين عبر is_deleted). سجل لكل (مستخدم، رسالة).
-- ============================================================

create table if not exists public.hidden_messages (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references public.profiles (id) on delete cascade,
    message_id uuid not null references public.messages (id) on delete cascade,
    hidden_at  timestamptz not null default now(),
    unique (user_id, message_id)
);
create index if not exists hidden_messages_user
    on public.hidden_messages (user_id, hidden_at desc);
create index if not exists hidden_messages_message
    on public.hidden_messages (message_id);
alter table public.hidden_messages enable row level security;

-- كل واحد يشوف / يضيف / يمسح سجلاته هو بس
drop policy if exists "hidden_messages_own_select" on public.hidden_messages;
create policy "hidden_messages_own_select" on public.hidden_messages
    for select using (auth.uid() = user_id);
drop policy if exists "hidden_messages_own_insert" on public.hidden_messages;
create policy "hidden_messages_own_insert" on public.hidden_messages
    for insert with check (auth.uid() = user_id);
drop policy if exists "hidden_messages_own_delete" on public.hidden_messages;
create policy "hidden_messages_own_delete" on public.hidden_messages
    for delete using (auth.uid() = user_id);
