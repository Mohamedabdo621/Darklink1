-- ============================================================
-- DARKLINK — معرّف عام حرف-رقم (A-1…) + تميّز الاسم المعروض
-- 2026-11-28 — round 2
-- 1) profiles.public_code: كود عام فريد بصيغة <حروف>-<رقم>، كل
--    بادئة = 50 ألف مستخدم (A-1..A-50000، B-1..، … Z-50000،
--    بعدها AB-1..، AC-1..، … AZ-1..، BA-1.. — Excel-style مع
--    تخطّي AA حسب طلب أليكس). يُسند تلقائيًا بترتيب التسجيل
--    (sequence + دالة تحويل)، ولا يتغير أبدًا. public_id (14 رقم)
--    يبقى في القاعدة للتوافق لكن لا يظهر في الواجهة بعد الآن.
-- 2) الاسم المعروض فريد: unique index على lower(display_name)،
--    والتحقق المسبق يتم من العميل عبر is_display_name_available.
-- 3) public_code يظهر في get_public_profile + by_code +
--    discover_profiles + get_followers/get_following +
--    find_by_username عشان التنقل للملفات يستخدم الكود.
-- ============================================================

-- ---------- تسلسل + دالة تحويل الرقم لكود ----------
create sequence if not exists public.public_code_seq;

create or replace function public.public_code_for(p_num bigint)
returns text language plpgsql immutable as $$
declare
    batch bigint := (p_num - 1) / 50000 + 1;   -- رقم الدفعة (1 = A)
    within_num bigint := (p_num - 1) % 50000 + 1;  -- 1..50000 داخل الدفعة
    len int := 1;
    prev_cum bigint := 0;
    cum bigint := 0;
    j bigint;
    v bigint;
    digits int[] := array[]::int[];
    i int;
    prefix text := '';
begin
    if p_num is null or p_num < 1 then
        raise exception 'bad_public_code_number';
    end if;
    -- عدد البادئات الصالحة بطول L: بطول 1 = 26 (A..Z)،
    -- وبطول 2+ = 26^L - 1 (كل البادئات إلا المكوّنة من A فقط: AA، AAA…)
    loop
        if len = 1 then cum := prev_cum + 26;
        else cum := prev_cum + (power(26::numeric, len))::bigint - 1; end if;
        exit when batch <= cum;
        prev_cum := cum;
        len := len + 1;
    end loop;
    j := batch - prev_cum;  -- ترتيب البادئة بين بادئات نفس الطول (1-based)
    v := case when len = 1 then j - 1 else j end;  -- j=1 بطول 2 = AB مش AA
    for i in 1..len loop
        digits := array_prepend((v % 26)::int, digits);
        v := v / 26;
    end loop;
    for i in 1..len loop
        prefix := prefix || chr(65 + digits[i]);
    end loop;
    return prefix || '-' || within_num::text;
end $$;

-- ---------- العمود + إسناد تلقائي عند إنشاء الملف ----------
alter table public.profiles add column if not exists public_code text;

create or replace function public.assign_public_code()
returns trigger language plpgsql as $$
begin
    if new.public_code is null then
        new.public_code := public.public_code_for(nextval('public.public_code_seq'));
    end if;
    return new;
end $$;

drop trigger if exists profiles_assign_code on public.profiles;
create trigger profiles_assign_code before insert on public.profiles
    for each row execute function public.assign_public_code();

-- ---------- تعبئة الحسابات الحالية (الترتيب المعتمَد 2026-11-28):
-- أليكس A-1، الديمو A-2، Unknown_110 A-3، Unknown_987 A-4 ----------
update public.profiles set public_code = 'A-1'
 where id = '42bcb91c-8b45-4212-a9a1-d9732c9754cd';
update public.profiles set public_code = 'A-2'
 where id = '28d8747e-7c2c-451e-a28c-0b46d8a028d3';
update public.profiles set public_code = 'A-3'
 where id = 'b45eb5b0-bfc5-4cd9-86a7-ef04e857e625';
update public.profiles set public_code = 'A-4'
 where id = '9fe1c624-be31-4377-b968-7407181d53e4';

-- التسلسل يبدأ بعد آخر رقم مستخدَم
select setval('public.public_code_seq',
    (select count(*) from public.profiles where public_code is not null), true);

-- شبكة أمان: أي صف قديم تاني (غير متوقع) ياخد كوده بترتيب التسجيل
do $$
declare r record;
begin
    for r in select id from public.profiles
              where public_code is null order by created_at loop
        update public.profiles
           set public_code = public.public_code_for(nextval('public.public_code_seq'))
         where id = r.id;
    end loop;
end $$;

alter table public.profiles alter column public_code set not null;
create unique index if not exists profiles_public_code_key
    on public.profiles (public_code);

-- ---------- الاسم المعروض فريد (غير حساس لحالة الأحرف؛ NULL مسموح) ----------
create unique index if not exists profiles_display_name_lower_uidx
    on public.profiles (lower(display_name));

-- قصّ المسافات من الاسم المعروض قبل الحفظ (دفاع في القاعدة؛ العميل بيقصّ برضه)
create or replace function public.normalize_profile_names()
returns trigger language plpgsql as $$
begin
    if new.display_name is not null then
        new.display_name := nullif(btrim(new.display_name), '');
    end if;
    return new;
end $$;

drop trigger if exists profiles_normalize on public.profiles;
create trigger profiles_normalize before insert or update on public.profiles
    for each row execute function public.normalize_profile_names();

-- ---------- التحقق المسبق من توفر الاسم (باستثناء اسم المستخدم نفسه) ----------
create or replace function public.is_display_name_available(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
    select not exists (
        select 1 from public.profiles
         where display_name is not null
           and lower(display_name) = lower(btrim(p_name))
           and id <> auth.uid()
    );
$$;

-- ---------- الملف العام: يرجع public_code + بحث بالكود ----------
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
        'interests', case when p.share_info then p.interests else '{}'::text[] end,
        'last_seen_at', case when p.show_last_seen then p.last_seen_at else null end,
        'public_id', p.public_id,
        'public_code', p.public_code,
        'created_at', p.created_at,
        'followers_count', (select count(*) from public.follows where following_id = target),
        'following_count', (select count(*) from public.follows where follower_id = target),
        'follows_me', exists (select 1 from public.follows
                               where follower_id = target and following_id = auth.uid()));
end $$;

create or replace function public.get_public_profile_by_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
    select id into target from public.profiles
     where public_code = upper(btrim(p_code));
    if not found then return null; end if;
    return public.get_public_profile(target);
end $$;

-- ---------- واجهة الاكتشاف: تضيف public_code ----------
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
    p.interests,
    case when p.show_last_seen then p.last_seen_at else null end as last_seen_at,
    p.created_at,
    p.public_code
from public.profiles p
where p.discoverable
  and p.id <> auth.uid()
  and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid()));

-- ---------- قوائم المتابعة: تضيف public_code ----------
create or replace function public.get_followers(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); out jsonb;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    if not exists (select 1 from public.profiles where id = p_user) then
        raise exception 'not_found'; end if;
    if public.is_blocked_pair(me, p_user) then return '[]'::jsonb; end if;
    select coalesce(jsonb_agg(
        jsonb_build_object(
            'user_id', pr.id,
            'shown_name', case when pr.identity_mode = 'public' and pr.share_info
                                   and pr.display_name is not null
                              then pr.display_name else pr.anonymous_alias end,
            'username', case when pr.identity_mode = 'public' then pr.username else null end,
            'avatar_url', case when pr.share_photo then pr.avatar_url else null end,
            'public_code', pr.public_code)
        order by f.created_at desc), '[]'::jsonb)
      into out
      from public.follows f
      join public.profiles pr on pr.id = f.follower_id
     where f.following_id = p_user
       and not public.is_blocked_pair(me, f.follower_id);
    return out;
end $$;

create or replace function public.get_following(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); out jsonb;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    if not exists (select 1 from public.profiles where id = p_user) then
        raise exception 'not_found'; end if;
    if public.is_blocked_pair(me, p_user) then return '[]'::jsonb; end if;
    select coalesce(jsonb_agg(
        jsonb_build_object(
            'user_id', pr.id,
            'shown_name', case when pr.identity_mode = 'public' and pr.share_info
                                   and pr.display_name is not null
                              then pr.display_name else pr.anonymous_alias end,
            'username', case when pr.identity_mode = 'public' then pr.username else null end,
            'avatar_url', case when pr.share_photo then pr.avatar_url else null end,
            'public_code', pr.public_code)
        order by f.created_at desc), '[]'::jsonb)
      into out
      from public.follows f
      join public.profiles pr on pr.id = f.following_id
     where f.follower_id = p_user
       and not public.is_blocked_pair(me, f.following_id);
    return out;
end $$;

-- ---------- البحث باليوزر: يضيف public_code (لمنشن البوستات) ----------
create or replace function public.find_by_username(p_username text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); out jsonb;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    select row_to_json(r) into out
      from (
        select p.id,
               case when p.identity_mode = 'public' and p.share_info
                         and p.display_name is not null
                    then p.display_name else p.anonymous_alias end as shown_name,
               case when p.identity_mode = 'public' then p.username else null end as username,
               case when p.share_photo then p.avatar_url else null end as avatar_url,
               p.is_vip,
               p.public_code
          from public.profiles p
         where lower(p.username) = lower(p_username)
           and not public.is_blocked_pair(me, p.id)
         limit 1
      ) r;
    return coalesce(out, 'null'::jsonb);
end $$;
