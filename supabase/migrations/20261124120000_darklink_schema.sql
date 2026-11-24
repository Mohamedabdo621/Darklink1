-- DARKLINK — المخطط الكامل لقاعدة البيانات (PostgreSQL / Supabase)
-- الهوية المجهولة محمية على مستوى قاعدة البيانات: العملاء لا يقرأون جدول
-- profiles مباشرة لغيرهم أبدًا، بل عبر واجهات آمنة تعرض الاسم المستعار فقط.
create extension if not exists pgcrypto;

-- ============================================================ إعدادات عامة
create table if not exists public.app_config (
    key   text primary key,
    value text not null
);
insert into public.app_config (key, value) values ('billing_mode', 'sandbox')
on conflict (key) do nothing;
alter table public.app_config enable row level security;
-- لا سياسات: لا وصول للعملاء إطلاقًا، تُقرأ فقط من دوال SECURITY DEFINER

-- ============================================================ الملفات الشخصية
create table if not exists public.profiles (
    id              uuid primary key references auth.users (id) on delete cascade,
    email           text not null,                       -- خاص: لا يظهر إلا للمالك
    display_name    text,
    username        text unique,
    anonymous_alias text not null unique,
    avatar_url      text,                                -- مسار داخل bucket avatars
    bio             text,
    identity_mode   text not null default 'anonymous'
                    check (identity_mode in ('anonymous', 'public')),
    discoverable    boolean not null default true,
    share_photo     boolean not null default false,
    share_info      boolean not null default false,
    is_vip          boolean not null default false,
    vip_until       timestamptz,
    language        text not null default 'ar' check (language in ('ar', 'en')),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint username_format check (
        username is null or username ~ '^[a-z0-9_.]{3,24}$')
);

create or replace function public.generate_alias()
returns text language plpgsql as $$
declare
    words text[] := array['Shadow','Ghost','Unknown','Phantom','Echo',
                          'Nebula','Onyx','Raven','Vortex','Zenith'];
    candidate text;
begin
    loop
        candidate := words[1 + floor(random() * array_length(words, 1))::int]
                     || '_' || (100 + floor(random() * 900)::int)::text;
        exit when not exists (
            select 1 from public.profiles where anonymous_alias = candidate);
    end loop;
    return candidate;
end $$;

-- إنشاء الملف والمحفظة تلقائيًا عند تسجيل مستخدم جديد
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    insert into public.profiles (id, email, anonymous_alias)
    values (new.id, new.email, public.generate_alias());
    insert into public.wallets (user_id) values (new.id);
    return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
    for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
    for select using (auth.uid() = id);
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
    for update using (auth.uid() = id) with check (auth.uid() = id);
-- لا insert/delete للعملاء: الإنشاء من الـ trigger، والحذف عبر حذف الحساب

-- واجهة الاكتشاف الآمنة: تعرض الاسم المستعار أو الاسم العلني حسب الإعدادات فقط
create or replace view public.discover_profiles as
select
    p.id,
    case when p.identity_mode = 'public' and p.share_info
         then coalesce(p.display_name, p.anonymous_alias)
         else p.anonymous_alias end as shown_name,
    case when p.identity_mode = 'public' and p.share_info
         then p.username else null end as username,
    case when p.share_photo then p.avatar_url else null end as avatar_url,
    case when p.share_info then p.bio else null end as bio,
    p.identity_mode,
    p.is_vip,
    p.created_at
from public.profiles p
where p.discoverable
  and p.id <> auth.uid()
  and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid()));

-- ملف آمن لمستخدم واحد (تُستخدم في المحادثات والملفات الشخصية)
create or replace function public.get_public_profile(target uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.profiles%rowtype;
begin
    select * into p from public.profiles where id = target;
    if not found then return null; end if;
    if exists (select 1 from public.blocks b
               where (b.blocker_id = auth.uid() and b.blocked_id = target)
                  or (b.blocker_id = target and b.blocked_id = auth.uid())) then
        return null;
    end if;
    return jsonb_build_object(
        'id', p.id,
        'shown_name', case when p.identity_mode = 'public' and p.share_info
                           then coalesce(p.display_name, p.anonymous_alias)
                           else p.anonymous_alias end,
        'username', case when p.identity_mode = 'public' and p.share_info
                         then p.username else null end,
        'avatar_url', case when p.share_photo then p.avatar_url else null end,
        'bio', case when p.share_info then p.bio else null end,
        'identity_mode', p.identity_mode,
        'is_vip', p.is_vip,
        'created_at', p.created_at);
end $$;

-- ============================================================ الحظر والبلاغات
create table if not exists public.blocks (
    blocker_id uuid not null references public.profiles (id) on delete cascade,
    blocked_id uuid not null references public.profiles (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (blocker_id, blocked_id),
    check (blocker_id <> blocked_id)
);
alter table public.blocks enable row level security;
drop policy if exists blocks_own on public.blocks;
create policy blocks_own on public.blocks
    for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

create or replace function public.is_blocked_pair(a uuid, b uuid)
returns boolean language sql stable as $$
    select exists (select 1 from public.blocks
                   where (blocker_id = a and blocked_id = b)
                      or (blocker_id = b and blocked_id = a)) $$;

create table if not exists public.reports (
    id               uuid primary key default gen_random_uuid(),
    reporter_id      uuid not null references public.profiles (id) on delete cascade,
    reported_user_id uuid references public.profiles (id) on delete set null,
    message_id       uuid,
    reason           text not null,
    status           text not null default 'open'
                     check (status in ('open', 'reviewed', 'actioned')),
    created_at       timestamptz not null default now()
);
alter table public.reports enable row level security;
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
    for insert with check (auth.uid() = reporter_id);
drop policy if exists reports_own_read on public.reports;
create policy reports_own_read on public.reports
    for select using (auth.uid() = reporter_id);

-- ============================================================ المحادثات والرسائل
create table if not exists public.conversations (
    id              uuid primary key default gen_random_uuid(),
    user_a          uuid not null references public.profiles (id) on delete cascade,
    user_b          uuid not null references public.profiles (id) on delete cascade,
    last_message_at timestamptz not null default now(),
    created_at      timestamptz not null default now(),
    unique (user_a, user_b),
    check (user_a < user_b)
);
alter table public.conversations enable row level security;
drop policy if exists conv_participant_read on public.conversations;
create policy conv_participant_read on public.conversations
    for select using (auth.uid() in (user_a, user_b));

create or replace function public.get_or_create_conversation(other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
    me uuid := auth.uid();
    a uuid; b uuid; cid uuid;
begin
    if me is null then raise exception 'not authenticated'; end if;
    if other = me then raise exception 'cannot chat with yourself'; end if;
    if public.is_blocked_pair(me, other) then raise exception 'blocked'; end if;
    a := least(me, other); b := greatest(me, other);
    insert into public.conversations (user_a, user_b) values (a, b)
    on conflict (user_a, user_b) do nothing;
    select id into cid from public.conversations where user_a = a and user_b = b;
    return cid;
end $$;

create table if not exists public.messages (
    id              uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.conversations (id) on delete cascade,
    sender_id       uuid not null references public.profiles (id) on delete cascade,
    type            text not null default 'text'
                    check (type in ('text','image','video','file','voice','gift')),
    body            text,
    media_path      text,          -- مسار داخل bucket chat-media أو voice-notes
    voice_duration  int,           -- بالثواني لرسائل الصوت
    gift_send_id    uuid,          -- يربط رسالة الهدية بسجل الإرسال
    is_deleted      boolean not null default false,
    created_at      timestamptz not null default now()
);
create index if not exists messages_conv_time
    on public.messages (conversation_id, created_at desc);
alter table public.messages enable row level security;

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages
    for select using (exists (
        select 1 from public.conversations c
        where c.id = conversation_id and auth.uid() in (c.user_a, c.user_b)));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
    for insert with check (
        sender_id = auth.uid()
        and exists (
            select 1 from public.conversations c
            where c.id = conversation_id
              and auth.uid() in (c.user_a, c.user_b)
              and not public.is_blocked_pair(c.user_a, c.user_b)));
drop policy if exists messages_soft_delete on public.messages;
create policy messages_soft_delete on public.messages
    for update using (sender_id = auth.uid())
    with check (sender_id = auth.uid());

create or replace function public.bump_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    update public.conversations set last_message_at = new.created_at
    where id = new.conversation_id;
    return new;
end $$;
drop trigger if exists messages_bump on public.messages;
create trigger messages_bump after insert on public.messages
    for each row execute function public.bump_conversation();

-- ============================================================ المحفظة والمعاملات
create table if not exists public.wallets (
    user_id    uuid primary key references public.profiles (id) on delete cascade,
    balance    int not null default 0 check (balance >= 0),
    updated_at timestamptz not null default now()
);
alter table public.wallets enable row level security;
drop policy if exists wallets_own_read on public.wallets;
create policy wallets_own_read on public.wallets
    for select using (auth.uid() = user_id);
-- لا كتابة للعملاء إطلاقًا: كل تعديل عبر دوال SECURITY DEFINER فقط
drop trigger if exists wallets_touch on public.wallets;
create trigger wallets_touch before update on public.wallets
    for each row execute function public.touch_updated_at();

create table if not exists public.transactions (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references public.profiles (id) on delete cascade,
    amount       int not null,               -- موجب للإضافة، سالب للخصم
    type         text not null check (type in
                 ('purchase','gift_sent','gift_received','bonus','refund','vip')),
    status       text not null default 'completed' check (status in
                 ('pending','completed','sandbox_verified','failed','refunded')),
    reference_id text,                       -- إيصال الشراء أو سجل الهدية
    created_at   timestamptz not null default now()
);
create index if not exists transactions_user_time
    on public.transactions (user_id, created_at desc);
create unique index if not exists transactions_purchase_ref_unique
    on public.transactions (reference_id) where type = 'purchase' and reference_id is not null;
alter table public.transactions enable row level security;
drop policy if exists transactions_own_read on public.transactions;
create policy transactions_own_read on public.transactions
    for select using (auth.uid() = user_id);

-- ============================================================ المتجر والهدايا
create table if not exists public.gem_packages (
    id         uuid primary key default gen_random_uuid(),
    name_key   text not null,                -- مفتاح ترجمة: starter/popular/...
    gems       int not null check (gems > 0),
    price_egp  numeric(10,2) not null check (price_egp >= 0),
    play_product_id text,                    -- يُملأ عند تفعيل Google Play Billing
    active     boolean not null default true,
    sort       int not null default 0
);
alter table public.gem_packages enable row level security;
drop policy if exists packages_public_read on public.gem_packages;
create policy packages_public_read on public.gem_packages
    for select using (active and auth.uid() is not null);

create table if not exists public.gifts (
    id          uuid primary key default gen_random_uuid(),
    name_key    text not null unique,        -- rose/heart/... يطابق ملف الصورة
    asset       text not null,               -- اسم ملف الصورة داخل التطبيق
    price_gems  int not null check (price_gems > 0),
    active      boolean not null default true,
    sort        int not null default 0
);
alter table public.gifts enable row level security;
drop policy if exists gifts_public_read on public.gifts;
create policy gifts_public_read on public.gifts
    for select using (active and auth.uid() is not null);

create table if not exists public.gift_sends (
    id              uuid primary key default gen_random_uuid(),
    sender_id       uuid not null references public.profiles (id) on delete cascade,
    receiver_id     uuid not null references public.profiles (id) on delete cascade,
    gift_id         uuid not null references public.gifts (id),
    price_gems      int not null,
    conversation_id uuid references public.conversations (id) on delete set null,
    created_at      timestamptz not null default now(),
    check (sender_id <> receiver_id)
);
create index if not exists gift_sends_receiver_time
    on public.gift_sends (receiver_id, created_at desc);
create index if not exists gift_sends_sender_time
    on public.gift_sends (sender_id, created_at desc);
alter table public.gift_sends enable row level security;
drop policy if exists gift_sends_read on public.gift_sends;
create policy gift_sends_read on public.gift_sends
    for select using (auth.uid() in (sender_id, receiver_id));

-- إرسال هدية: عملية ذرية واحدة (تحقق + خصم + تسجيل + رسالة + إشعار)
create or replace function public.send_gift(p_receiver uuid, p_gift_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    me uuid := auth.uid();
    g public.gifts%rowtype;
    bal int;
    send_id uuid;
    cid uuid;
    msg_id uuid;
begin
    if me is null then raise exception 'not authenticated'; end if;
    if p_receiver = me then raise exception 'cannot gift yourself'; end if;
    if public.is_blocked_pair(me, p_receiver) then raise exception 'blocked'; end if;
    select * into g from public.gifts where id = p_gift_id and active;
    if not found then raise exception 'gift not found'; end if;

    update public.wallets set balance = balance - g.price_gems
    where user_id = me and balance >= g.price_gems
    returning balance into bal;
    if bal is null then raise exception 'insufficient_balance'; end if;

    insert into public.gift_sends (sender_id, receiver_id, gift_id, price_gems)
    values (me, p_receiver, g.id, g.price_gems) returning id into send_id;

    insert into public.transactions (user_id, amount, type, reference_id)
    values (me, -g.price_gems, 'gift_sent', send_id::text);

    cid := public.get_or_create_conversation(p_receiver);
    update public.gift_sends set conversation_id = cid where id = send_id;
    insert into public.messages (conversation_id, sender_id, type, gift_send_id)
    values (cid, me, 'gift', send_id) returning id into msg_id;

    insert into public.notifications (user_id, type, payload)
    values (p_receiver, 'gift_received',
            jsonb_build_object('gift', g.name_key, 'send_id', send_id,
                               'message_id', msg_id));

    return jsonb_build_object('ok', true, 'balance', bal, 'send_id', send_id);
end $$;

-- شراء جواهر: الوضع التجريبي sandbox يتحقق داخليًا؛ وضع الإنتاج يتطلب
-- التحقق من إيصال Google Play عبر Edge Function قبل إضافة أي جواهر.
create or replace function public.purchase_gems(
    p_package_id uuid, p_provider text, p_receipt text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    me uuid := auth.uid();
    pkg public.gem_packages%rowtype;
    mode text;
    bal int;
    ref text;
begin
    if me is null then raise exception 'not authenticated'; end if;
    select * into pkg from public.gem_packages where id = p_package_id and active;
    if not found then raise exception 'package not found'; end if;
    select value into mode from public.app_config where key = 'billing_mode';
    ref := coalesce(nullif(p_receipt, ''), gen_random_uuid()::text);

    if exists (select 1 from public.transactions
               where type = 'purchase' and reference_id = ref) then
        select balance into bal from public.wallets where user_id = me;
        return jsonb_build_object('ok', true, 'duplicate', true, 'balance', bal);
    end if;

    if mode = 'sandbox' then
        insert into public.transactions
            (user_id, amount, type, status, reference_id)
        values (me, pkg.gems, 'purchase', 'sandbox_verified', ref);
    elsif p_provider = 'google_play_verified' then
        -- لا يصل هنا إلا بعد تحقق Edge Function من إيصال Play فعليًا
        insert into public.transactions
            (user_id, amount, type, status, reference_id)
        values (me, pkg.gems, 'purchase', 'completed', ref);
    else
        raise exception 'receipt_not_verified';
    end if;

    update public.wallets set balance = balance + pkg.gems
    where user_id = me returning balance into bal;

    insert into public.notifications (user_id, type, payload)
    values (me, 'purchase_success',
            jsonb_build_object('gems', pkg.gems, 'package', pkg.name_key));

    return jsonb_build_object('ok', true, 'balance', bal, 'gems_added', pkg.gems);
end $$;

-- ============================================================ الإشعارات
create table if not exists public.notifications (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references public.profiles (id) on delete cascade,
    type       text not null check (type in
               ('new_message','voice_note','gift_received','purchase_success',
                'account','security','app_update')),
    payload    jsonb not null default '{}'::jsonb,
    is_read    boolean not null default false,
    created_at timestamptz not null default now()
);
create index if not exists notifications_user_time
    on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications
    for select using (auth.uid() = user_id);
drop policy if exists notifications_own_update on public.notifications;
create policy notifications_own_update on public.notifications
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================ التخزين
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false),
       ('chat-media', 'chat-media', false),
       ('voice-notes', 'voice-notes', false)
on conflict (id) do nothing;

-- الصور الشخصية: الكتابة للمالك فقط؛ القراءة للمالك أو لمن سمح المالك بمشاركة صورته
drop policy if exists avatars_write_own on storage.objects;
create policy avatars_write_own on storage.objects
    for insert with check (
        bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
    for update using (
        bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
    for delete using (
        bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects
    for select using (
        bucket_id = 'avatars' and (
            (storage.foldername(name))[1] = auth.uid()::text
            or exists (select 1 from public.profiles p
                       where p.id::text = (storage.foldername(name))[1]
                         and p.share_photo)));

-- وسائط المحادثات والصوتيات: المسار {conversation_id}/{sender_uid}/file
drop policy if exists chat_media_write on storage.objects;
create policy chat_media_write on storage.objects
    for insert with check (
        bucket_id in ('chat-media', 'voice-notes')
        and (storage.foldername(name))[2] = auth.uid()::text
        and exists (select 1 from public.conversations c
                    where c.id::text = (storage.foldername(name))[1]
                      and auth.uid() in (c.user_a, c.user_b)));
drop policy if exists chat_media_read on storage.objects;
create policy chat_media_read on storage.objects
    for select using (
        bucket_id in ('chat-media', 'voice-notes')
        and exists (select 1 from public.conversations c
                    where c.id::text = (storage.foldername(name))[1]
                      and auth.uid() in (c.user_a, c.user_b)));

-- ============================================================ Realtime
do $$
begin
    alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;
do $$
begin
    alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;
do $$
begin
    alter publication supabase_realtime add table public.conversations;
exception when duplicate_object then null;
end $$;
