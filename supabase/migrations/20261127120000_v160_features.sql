-- DARKLINK v1.6.0 — ميزات جديدة على مستوى قاعدة البيانات
-- 1) messages.edited_at: تاريخ آخر تعديل للرسالة (التعديل خلال 15 دقيقة)
-- 2) profiles.theme_preference: تفضيل السمة (light/dark/system) — يتبع المستخدم عبر الأجهزة
-- 3) profiles.public_id: معرف حساب عام من 14 رقم للعرض — الـ UUID الداخلي
--    (profiles.id) يفضل زي ما هو: هو الـ PK والـ FK لكل حاجة، وpublic_id للعرض بس

-- 1) عمود التعديل
alter table public.messages
    add column if not exists edited_at timestamptz;

-- 2) تفضيل السمة
alter table public.profiles
    add column if not exists theme_preference text;
do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'profiles_theme_preference_check'
    ) then
        alter table public.profiles
            add constraint profiles_theme_preference_check
            check (theme_preference is null
                   or theme_preference in ('light', 'dark', 'system'));
    end if;
end $$;

-- 3) المعرف العام (14 رقم)
alter table public.profiles
    add column if not exists public_id bigint;

-- مولّد أرقام عشوائية من 14 رقم مع إعادة المحاولة عند التصادم
-- (نفس نمط generate_alias() الموجود)
create or replace function public.generate_public_id()
returns bigint language plpgsql as $$
declare
    candidate bigint;
    tries int := 0;
begin
    loop
        candidate := 10000000000000 + floor(random() * 90000000000000)::bigint;
        exit when not exists (
            select 1 from public.profiles where public_id = candidate);
        tries := tries + 1;
        if tries > 100 then
            raise exception 'could not generate a unique public_id after 100 attempts';
        end if;
    end loop;
    return candidate;
end;
$$;

-- تعبئة الصفوف الموجودة: كل حساب ياخد رقم مختلف
update public.profiles
    set public_id = public.generate_public_id()
    where public_id is null;

-- القيمة الافتراضية: أي حساب جديد ياخد رقم تلقائيًا عند التسجيل
alter table public.profiles
    alter column public_id set default public.generate_public_id();

-- التفرد + النطاق (14 رقم بالظبط) — بعد التعبئة
create unique index if not exists profiles_public_id_unique_idx
    on public.profiles (public_id);
do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'profiles_public_id_check'
    ) then
        alter table public.profiles
            add constraint profiles_public_id_check
            check (public_id between 10000000000000 and 99999999999999);
    end if;
end $$;

-- بعد التعبئة مفيش NULL — خليه إلزامي
alter table public.profiles
    alter column public_id set not null;

-- 4) البروفايل العام يرجّع المعرف الجديد (الدالة بتبني الـ JSON يدويًا،
--    فلازم نضيف الحقل هنا — المعرف عام بطبيعته ومش مربوط بإعدادات الخصوصية)
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
        'created_at', p.created_at);
end $$;
