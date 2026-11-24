-- DARKLINK — المرحلة ٤: VIP بالجواهر + إشعارات الرسائل الجديدة

insert into public.app_config (key, value) values
    ('vip_price_gems', '1000'),
    ('vip_days', '30')
on conflict (key) do nothing;

-- تفعيل VIP بخصم جواهر من المحفظة (عملية ذرية) — والاشتراكات المدفوعة لاحقًا
create or replace function public.activate_vip()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    me uuid := auth.uid();
    price int;
    days int;
    bal int;
    cur_until timestamptz;
begin
    if me is null then raise exception 'not authenticated'; end if;
    select value::int into price from public.app_config where key = 'vip_price_gems';
    select value::int into days from public.app_config where key = 'vip_days';

    update public.wallets set balance = balance - price
    where user_id = me and balance >= price
    returning balance into bal;
    if bal is null then raise exception 'insufficient_balance'; end if;

    select vip_until into cur_until from public.profiles where id = me;
    update public.profiles
    set is_vip = true,
        vip_until = greatest(coalesce(cur_until, now()), now()) + (days || ' days')::interval
    where id = me;

    insert into public.transactions (user_id, amount, type, reference_id)
    values (me, -price, 'vip', days::text);

    return jsonb_build_object('ok', true, 'balance', bal, 'days', days);
end $$;

-- إشعار للطرف الآخر عند وصول رسالة — بدون محتوى الرسالة احترامًا للخصوصية
create or replace function public.notify_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare other uuid;
begin
    if new.type = 'gift' then return new; end if;  -- الهدايا لها إشعارها الخاص
    select case when c.user_a = new.sender_id then c.user_b else c.user_a end
    into other
    from public.conversations c where c.id = new.conversation_id;
    if other is not null then
        insert into public.notifications (user_id, type, payload)
        values (
            other,
            case when new.type = 'voice' then 'voice_note' else 'new_message' end,
            jsonb_build_object(
                'conversation_id', new.conversation_id,
                'sender_id', new.sender_id));
    end if;
    return new;
end $$;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify after insert on public.messages
    for each row execute function public.notify_on_message();
