-- ============================================================
-- DARKLINK — الإدارة + الدفع اليدوي (فودافون/اتصالات كاش)
-- 2026-11-25 — v1.3 المرحلة ١
-- ============================================================

alter table public.profiles
    add column if not exists is_admin boolean not null default false;
alter table public.profiles
    add column if not exists is_suspended boolean not null default false;

-- حساب أليكس هو الأدمن
update public.profiles set is_admin = true
 where id = '42bcb91c-8b45-4212-a9a1-d9732c9754cd';

create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public stable as $$
    select coalesce(
        (select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- إعدادات الشركة الافتراضية
insert into public.app_config (key, value) values
    ('vodafone_cash_number', ''),
    ('etisalat_cash_number', ''),
    ('manual_bonus_pct', '10'),
    ('transfer_daily_cap', '5000'),
    ('referral_reward', '25'),
    ('contest_prize_gems', '200'),
    ('vip_silver_price', '500')
on conflict (key) do nothing;

-- ---------- طلبات الدفع اليدوي ----------
create table if not exists public.payment_orders (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references public.profiles (id) on delete cascade,
    package_id    uuid not null references public.gem_packages (id),
    gems          int not null,
    bonus_gems    int not null default 0,
    amount_egp    numeric not null,
    method        text not null check (method in ('vodafone', 'etisalat')),
    sender_phone  text not null,
    proof_path    text,
    code          text not null unique,
    status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected')),
    reject_reason text,
    reviewed_by   uuid references public.profiles (id),
    reviewed_at   timestamptz,
    created_at    timestamptz not null default now()
);
-- طلب معلّق واحد فقط لكل مستخدم
create unique index if not exists payment_orders_one_pending
    on public.payment_orders (user_id) where status = 'pending';
alter table public.payment_orders enable row level security;
drop policy if exists payment_orders_read on public.payment_orders;
create policy payment_orders_read on public.payment_orders
    for select using (user_id = auth.uid() or public.is_admin());

-- حاوية صور إثبات التحويل
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;
drop policy if exists proofs_insert on storage.objects;
create policy proofs_insert on storage.objects
    for insert with check (
        bucket_id = 'payment-proofs'
        and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists proofs_read on storage.objects;
create policy proofs_read on storage.objects
    for select using (
        bucket_id = 'payment-proofs'
        and ((storage.foldername(name))[1] = auth.uid()::text
             or public.is_admin()));
drop policy if exists proofs_delete on storage.objects;
create policy proofs_delete on storage.objects
    for delete using (
        bucket_id = 'payment-proofs'
        and (storage.foldername(name))[1] = auth.uid()::text);

-- إنشاء طلب دفع يدوي
create or replace function public.create_payment_order(
    p_package uuid, p_method text, p_sender_phone text,
    p_proof_path text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    me uuid := auth.uid();
    pkg record;
    pct int;
    bonus int;
    pay_to text;
    new_code text;
    tries int := 0;
    new_id uuid;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    if exists (select 1 from public.profiles where id = me and is_suspended) then
        raise exception 'suspended';
    end if;
    select * into pkg from public.gem_packages where id = p_package and active;
    if pkg is null then raise exception 'package_not_found'; end if;
    select value into pay_to from public.app_config
     where key = case p_method
         when 'vodafone' then 'vodafone_cash_number'
         when 'etisalat' then 'etisalat_cash_number' end;
    if pay_to is null or pay_to = '' then raise exception 'method_unavailable'; end if;
    if exists (select 1 from public.payment_orders
                where user_id = me and status = 'pending') then
        raise exception 'pending_exists';
    end if;
    select coalesce(value::int, 0) into pct
      from public.app_config where key = 'manual_bonus_pct';
    bonus := floor(pkg.gems * pct / 100.0)::int;
    loop
        new_code := 'DL' || upper(substr(md5(random()::text), 1, 6));
        begin
            insert into public.payment_orders
                (user_id, package_id, gems, bonus_gems, amount_egp, method,
                 sender_phone, proof_path, code)
            values (me, pkg.id, pkg.gems, bonus, pkg.price_egp, p_method,
                    p_sender_phone, p_proof_path, new_code)
            returning id into new_id;
            exit;
        exception when unique_violation then
            tries := tries + 1;
            if tries > 5 then raise exception 'code_gen_failed'; end if;
        end;
    end loop;
    -- إشعار الأدمنز بوجود طلب جديد
    insert into public.notifications (user_id, type, payload)
    select id, 'account',
           jsonb_build_object('kind', 'payment_order', 'order_id', new_id)
      from public.profiles where is_admin;
    return jsonb_build_object(
        'order_id', new_id, 'code', new_code, 'pay_to', pay_to,
        'amount_egp', pkg.price_egp, 'gems', pkg.gems, 'bonus_gems', bonus);
end $$;

-- مراجعة طلب دفع (أدمن): قبول يُنزل الجواهر ذريًا
create or replace function public.admin_review_payment(
    p_order uuid, p_approve boolean, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ord record; total int;
begin
    if not public.is_admin() then raise exception 'forbidden'; end if;
    select * into ord from public.payment_orders where id = p_order for update;
    if ord is null then raise exception 'order_not_found'; end if;
    if ord.status <> 'pending' then
        return jsonb_build_object('ok', false, 'reason', 'already_reviewed');
    end if;
    if p_approve then
        total := ord.gems + ord.bonus_gems;
        update public.wallets set balance = balance + total, updated_at = now()
         where user_id = ord.user_id;
        insert into public.transactions
            (user_id, amount, type, status, reference_id)
        values (ord.user_id, total, 'purchase', 'completed',
                'manual:' || ord.code);
        update public.payment_orders
           set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
         where id = p_order;
        insert into public.notifications (user_id, type, payload)
        values (ord.user_id, 'purchase_success',
                jsonb_build_object('order_id', p_order, 'gems', total));
    else
        update public.payment_orders
           set status = 'rejected', reject_reason = p_reason,
               reviewed_by = auth.uid(), reviewed_at = now()
         where id = p_order;
        insert into public.notifications (user_id, type, payload)
        values (ord.user_id, 'account',
                jsonb_build_object('kind', 'payment_rejected',
                                   'reason', coalesce(p_reason, '')));
    end if;
    return jsonb_build_object('ok', true);
end $$;

-- ---------- أدوات الإدارة ----------
create or replace function public.admin_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare today_start timestamptz := date_trunc('day', now());
begin
    if not public.is_admin() then raise exception 'forbidden'; end if;
    return jsonb_build_object(
        'users_total', (select count(*) from public.profiles),
        'users_today', (select count(*) from public.profiles
                         where created_at >= today_start),
        'pending_orders', (select count(*) from public.payment_orders
                            where status = 'pending'),
        'gems_sold_today', (select coalesce(sum(amount), 0)
                              from public.transactions
                             where type = 'purchase'
                               and created_at >= today_start),
        'gifts_today', (select count(*) from public.gift_sends
                         where created_at >= today_start),
        'open_reports', (select count(*) from public.reports
                          where status = 'open'));
end $$;

create or replace function public.admin_list_orders(
    p_status text default 'pending')
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    if not public.is_admin() then raise exception 'forbidden'; end if;
    return coalesce((
        select jsonb_agg(x) from (
            select o.id, o.user_id, o.gems, o.bonus_gems, o.amount_egp,
                   o.method, o.sender_phone, o.proof_path, o.code, o.status,
                   o.reject_reason, o.created_at,
                   case when p.identity_mode = 'public' and p.share_info
                        then coalesce(p.display_name, p.anonymous_alias)
                        else p.anonymous_alias end as user_name,
                   gp.name_key as package_key
              from public.payment_orders o
              join public.profiles p on p.id = o.user_id
              join public.gem_packages gp on gp.id = o.package_id
             where o.status = p_status
             order by o.created_at asc
             limit 100) x), '[]'::jsonb);
end $$;

create or replace function public.admin_search_users(q text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    if not public.is_admin() then raise exception 'forbidden'; end if;
    return coalesce((
        select jsonb_agg(x) from (
            select p.id,
                   case when p.identity_mode = 'public' and p.share_info
                        then coalesce(p.display_name, p.anonymous_alias)
                        else p.anonymous_alias end as shown_name,
                   p.email, p.is_vip, p.is_suspended, p.created_at,
                   coalesce(w.balance, 0) as balance
              from public.profiles p
              left join public.wallets w on w.user_id = p.id
             where q = '' or p.anonymous_alias ilike '%' || q || '%'
                or p.display_name ilike '%' || q || '%'
                or p.username ilike '%' || q || '%'
                or p.email ilike '%' || q || '%'
             order by p.created_at desc
             limit 30) x), '[]'::jsonb);
end $$;

create or replace function public.admin_grant_gems(
    p_user uuid, p_amount int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare bal int;
begin
    if not public.is_admin() then raise exception 'forbidden'; end if;
    if p_amount = 0 then raise exception 'bad_amount'; end if;
    update public.wallets
       set balance = greatest(0, balance + p_amount), updated_at = now()
     where user_id = p_user
     returning balance into bal;
    if bal is null then raise exception 'user_not_found'; end if;
    insert into public.transactions (user_id, amount, type, status, reference_id)
    values (p_user, p_amount,
            case when p_amount > 0 then 'bonus' else 'refund' end,
            'completed', 'admin:' || auth.uid()::text);
    insert into public.notifications (user_id, type, payload)
    values (p_user, 'account',
            jsonb_build_object('kind', 'admin_grant', 'amount', p_amount));
    return jsonb_build_object('ok', true, 'balance', bal);
end $$;

create or replace function public.admin_set_suspended(
    p_user uuid, p_suspended boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
    if not public.is_admin() then raise exception 'forbidden'; end if;
    if p_user = auth.uid() then raise exception 'cannot_suspend_self'; end if;
    update public.profiles set is_suspended = p_suspended where id = p_user;
end $$;

create or replace function public.admin_get_config()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    if not public.is_admin() then raise exception 'forbidden'; end if;
    return (select jsonb_object_agg(key, value) from public.app_config);
end $$;

create or replace function public.admin_set_config(p_key text, p_value text)
returns void language plpgsql security definer set search_path = public as $$
begin
    if not public.is_admin() then raise exception 'forbidden'; end if;
    if p_key not in ('vodafone_cash_number', 'etisalat_cash_number',
                     'manual_bonus_pct', 'transfer_daily_cap',
                     'referral_reward', 'contest_prize_gems',
                     'vip_price_gems', 'vip_silver_price', 'vip_days') then
        raise exception 'key_not_allowed';
    end if;
    insert into public.app_config (key, value) values (p_key, p_value)
    on conflict (key) do update set value = excluded.value;
end $$;

create or replace function public.admin_list_reports()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    if not public.is_admin() then raise exception 'forbidden'; end if;
    return coalesce((
        select jsonb_agg(x) from (
            select r.id, r.reporter_id, r.reported_user_id, r.message_id,
                   r.reason, r.status, r.created_at
              from public.reports r
             where r.status = 'open'
             order by r.created_at desc
             limit 100) x), '[]'::jsonb);
end $$;

create or replace function public.admin_set_report_status(
    p_report uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
    if not public.is_admin() then raise exception 'forbidden'; end if;
    if p_status not in ('reviewed', 'actioned') then
        raise exception 'bad_status';
    end if;
    update public.reports set status = p_status where id = p_report;
end $$;
