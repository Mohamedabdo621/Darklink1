-- DARKLINK — معلومات الدفع اليدوي العامة (أرقام الشركة تُعرض للمشترين أصلًا)
create or replace function public.public_cash_info()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    return jsonb_build_object(
        'vodafone', coalesce(
            (select value from public.app_config
              where key = 'vodafone_cash_number'), ''),
        'etisalat', coalesce(
            (select value from public.app_config
              where key = 'etisalat_cash_number'), ''),
        'bonus_pct', coalesce(
            (select value::int from public.app_config
              where key = 'manual_bonus_pct'), 0));
end $$;
