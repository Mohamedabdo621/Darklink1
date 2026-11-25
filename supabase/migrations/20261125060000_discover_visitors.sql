-- ============================================================
-- DARKLINK — اهتمامات + آخر ظهور في الاكتشاف + زوار البروفايل
-- 2026-11-25 — مرحلتا الاكتشف والزوار (v1.2)
-- ============================================================

alter table public.profiles
    add column if not exists interests text[] not null default '{}';

-- إعادة بناء عرض الاكتشاف: اهتمامات + آخر ظهور (حسب مفتاح الخصوصية)
drop view if exists public.discover_profiles;
create view public.discover_profiles as
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
    p.created_at
from public.profiles p
where p.discoverable
  and p.id <> auth.uid()
  and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid()));

-- البروفايل العام: إضافة الاهتمامات وآخر ظهور
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
        'created_at', p.created_at);
end $$;

-- ---------- زوار البروفايل ----------
create table if not exists public.profile_visits (
    visitor_id uuid not null references public.profiles (id) on delete cascade,
    profile_id uuid not null references public.profiles (id) on delete cascade,
    visited_at timestamptz not null default now(),
    primary key (visitor_id, profile_id),
    check (visitor_id <> profile_id)
);
alter table public.profile_visits enable row level security;

-- صاحب البروفايل يقرأ زواره (العرض نفسه VIP داخل التطبيق)
drop policy if exists visits_owner_read on public.profile_visits;
create policy visits_owner_read on public.profile_visits
    for select using (profile_id = auth.uid());

create or replace function public.record_profile_visit(p_profile uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
    if p_profile is null or p_profile = auth.uid() then return; end if;
    if exists (select 1 from public.blocks b
               where (b.blocker_id = auth.uid() and b.blocked_id = p_profile)
                  or (b.blocker_id = p_profile and b.blocked_id = auth.uid())) then
        return;
    end if;
    insert into public.profile_visits (visitor_id, profile_id, visited_at)
    values (auth.uid(), p_profile, now())
    on conflict (visitor_id, profile_id)
    do update set visited_at = excluded.visited_at;
end $$;
