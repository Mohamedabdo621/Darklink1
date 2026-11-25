-- ============================================================
-- DARKLINK — اقتصاد: تبادل جواهر + دعوات + مهام + مستويات
--          + برومو + مسابقة أسبوعية + VIP متدرج + هدايا موسمية
-- 2026-11-25 — v1.3 المرحلة ٢ (استرجاع الهدايا أُلغي بطلب أليكس)
-- ============================================================

-- ---------- تبادل الجواهر ----------
alter table public.transactions
    drop constraint if exists transactions_type_check;
alter table public.transactions
    add constraint transactions_type_check
    check (type in ('purchase', 'gift_sent', 'gift_received', 'bonus',
                    'refund', 'vip', 'transfer_sent', 'transfer_received'));

create table if not exists public.gem_transfers (
    id         uuid primary key default gen_random_uuid(),
    from_user  uuid not null references public.profiles (id) on delete cascade,
    to_user    uuid not null references public.profiles (id) on delete cascade,
    amount     int not null check (amount > 0),
    fee        int not null check (fee >= 0),
    created_at timestamptz not null default now(),
    check (from_user <> to_user)
);
alter table public.gem_transfers enable row level security;
drop policy if exists transfers_read on public.gem_transfers;
create policy transfers_read on public.gem_transfers
    for select using (auth.uid() in (from_user, to_user));

-- نسبة التبادل حسب الكمية (قبل خصم المستوى)
create or replace function public.transfer_fee_pct(p_amount int)
returns numeric language sql immutable as $$
    select case when p_amount < 100 then 0.15
                when p_amount < 500 then 0.10
                when p_amount < 2000 then 0.07
                else 0.05 end;
$$;

-- ---------- الخبرة والمستويات ----------
create or replace function public.user_xp(p_user uuid)
returns int language sql security definer set search_path = public stable as $$
    select (
        coalesce((select sum(price_gems) from public.gift_sends
                   where sender_id = p_user), 0)
      + coalesce((select sum(price_gems) / 2 from public.gift_sends
                   where receiver_id = p_user), 0)
      + (select count(*) from public.messages where sender_id = p_user)
      + (select count(*) * 10 from public.daily_rewards
          where user_id = p_user))::int;
$$;

create or replace function public.level_for_xp(p_xp int)
returns int language sql immutable as $$
    select case when p_xp >= 50000 then 10
                when p_xp >= 25000 then 9
                when p_xp >= 12000 then 8
                when p_xp >= 6000 then 7
                when p_xp >= 3000 then 6
                when p_xp >= 1500 then 5
                when p_xp >= 700 then 4
                when p_xp >= 300 then 3
                when p_xp >= 100 then 2
                else 1 end;
$$;

create or replace function public.level_next_at(p_level int)
returns int language sql immutable as $$
    select case p_level
        when 1 then 100 when 2 then 300 when 3 then 700 when 4 then 1500
        when 5 then 3000 when 6 then 6000 when 7 then 12000
        when 8 then 25000 when 9 then 50000 else null end;
$$;

create or replace function public.my_level()
returns jsonb language plpgsql security definer set search_path = public as $$
declare xp int := public.user_xp(auth.uid());
        lvl int := public.level_for_xp(public.user_xp(auth.uid()));
begin
    return jsonb_build_object(
        'xp', xp, 'level', lvl, 'next_at', public.level_next_at(lvl));
end $$;

create or replace function public.user_level_public(p_user uuid)
returns int language sql security definer set search_path = public stable as $$
    select public.level_for_xp(public.user_xp(p_user));
$$;

-- تنفيذ التبادل (ذري، مع خصم المستوى على النسبة)
create or replace function public.transfer_gems(p_to uuid, p_amount int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    me uuid := auth.uid();
    pct numeric;
    fee int;
    net int;
    cap int;
    sent_today int;
    bal int;
    tid uuid;
    lvl int;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    if p_to = me then raise exception 'cannot_self'; end if;
    if p_amount < 10 then raise exception 'below_min'; end if;
    if public.is_blocked_pair(me, p_to) then raise exception 'blocked'; end if;
    select coalesce(value::int, 5000) into cap
      from public.app_config where key = 'transfer_daily_cap';
    select coalesce(sum(amount), 0) into sent_today
      from public.gem_transfers
     where from_user = me
       and created_at >= date_trunc('day', now());
    if sent_today + p_amount > cap then raise exception 'daily_cap'; end if;

    lvl := public.level_for_xp(public.user_xp(me));
    pct := public.transfer_fee_pct(p_amount)
           - case when lvl >= 8 then 0.04 when lvl >= 5 then 0.02 else 0 end;
    if pct < 0.01 then pct := 0.01; end if;
    fee := greatest(1, ceil(p_amount * pct)::int);
    net := p_amount - fee;

    update public.wallets set balance = balance - p_amount, updated_at = now()
     where user_id = me and balance >= p_amount
     returning balance into bal;
    if bal is null then raise exception 'insufficient_balance'; end if;
    update public.wallets set balance = balance + net, updated_at = now()
     where user_id = p_to;

    insert into public.gem_transfers (from_user, to_user, amount, fee)
    values (me, p_to, p_amount, fee) returning id into tid;
    insert into public.transactions (user_id, amount, type, status, reference_id)
    values (me, -p_amount, 'transfer_sent', 'completed', 'transfer:' || tid::text),
           (p_to, net, 'transfer_received', 'completed', 'transfer:' || tid::text);
    insert into public.notifications (user_id, type, payload)
    values (p_to, 'account',
            jsonb_build_object('kind', 'transfer_received',
                               'amount', net, 'sender_id', me));
    return jsonb_build_object('ok', true, 'fee', fee, 'net', net, 'fee_pct', pct);
end $$;

-- معاينة النسبة قبل التنفيذ
create or replace function public.transfer_quote(p_amount int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pct numeric; lvl int;
begin
    lvl := public.level_for_xp(public.user_xp(auth.uid()));
    pct := public.transfer_fee_pct(p_amount)
           - case when lvl >= 8 then 0.04 when lvl >= 5 then 0.02 else 0 end;
    if pct < 0.01 then pct := 0.01; end if;
    return jsonb_build_object(
        'fee_pct', pct,
        'fee', greatest(1, ceil(p_amount * pct)::int),
        'net', p_amount - greatest(1, ceil(p_amount * pct)::int),
        'level', lvl);
end $$;

-- ---------- الدعوات ----------
create table if not exists public.referrals (
    referrer_id uuid not null references public.profiles (id) on delete cascade,
    referred_id uuid not null references public.profiles (id) on delete cascade,
    rewarded    boolean not null default false,
    created_at  timestamptz not null default now(),
    primary key (referred_id),
    check (referrer_id <> referred_id)
);
alter table public.referrals enable row level security;
drop policy if exists referrals_read on public.referrals;
create policy referrals_read on public.referrals
    for select using (auth.uid() in (referrer_id, referred_id));

create or replace function public.my_referral_code()
returns text language sql security definer set search_path = public stable as $$
    select 'DL' || upper(substr(md5(auth.uid()::text), 1, 6));
$$;

create or replace function public.bind_referral(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); ref_id uuid;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    select id into ref_id from public.profiles
     where 'DL' || upper(substr(md5(id::text), 1, 6)) = upper(trim(p_code));
    if ref_id is null then return jsonb_build_object('ok', false, 'reason', 'bad_code'); end if;
    if ref_id = me then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
    if exists (select 1 from public.referrals where referred_id = me) then
        return jsonb_build_object('ok', false, 'reason', 'already');
    end if;
    if exists (select 1 from public.profiles
                where id = me and created_at < now() - interval '7 days') then
        return jsonb_build_object('ok', false, 'reason', 'too_late');
    end if;
    insert into public.referrals (referrer_id, referred_id) values (ref_id, me);
    return jsonb_build_object('ok', true);
end $$;

-- مكافأة الدعوة عند أول شراء للمُدعو (أي طريقة دفع)
create or replace function public.reward_referral_on_purchase()
returns trigger language plpgsql security definer set search_path = public as $$
declare ref_row record; reward int;
begin
    if new.type <> 'purchase'
       or new.status not in ('completed', 'sandbox_verified') then
        return new;
    end if;
    select * into ref_row from public.referrals
     where referred_id = new.user_id and not rewarded;
    if ref_row is null then return new; end if;
    if (select count(*) from public.transactions
         where user_id = new.user_id and type = 'purchase'
           and status in ('completed', 'sandbox_verified')) <> 1 then
        return new;  -- ليست أول عملية شراء
    end if;
    select coalesce(value::int, 25) into reward
      from public.app_config where key = 'referral_reward';
    update public.referrals set rewarded = true
     where referred_id = new.user_id;
    update public.wallets set balance = balance + reward, updated_at = now()
     where user_id in (ref_row.referrer_id, new.user_id);
    insert into public.transactions (user_id, amount, type, status, reference_id)
    values (ref_row.referrer_id, reward, 'bonus', 'completed',
            'referral:' || new.user_id::text),
           (new.user_id, reward, 'bonus', 'completed',
            'referral:' || new.user_id::text);
    insert into public.notifications (user_id, type, payload)
    values (ref_row.referrer_id, 'account',
            jsonb_build_object('kind', 'referral_reward', 'amount', reward)),
           (new.user_id, 'account',
            jsonb_build_object('kind', 'referral_reward', 'amount', reward));
    return new;
end $$;

drop trigger if exists transactions_referral_reward on public.transactions;
create trigger transactions_referral_reward
    after insert on public.transactions
    for each row execute function public.reward_referral_on_purchase();

-- ---------- المهام ----------
create table if not exists public.quest_claims (
    user_id    uuid not null references public.profiles (id) on delete cascade,
    quest_key  text not null,
    period_key text not null,
    amount     int not null,
    claimed_at timestamptz not null default now(),
    primary key (user_id, quest_key, period_key)
);
alter table public.quest_claims enable row level security;
drop policy if exists quest_claims_read on public.quest_claims;
create policy quest_claims_read on public.quest_claims
    for select using (user_id = auth.uid());

create or replace function public.quest_progress(p_key text, p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
    day_start timestamptz := (date_trunc('day', now() at time zone 'Africa/Cairo')
                              at time zone 'Africa/Cairo');
    week_start timestamptz := (date_trunc('week', now() at time zone 'Africa/Cairo')
                               at time zone 'Africa/Cairo');
begin
    return case p_key
        when 'chat_10' then (select count(*) from public.messages
                              where sender_id = p_user and created_at >= day_start)
        when 'gift_1' then (select count(*) from public.gift_sends
                             where sender_id = p_user and created_at >= day_start)
        when 'chat_50' then (select count(*) from public.messages
                              where sender_id = p_user and created_at >= week_start)
        when 'gift_10' then (select count(*) from public.gift_sends
                              where sender_id = p_user and created_at >= week_start)
        when 'transfer_1' then (select count(*) from public.gem_transfers
                                 where from_user = p_user and created_at >= week_start)
        else 0 end;
end $$;

create or replace function public.quest_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    me uuid := auth.uid();
    day_key text := to_char(now() at time zone 'Africa/Cairo', 'YYYY-MM-DD');
    week_key text := to_char(now() at time zone 'Africa/Cairo', 'IYYY-"W"IW');
    defs jsonb := '[
        {"key":"chat_10","period":"daily","target":10,"reward":5},
        {"key":"gift_1","period":"daily","target":1,"reward":8},
        {"key":"chat_50","period":"weekly","target":50,"reward":25},
        {"key":"gift_10","period":"weekly","target":10,"reward":40},
        {"key":"transfer_1","period":"weekly","target":1,"reward":10}
    ]'::jsonb;
    out jsonb := '[]'::jsonb;
    d jsonb;
    pk text;
begin
    for d in select * from jsonb_array_elements(defs) loop
        pk := case d ->> 'period' when 'daily' then day_key else week_key end;
        out := out || jsonb_build_object(
            'key', d ->> 'key',
            'period', d ->> 'period',
            'target', (d ->> 'target')::int,
            'reward', (d ->> 'reward')::int,
            'progress', public.quest_progress(d ->> 'key', me),
            'claimed', exists (select 1 from public.quest_claims
                                where user_id = me
                                  and quest_key = d ->> 'key'
                                  and period_key = pk));
    end loop;
    return out;
end $$;

create or replace function public.claim_quest(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    me uuid := auth.uid();
    target int; reward int; period text; pk text;
    day_key text := to_char(now() at time zone 'Africa/Cairo', 'YYYY-MM-DD');
    week_key text := to_char(now() at time zone 'Africa/Cairo', 'IYYY-"W"IW');
begin
    select (d ->> 'target')::int, (d ->> 'reward')::int, d ->> 'period'
      into target, reward, period
      from jsonb_array_elements('[
        {"key":"chat_10","period":"daily","target":10,"reward":5},
        {"key":"gift_1","period":"daily","target":1,"reward":8},
        {"key":"chat_50","period":"weekly","target":50,"reward":25},
        {"key":"gift_10","period":"weekly","target":10,"reward":40},
        {"key":"transfer_1","period":"weekly","target":1,"reward":10}
      ]'::jsonb) d
     where d ->> 'key' = p_key;
    if target is null then raise exception 'bad_quest'; end if;
    pk := case period when 'daily' then day_key else week_key end;
    if public.quest_progress(p_key, me) < target then
        return jsonb_build_object('ok', false, 'reason', 'not_done');
    end if;
    insert into public.quest_claims (user_id, quest_key, period_key, amount)
    values (me, p_key, pk, reward);
    update public.wallets set balance = balance + reward, updated_at = now()
     where user_id = me;
    insert into public.transactions (user_id, amount, type, status, reference_id)
    values (me, reward, 'bonus', 'completed', 'quest:' || p_key || ':' || pk);
    return jsonb_build_object('ok', true, 'amount', reward);
exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already');
end $$;

-- ---------- أكواد البرومو ----------
create table if not exists public.promo_codes (
    code       text primary key,
    kind       text not null check (kind in ('gems', 'vip_days')),
    value      int not null check (value > 0),
    max_uses   int not null default 100,
    used_count int not null default 0,
    expires_at timestamptz,
    active     boolean not null default true,
    created_at timestamptz not null default now()
);
create table if not exists public.promo_redemptions (
    code        text not null references public.promo_codes (code) on delete cascade,
    user_id     uuid not null references public.profiles (id) on delete cascade,
    redeemed_at timestamptz not null default now(),
    primary key (code, user_id)
);
alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;
drop policy if exists promo_redemptions_read on public.promo_redemptions;
create policy promo_redemptions_read on public.promo_redemptions
    for select using (user_id = auth.uid());

create or replace function public.redeem_promo(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); promo record;
begin
    select * into promo from public.promo_codes
     where code = upper(trim(p_code)) for update;
    if promo is null or not promo.active then
        return jsonb_build_object('ok', false, 'reason', 'invalid');
    end if;
    if promo.expires_at is not null and promo.expires_at < now() then
        return jsonb_build_object('ok', false, 'reason', 'expired');
    end if;
    if promo.used_count >= promo.max_uses then
        return jsonb_build_object('ok', false, 'reason', 'exhausted');
    end if;
    if exists (select 1 from public.promo_redemptions
                where code = promo.code and user_id = me) then
        return jsonb_build_object('ok', false, 'reason', 'already');
    end if;
    insert into public.promo_redemptions (code, user_id) values (promo.code, me);
    update public.promo_codes
       set used_count = used_count + 1 where code = promo.code;
    if promo.kind = 'gems' then
        update public.wallets set balance = balance + promo.value,
               updated_at = now() where user_id = me;
        insert into public.transactions
            (user_id, amount, type, status, reference_id)
        values (me, promo.value, 'bonus', 'completed', 'promo:' || promo.code);
    else
        update public.profiles
           set is_vip = true,
               vip_until = greatest(coalesce(vip_until, now()), now())
                           + (promo.value || ' days')::interval
         where id = me;
    end if;
    return jsonb_build_object(
        'ok', true, 'kind', promo.kind, 'value', promo.value);
end $$;

create or replace function public.admin_create_promo(
    p_code text, p_kind text, p_value int, p_max_uses int,
    p_expires_at timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
begin
    if not public.is_admin() then raise exception 'forbidden'; end if;
    insert into public.promo_codes (code, kind, value, max_uses, expires_at)
    values (upper(trim(p_code)), p_kind, p_value, p_max_uses, p_expires_at);
end $$;

create or replace function public.admin_list_promos()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    if not public.is_admin() then raise exception 'forbidden'; end if;
    return coalesce((
        select jsonb_agg(x) from (
            select code, kind, value, max_uses, used_count, expires_at,
                   active, created_at
              from public.promo_codes order by created_at desc limit 100) x),
        '[]'::jsonb);
end $$;

create or replace function public.admin_set_promo_active(
    p_code text, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
    if not public.is_admin() then raise exception 'forbidden'; end if;
    update public.promo_codes set active = p_active where code = p_code;
end $$;

-- ---------- مسابقة الأسبوع ----------
create or replace function public.admin_award_contest()
returns jsonb language plpgsql security definer set search_path = public as $$
declare winner uuid; total bigint; prize int; ref text;
begin
    if not public.is_admin() then raise exception 'forbidden'; end if;
    ref := 'contest:' || to_char(now() at time zone 'Africa/Cairo', 'IYYY-IW');
    if exists (select 1 from public.transactions where reference_id = ref) then
        return jsonb_build_object('ok', false, 'reason', 'already_awarded');
    end if;
    select sender_id, sum(price_gems) into winner, total
      from public.gift_sends
     where created_at > now() - interval '7 days'
     group by sender_id order by sum(price_gems) desc limit 1;
    if winner is null then
        return jsonb_build_object('ok', false, 'reason', 'no_gifts');
    end if;
    select coalesce(value::int, 200) into prize
      from public.app_config where key = 'contest_prize_gems';
    update public.wallets set balance = balance + prize, updated_at = now()
     where user_id = winner;
    insert into public.transactions (user_id, amount, type, status, reference_id)
    values (winner, prize, 'bonus', 'completed', ref);
    insert into public.notifications (user_id, type, payload)
    values (winner, 'account',
            jsonb_build_object('kind', 'contest_win', 'amount', prize));
    return jsonb_build_object(
        'ok', true, 'winner', winner, 'prize', prize, 'total', total);
end $$;

-- ---------- VIP متدرج ----------
alter table public.profiles
    add column if not exists vip_tier text
    check (vip_tier in ('silver', 'gold'));

create or replace function public.activate_vip_tier(p_tier text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    me uuid := auth.uid();
    price int; days int; bal int; cur_until timestamptz; new_until timestamptz;
begin
    if p_tier not in ('silver', 'gold') then raise exception 'bad_tier'; end if;
    select value::int into price from public.app_config
     where key = case p_tier
         when 'silver' then 'vip_silver_price' else 'vip_price_gems' end;
    select value::int into days from public.app_config where key = 'vip_days';
    update public.wallets set balance = balance - price
     where user_id = me and balance >= price
     returning balance into bal;
    if bal is null then raise exception 'insufficient_balance'; end if;
    select vip_until into cur_until from public.profiles where id = me;
    new_until := greatest(coalesce(cur_until, now()), now())
                 + (days || ' days')::interval;
    update public.profiles
       set is_vip = true, vip_until = new_until, vip_tier = p_tier
     where id = me;
    insert into public.transactions (user_id, amount, type, status, reference_id)
    values (me, -price, 'vip', 'completed', 'vip:' || p_tier || ':' || now()::text);
    return jsonb_build_object('ok', true, 'vip_until', new_until, 'tier', p_tier);
end $$;

-- ---------- هدايا موسمية ----------
alter table public.gifts
    add column if not exists seasonal boolean not null default false;
alter table public.gifts
    add column if not exists available_until timestamptz;

insert into public.gifts (name_key, asset, price_gems, sort, seasonal, available_until)
values ('lantern', 'lantern', 150, 90, true, now() + interval '60 days'),
       ('fireworks', 'fireworks', 200, 91, true, now() + interval '60 days')
on conflict (name_key) do nothing;
