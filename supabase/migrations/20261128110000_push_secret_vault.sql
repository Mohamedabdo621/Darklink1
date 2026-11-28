-- DARKLINK — push_secret out of app_config (2026-11-28)
-- The shared push secret now lives in two secure stores only:
--   * Supabase Vault (vault.secrets 'push_secret') — read by the DB trigger
--   * Edge Function secret PUSH_SECRET — read by push-send via Deno.env
-- app_config must never hold it again: admin_get_config() excludes it
-- defensively even after the row is deleted, and the dashboard never
-- sees it. The admin dashboard does NOT call push-send (only the
-- notifications trigger does, via pg_net), so nothing else changes.

create or replace function public.enqueue_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    fn_url text;
    fn_secret text;
    muted uuid[];
begin
    select value into fn_url from public.app_config where key = 'push_fn_url';
    select decrypted_secret into fn_secret
      from vault.decrypted_secrets where name = 'push_secret';
    if fn_url is null or coalesce(fn_secret, '') = '' then
        return new;
    end if;
    if new.type in ('new_message', 'voice_note')
       and (new.payload ->> 'conversation_id') is not null then
        select muted_for into muted from public.conversations
         where id = (new.payload ->> 'conversation_id')::uuid;
        if muted is not null and new.user_id = any (muted) then
            return new;  -- المحادثة مكتومة عند هذا المستخدم
        end if;
    end if;
    perform net.http_post(
        url := fn_url,
        body := jsonb_build_object('notification_id', new.id),
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-push-secret', fn_secret),
        timeout_milliseconds := 5000);
    return new;
end $$;

create or replace function public.admin_get_config()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    if not public.is_admin() then raise exception 'forbidden'; end if;
    return (select jsonb_object_agg(key, value) from public.app_config
            where key <> 'push_secret');
end $$;

delete from public.app_config where key = 'push_secret';
