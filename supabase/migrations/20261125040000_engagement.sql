-- ============================================================
-- DARKLINK — مكافأة يومية + إنجازات + لوحة شرف الهدايا
-- 2026-11-25 — مرحلة التفاعل والرجوع اليومي (v1.2)
-- ============================================================

-- ---------- المكافأة اليومية ----------
create table if not exists public.daily_rewards (
    user_id uuid not null references public.profiles (id) on delete cascade,
    day     date not null,
    streak  int  not null,
    amount  int  not null,
    primary key (user_id, day)
);
alter table public.daily_rewards enable row level security;
drop policy if exists daily_rewards_own on public.daily_rewards;
create policy daily_rewards_own on public.daily_rewards
    for select using (user_id = auth.uid());

-- حالة المكافأة اليوم: هل متاحة؟ وما التتابع الحالي؟
create or replace function public.daily_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    today date := (now() at time zone 'Africa/Cairo')::date;
    last record;
    cur_streak int := 0;
begin
    select * into last from public.daily_rewards
     where user_id = auth.uid() order by day desc limit 1;
    if last is not null and last.day >= today - 1 then
        cur_streak := last.streak;
    end if;
    return jsonb_build_object(
        'claimable', not exists (
            select 1 from public.daily_rewards
             where user_id = auth.uid() and day = today),
        'streak', cur_streak,
        'next_amount', 5 + least(cur_streak * 2, 20));
end $$;

-- استلام المكافأة (ذري: سجل اليوم + رصيد + قيد محفظة)
create or replace function public.claim_daily_reward()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    today date := (now() at time zone 'Africa/Cairo')::date;
    yday record;
    new_streak int := 1;
    amt int;
begin
    if exists (select 1 from public.daily_rewards
                where user_id = auth.uid() and day = today) then
        return jsonb_build_object('claimed', false, 'reason', 'already');
    end if;
    select * into yday from public.daily_rewards
     where user_id = auth.uid() and day = today - 1;
    if yday is not null then new_streak := yday.streak + 1; end if;
    amt := 5 + least((new_streak - 1) * 2, 20);
    insert into public.daily_rewards (user_id, day, streak, amount)
    values (auth.uid(), today, new_streak, amt);
    update public.wallets set balance = balance + amt, updated_at = now()
     where user_id = auth.uid();
    insert into public.transactions (user_id, amount, type, status, reference_id)
    values (auth.uid(), amt, 'bonus', 'completed', 'daily:' || today::text);
    return jsonb_build_object(
        'claimed', true, 'amount', amt, 'streak', new_streak);
end $$;

-- ---------- الإنجازات ----------
create table if not exists public.achievements (
    user_id     uuid not null references public.profiles (id) on delete cascade,
    key         text not null,
    unlocked_at timestamptz not null default now(),
    primary key (user_id, key)
);
alter table public.achievements enable row level security;
drop policy if exists achievements_own on public.achievements;
create policy achievements_own on public.achievements
    for select using (user_id = auth.uid());

-- فحص الإنجازات من البيانات الفعلية وإرجاع الجديدة فقط
create or replace function public.check_achievements()
returns table (key text)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
    return query
    with earned(key) as (
        select 'first_gift_sent'
         where exists (select 1 from public.gift_sends g where g.sender_id = me)
        union all
        select 'first_gift_received'
         where exists (select 1 from public.gift_sends g where g.receiver_id = me)
        union all
        select 'gifts_10'
         where (select count(*) from public.gift_sends g where g.sender_id = me) >= 10
        union all
        select 'vip_member'
         where exists (select 1 from public.profiles p where p.id = me and p.is_vip)
        union all
        select 'streak_7'
         where exists (select 1 from public.daily_rewards d
                        where d.user_id = me and d.streak >= 7)
        union all
        select 'gems_1000'
         where exists (select 1 from public.wallets w
                        where w.user_id = me and w.balance >= 1000)
        union all
        select 'social_5'
         where (select count(*) from public.conversations c
                 where c.user_a = me or c.user_b = me) >= 5
    ),
    ins as (
        insert into public.achievements (user_id, key)
        select me, e.key from earned e
        on conflict do nothing
        returning achievements.key
    )
    select i.key from ins i;
end $$;

-- ---------- لوحة شرف الهدايا (آخر ٧ أيام) ----------
create or replace function public.gift_leaderboard()
returns jsonb language plpgsql security definer set search_path = public as $$
declare givers jsonb; receivers jsonb;
begin
    select coalesce(jsonb_agg(x), '[]'::jsonb) into givers from (
        select g.sender_id as user_id, sum(g.price_gems) as total,
               count(*) as gifts
          from public.gift_sends g
         where g.created_at > now() - interval '7 days'
         group by g.sender_id
         order by total desc limit 10) x;
    select coalesce(jsonb_agg(x), '[]'::jsonb) into receivers from (
        select g.receiver_id as user_id, sum(g.price_gems) as total,
               count(*) as gifts
          from public.gift_sends g
         where g.created_at > now() - interval '7 days'
         group by g.receiver_id
         order by total desc limit 10) x;
    return jsonb_build_object('givers', givers, 'receivers', receivers);
end $$;
