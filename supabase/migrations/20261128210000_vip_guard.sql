-- DARKLINK — VIP double-purchase guard (2026-11-28)
-- activate_vip_tier had no active-VIP guard: every purchase stacked +30
-- days (Alex's vip_until reached 2027-03-25 after 4 purchases).
-- Redefines the function with the identical signature and behavior,
-- except it now raises 'vip_already_active' when the caller's current
-- vip_until is still in the future — BEFORE any gem deduction.
-- Existing active VIPs are left untouched (no reset, no refund).

create or replace function public.activate_vip_tier(p_tier text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    me uuid := auth.uid();
    price int; days int; bal int; cur_until timestamptz; new_until timestamptz;
begin
    if p_tier not in ('silver', 'gold') then raise exception 'bad_tier'; end if;
    -- Guard: refuse while VIP is still active (checked before deducting gems).
    select vip_until into cur_until from public.profiles where id = me;
    if cur_until is not null and cur_until > now() then
        raise exception 'vip_already_active';
    end if;
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
