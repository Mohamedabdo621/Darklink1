-- DARKLINK — معلومات التحديث العامة (مفاتيح apk_* للـ updateCheck — نفس نمط public_cash_info)
create or replace function public.public_app_info()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    return jsonb_build_object(
        'apk_latest_version', coalesce(
            (select value from public.app_config
              where key = 'apk_latest_version'), ''),
        'apk_min_version', coalesce(
            (select value from public.app_config
              where key = 'apk_min_version'), ''),
        'apk_download_url', coalesce(
            (select value from public.app_config
              where key = 'apk_download_url'), ''),
        'apk_changelog', coalesce(
            (select value from public.app_config
              where key = 'apk_changelog'), ''));
end $$;
