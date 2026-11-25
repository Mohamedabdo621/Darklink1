-- ============================================================
-- DARKLINK — إشعارات Push: توكنات الأجهزة + زناد إرسال تلقائي
-- 2026-11-25 — مرحلة الإشعارات (v1.2)
-- السرّ المشترك يُولّد داخل القاعدة نفسها (لا يمر في Git ولا الشات)
-- ============================================================

create extension if not exists pg_net;

create table if not exists public.push_tokens (
    user_id    uuid not null references public.profiles (id) on delete cascade,
    token      text not null,
    platform   text not null default 'android',
    updated_at timestamptz not null default now(),
    primary key (user_id, token)
);
alter table public.push_tokens enable row level security;
drop policy if exists push_tokens_own on public.push_tokens;
create policy push_tokens_own on public.push_tokens
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- إعدادات الإرسال (القيم غير السرية فقط هنا)
insert into public.app_config (key, value) values
    ('push_fn_url', 'https://hffnmnhyjowaqbkgnnnl.supabase.co/functions/v1/push-send'),
    ('push_secret', '')
on conflict (key) do nothing;

-- توليد السرّ داخل القاعدة إن كان فارغًا
update public.app_config
   set value = encode(gen_random_bytes(24), 'hex')
 where key = 'push_secret' and value = '';

-- زناد: كل إشعار جديد يُرسل Push (مع احترام كتم المحادثة)
create or replace function public.enqueue_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    fn_url text;
    fn_secret text;
    muted uuid[];
begin
    select value into fn_url from public.app_config where key = 'push_fn_url';
    select value into fn_secret from public.app_config where key = 'push_secret';
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

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push
    after insert on public.notifications
    for each row execute function public.enqueue_push();
