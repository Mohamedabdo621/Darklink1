-- DARKLINK — إضافات المرحلتين ٢ و٣: قراءة الرسائل + ملخص هدايا آمن

-- وقت قراءة الرسالة (حالة الرسالة + عدّاد غير المقروء)
alter table public.messages
    add column if not exists read_at timestamptz;

-- المستلم يقدر يعلّم رسائل الطرف الآخر كمقروءة فقط
drop policy if exists messages_mark_read on public.messages;
create policy messages_mark_read on public.messages
    for update
    using (
        sender_id <> auth.uid()
        and exists (
            select 1 from public.conversations c
            where c.id = conversation_id and auth.uid() in (c.user_a, c.user_b)))
    with check (
        sender_id <> auth.uid()
        and exists (
            select 1 from public.conversations c
            where c.id = conversation_id and auth.uid() in (c.user_a, c.user_b)));

create or replace function public.mark_conversation_read(p_conversation uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
    update public.messages
    set read_at = now()
    where conversation_id = p_conversation
      and sender_id <> auth.uid()
      and read_at is null;
end $$;

-- ملخص الهدايا المستلمة لمستخدم: أسماء وعدد فقط — بدون هوية المرسلين
create or replace function public.get_received_gifts(target uuid)
returns table (name_key text, asset text, price_gems int, total bigint)
language plpgsql security definer set search_path = public as $$
begin
    if public.is_blocked_pair(auth.uid(), target) then
        return;
    end if;
    return query
    select g.name_key, g.asset, g.price_gems, count(*)::bigint
    from public.gift_sends gs
    join public.gifts g on g.id = gs.gift_id
    where gs.receiver_id = target
    group by g.name_key, g.asset, g.price_gems
    order by count(*) desc;
end $$;
