-- ============================================================
-- DARKLINK — حضور (آخر ظهور) + تفاعلات الرسائل + تثبيت/كتم المحادثات
-- 2026-11-25 — مرحلة المحادثة (v1.2)
-- ============================================================

-- آخر ظهور + مفتاح خصوصية مستقل لإظهاره
alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles
    add column if not exists show_last_seen boolean not null default true;

-- تثبيت / كتم لكل طرف على حدة (زي hidden_for)
alter table public.conversations
    add column if not exists pinned_for uuid[] not null default '{}';
alter table public.conversations
    add column if not exists muted_for uuid[] not null default '{}';

-- تبديل علم (تثبيت/كتم) للمستخدم الحالي في محادثة هو طرف فيها
create or replace function public.toggle_conversation_flag(
    p_conversation uuid, p_flag text)
returns uuid[]
language plpgsql security definer set search_path = public as $$
declare arr uuid[];
begin
    if p_flag not in ('pinned_for', 'muted_for') then
        raise exception 'bad flag';
    end if;
    select case p_flag when 'pinned_for' then pinned_for else muted_for end
      into arr
      from public.conversations
     where id = p_conversation
       and (user_a = auth.uid() or user_b = auth.uid());
    if arr is null then raise exception 'not a participant'; end if;
    if arr @> array[auth.uid()] then
        arr := array_remove(arr, auth.uid());
    else
        arr := arr || array[auth.uid()];
    end if;
    if p_flag = 'pinned_for' then
        update public.conversations set pinned_for = arr where id = p_conversation;
    else
        update public.conversations set muted_for = arr where id = p_conversation;
    end if;
    return arr;
end $$;

-- تفاعلات الرسائل (إيموجي واحد لكل مستخدم على كل رسالة)
create table if not exists public.message_reactions (
    message_id uuid not null references public.messages (id) on delete cascade,
    user_id    uuid not null references public.profiles (id) on delete cascade,
    emoji      text not null check (emoji in ('❤️','😂','😮','👍','🔥')),
    created_at timestamptz not null default now(),
    primary key (message_id, user_id)
);
alter table public.message_reactions enable row level security;

drop policy if exists reactions_read on public.message_reactions;
create policy reactions_read on public.message_reactions
    for select using (
        exists (
            select 1 from public.messages m
            join public.conversations c on c.id = m.conversation_id
            where m.id = message_id
              and (c.user_a = auth.uid() or c.user_b = auth.uid())));

drop policy if exists reactions_write on public.message_reactions;
create policy reactions_write on public.message_reactions
    for all using (user_id = auth.uid())
    with check (
        user_id = auth.uid() and exists (
            select 1 from public.messages m
            join public.conversations c on c.id = m.conversation_id
            where m.id = message_id
              and (c.user_a = auth.uid() or c.user_b = auth.uid())));

-- بث فوري للتفاعلات
do $$
begin
    alter publication supabase_realtime add table public.message_reactions;
exception when duplicate_object then null;
end $$;
