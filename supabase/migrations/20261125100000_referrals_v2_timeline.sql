-- ============================================================
-- DARKLINK — إحالات v2 + التايم لاين
-- 2026-11-25 — v1.4
-- الإحالات: المُحيل +50 فور التسجيل، والمدعو +25 ترحيب
-- (بدل النظام القديم: 25 و25 عند أول شراء — يُلغى)
-- التايم لاين: بوستات + لايكات + تعليقات + بلاغات
-- ============================================================

-- ---------- إعدادات الإحالات الجديدة ----------
insert into public.app_config (key, value) values
    ('referral_inviter_reward', '50'),
    ('referral_welcome_reward', '25'),
    ('referral_daily_cap', '10')
on conflict (key) do nothing;

-- ---------- إلغاء مكافأة أول شراء القديمة ----------
drop trigger if exists transactions_referral_reward on public.transactions;
drop function if exists public.reward_referral_on_purchase();

-- ---------- ربط الدعوة مع المكافأة الفورية ----------
create or replace function public.bind_referral(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    me uuid := auth.uid();
    ref_id uuid;
    inviter_reward int;
    welcome_reward int;
    daily_cap int;
    rewarded_today int;
    do_reward boolean := true;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    select id into ref_id from public.profiles
     where 'DL' || upper(substr(md5(id::text), 1, 6)) = upper(trim(p_code));
    if ref_id is null then return jsonb_build_object('ok', false, 'reason', 'bad_code'); end if;
    if ref_id = me then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
    if exists (select 1 from public.referrals where referred_id = me) then
        return jsonb_build_object('ok', false, 'reason', 'already');
    end if;
    if exists (select 1 from public.profiles
                where id = me and created_at < now() - interval '7 days') then
        return jsonb_build_object('ok', false, 'reason', 'too_late');
    end if;

    select coalesce(value::int, 50) into inviter_reward
      from public.app_config where key = 'referral_inviter_reward';
    select coalesce(value::int, 25) into welcome_reward
      from public.app_config where key = 'referral_welcome_reward';
    select coalesce(value::int, 10) into daily_cap
      from public.app_config where key = 'referral_daily_cap';
    select count(*) into rewarded_today
      from public.referrals
     where referrer_id = ref_id and rewarded
       and created_at >= date_trunc('day', now());
    if rewarded_today >= daily_cap then do_reward := false; end if;

    insert into public.referrals (referrer_id, referred_id, rewarded)
    values (ref_id, me, do_reward);

    if do_reward then
        update public.wallets set balance = balance + inviter_reward, updated_at = now()
         where user_id = ref_id;
        update public.wallets set balance = balance + welcome_reward, updated_at = now()
         where user_id = me;
        insert into public.transactions (user_id, amount, type, status, reference_id)
        values (ref_id, inviter_reward, 'bonus', 'completed',
                'referral_inviter:' || me::text),
               (me, welcome_reward, 'bonus', 'completed',
                'referral_welcome:' || ref_id::text);
        insert into public.notifications (user_id, type, payload)
        values (ref_id, 'account',
                jsonb_build_object('kind', 'referral_reward',
                                   'amount', inviter_reward,
                                   'referred_id', me)),
               (me, 'account',
                jsonb_build_object('kind', 'referral_welcome',
                                   'amount', welcome_reward,
                                   'referrer_id', ref_id));
    end if;
    return jsonb_build_object('ok', true, 'rewarded', do_reward);
end $$;

-- ---------- إحصائيات دعواتي ----------
create or replace function public.my_referral_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    me uuid := auth.uid();
    invited int;
    earned int;
    today int;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    select count(*) into invited from public.referrals where referrer_id = me;
    select coalesce(sum(amount), 0) into earned
      from public.transactions
     where user_id = me and type = 'bonus'
       and reference_id like 'referral_inviter:%';
    select count(*) into today
      from public.referrals
     where referrer_id = me and rewarded
       and created_at >= date_trunc('day', now());
    return jsonb_build_object(
        'code', public.my_referral_code(),
        'invited', invited,
        'gems_earned', earned,
        'rewards_today', today);
end $$;

-- ---------- قائمة الدعوات للأدمن ----------
create or replace function public.admin_list_referrals(p_limit int default 50)
returns jsonb language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
    if not public.is_admin() then raise exception 'forbidden'; end if;
    select coalesce(jsonb_agg(row_to_json(r) order by r.created_at desc), '[]'::jsonb)
      into out
      from (
        select
            rf.referrer_id, rf.referred_id, rf.rewarded, rf.created_at,
            (select case when p.identity_mode = 'public' and p.display_name is not null
                         then p.display_name else p.anonymous_alias end
               from public.profiles p where p.id = rf.referrer_id) as referrer_name,
            (select case when p.identity_mode = 'public' and p.display_name is not null
                         then p.display_name else p.anonymous_alias end
               from public.profiles p where p.id = rf.referred_id) as referred_name
          from public.referrals rf
         order by rf.created_at desc
         limit greatest(1, least(100, p_limit))
      ) r;
    return out;
end $$;

-- ============================================================ التايم لاين
create table if not exists public.posts (
    id         uuid primary key default gen_random_uuid(),
    author_id  uuid not null references public.profiles (id) on delete cascade,
    body       text not null check (char_length(body) between 1 and 500),
    media_path text,
    is_hidden  boolean not null default false,
    created_at timestamptz not null default now()
);
create index if not exists posts_author_time on public.posts (author_id, created_at desc);
create index if not exists posts_time on public.posts (created_at desc);
alter table public.posts enable row level security;
drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts
    for select using (
        not is_hidden
        and not public.is_blocked_pair(auth.uid(), author_id));
drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own on public.posts
    for insert with check (auth.uid() = author_id);
drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own on public.posts
    for delete using (auth.uid() = author_id);

create table if not exists public.post_likes (
    post_id    uuid not null references public.posts (id) on delete cascade,
    user_id    uuid not null references public.profiles (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (post_id, user_id)
);
alter table public.post_likes enable row level security;
drop policy if exists post_likes_read on public.post_likes;
create policy post_likes_read on public.post_likes
    for select using (
        exists (select 1 from public.posts p
                 where p.id = post_likes.post_id and not p.is_hidden
                   and not public.is_blocked_pair(auth.uid(), p.author_id)));
drop policy if exists post_likes_write_own on public.post_likes;
create policy post_likes_write_own on public.post_likes
    for insert with check (auth.uid() = user_id);
drop policy if exists post_likes_delete_own on public.post_likes;
create policy post_likes_delete_own on public.post_likes
    for delete using (auth.uid() = user_id);

create table if not exists public.post_comments (
    id         uuid primary key default gen_random_uuid(),
    post_id    uuid not null references public.posts (id) on delete cascade,
    user_id    uuid not null references public.profiles (id) on delete cascade,
    body       text not null check (char_length(body) between 1 and 500),
    created_at timestamptz not null default now()
);
create index if not exists post_comments_post_time
    on public.post_comments (post_id, created_at);
alter table public.post_comments enable row level security;
drop policy if exists post_comments_read on public.post_comments;
create policy post_comments_read on public.post_comments
    for select using (
        exists (select 1 from public.posts p
                 where p.id = post_comments.post_id and not p.is_hidden
                   and not public.is_blocked_pair(auth.uid(), p.author_id)));
drop policy if exists post_comments_insert_own on public.post_comments;
create policy post_comments_insert_own on public.post_comments
    for insert with check (auth.uid() = user_id);
drop policy if exists post_comments_delete_own on public.post_comments;
create policy post_comments_delete_own on public.post_comments
    for delete using (auth.uid() = user_id);

create table if not exists public.post_reports (
    post_id     uuid not null references public.posts (id) on delete cascade,
    reporter_id uuid not null references public.profiles (id) on delete cascade,
    reason      text not null default '',
    created_at  timestamptz not null default now(),
    primary key (post_id, reporter_id)
);
alter table public.post_reports enable row level security;
drop policy if exists post_reports_insert_own on public.post_reports;
create policy post_reports_insert_own on public.post_reports
    for insert with check (auth.uid() = reporter_id);

-- صور البوستات
insert into storage.buckets (id, name, public)
values ('post-media', 'post-media', false)
on conflict (id) do nothing;

drop policy if exists post_media_write_own on storage.objects;
create policy post_media_write_own on storage.objects
    for insert with check (
        bucket_id = 'post-media'
        and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists post_media_read on storage.objects;
create policy post_media_read on storage.objects
    for select using (
        bucket_id = 'post-media' and auth.role() = 'authenticated');
drop policy if exists post_media_delete_own on storage.objects;
create policy post_media_delete_own on storage.objects
    for delete using (
        bucket_id = 'post-media'
        and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- XP: البوست +10، واللايك المستلم +1 ----------
create or replace function public.user_xp(p_user uuid)
returns int language sql security definer set search_path = public stable as $$
    select (
        coalesce((select sum(price_gems) from public.gift_sends
                   where sender_id = p_user), 0)
      + coalesce((select sum(price_gems) / 2 from public.gift_sends
                   where receiver_id = p_user), 0)
      + (select count(*) from public.messages where sender_id = p_user)
      + (select count(*) * 10 from public.daily_rewards
          where user_id = p_user)
      + (select count(*) * 10 from public.posts where author_id = p_user)
      + (select count(*) from public.post_likes l
          join public.posts p on p.id = l.post_id
         where p.author_id = p_user))::int;
$$;

-- ---------- إنشاء بوست (حد 10 في اليوم) ----------
create or replace function public.create_post(p_body text, p_media_path text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pid uuid; today int;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    if p_body is null or char_length(trim(p_body)) < 1
       or char_length(p_body) > 500 then raise exception 'bad_body'; end if;
    select count(*) into today from public.posts
     where author_id = me and created_at >= date_trunc('day', now());
    if today >= 10 then raise exception 'daily_limit'; end if;
    insert into public.posts (author_id, body, media_path)
    values (me, trim(p_body), nullif(p_media_path, ''))
    returning id into pid;
    return jsonb_build_object('ok', true, 'id', pid);
end $$;

-- ---------- التايم لاين (الأحدث أولاً، مع بيانات الكاتب حسب الخصوصية) ----------
create or replace function public.get_timeline(
    p_before timestamptz default null, p_limit int default 20)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); out jsonb;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    select coalesce(jsonb_agg(row_to_json(r) order by r.created_at desc), '[]'::jsonb)
      into out
      from (
        select
            p.id, p.author_id, p.body, p.media_path, p.created_at,
            case when pr.identity_mode = 'public' and pr.share_info
                      and pr.display_name is not null
                 then pr.display_name else pr.anonymous_alias end as shown_name,
            case when pr.identity_mode = 'public' then pr.username else null end as username,
            case when pr.share_photo then pr.avatar_url else null end as avatar_url,
            pr.is_vip,
            (select count(*) from public.post_likes l where l.post_id = p.id) as likes_count,
            (select count(*) from public.post_comments c where c.post_id = p.id) as comments_count,
            exists (select 1 from public.post_likes l
                     where l.post_id = p.id and l.user_id = me) as liked_by_me
          from public.posts p
          join public.profiles pr on pr.id = p.author_id
         where not p.is_hidden
           and not public.is_blocked_pair(me, p.author_id)
           and (p_before is null or p.created_at < p_before)
         order by p.created_at desc
         limit greatest(1, least(50, p_limit))
      ) r;
    return out;
end $$;

-- ---------- لايك / إلغاء لايك ----------
create or replace function public.toggle_post_like(p_post uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    me uuid := auth.uid();
    author uuid;
    liked boolean;
    cnt int;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    select author_id into author from public.posts
     where id = p_post and not is_hidden;
    if author is null then raise exception 'not_found'; end if;
    if public.is_blocked_pair(me, author) then raise exception 'blocked'; end if;
    if exists (select 1 from public.post_likes
                where post_id = p_post and user_id = me) then
        delete from public.post_likes where post_id = p_post and user_id = me;
        liked := false;
    else
        insert into public.post_likes (post_id, user_id) values (p_post, me);
        liked := true;
        if author <> me then
            insert into public.notifications (user_id, type, payload)
            values (author, 'account',
                    jsonb_build_object('kind', 'post_like',
                                       'post_id', p_post, 'liker_id', me));
        end if;
    end if;
    select count(*) into cnt from public.post_likes where post_id = p_post;
    return jsonb_build_object('ok', true, 'liked', liked, 'likes', cnt);
end $$;

-- ---------- تعليق ----------
create or replace function public.add_post_comment(p_post uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); author uuid; cid uuid;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    if p_body is null or char_length(trim(p_body)) < 1
       or char_length(p_body) > 500 then raise exception 'bad_body'; end if;
    select author_id into author from public.posts
     where id = p_post and not is_hidden;
    if author is null then raise exception 'not_found'; end if;
    if public.is_blocked_pair(me, author) then raise exception 'blocked'; end if;
    insert into public.post_comments (post_id, user_id, body)
    values (p_post, me, trim(p_body)) returning id into cid;
    if author <> me then
        insert into public.notifications (user_id, type, payload)
        values (author, 'account',
                jsonb_build_object('kind', 'post_comment',
                                   'post_id', p_post, 'commenter_id', me));
    end if;
    return jsonb_build_object('ok', true, 'id', cid);
end $$;

create or replace function public.get_post_comments(p_post uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); out jsonb;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    if not exists (select 1 from public.posts
                    where id = p_post and not is_hidden) then
        raise exception 'not_found';
    end if;
    select coalesce(jsonb_agg(row_to_json(r) order by r.created_at), '[]'::jsonb)
      into out
      from (
        select
            c.id, c.post_id, c.user_id, c.body, c.created_at,
            case when pr.identity_mode = 'public' and pr.share_info
                      and pr.display_name is not null
                 then pr.display_name else pr.anonymous_alias end as shown_name,
            case when pr.share_photo then pr.avatar_url else null end as avatar_url,
            pr.is_vip
          from public.post_comments c
          join public.profiles pr on pr.id = c.user_id
         where c.post_id = p_post
           and not public.is_blocked_pair(me, c.user_id)
         order by c.created_at
         limit 100
      ) r;
    return out;
end $$;

-- ---------- حذف بوست (صاحبه أو الأدمن) ----------
create or replace function public.delete_post(p_post uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); author uuid;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    select author_id into author from public.posts where id = p_post;
    if author is null then raise exception 'not_found'; end if;
    if author <> me and not public.is_admin() then raise exception 'forbidden'; end if;
    delete from public.posts where id = p_post;
    return jsonb_build_object('ok', true);
end $$;

-- ---------- بلاغ على بوست (5 بلاغات = إخفاء تلقائي) ----------
create or replace function public.report_post(p_post uuid, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cnt int;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    if not exists (select 1 from public.posts where id = p_post) then
        raise exception 'not_found';
    end if;
    insert into public.post_reports (post_id, reporter_id, reason)
    values (p_post, me, coalesce(p_reason, ''))
    on conflict (post_id, reporter_id) do nothing;
    select count(*) into cnt from public.post_reports where post_id = p_post;
    if cnt >= 5 then
        update public.posts set is_hidden = true where id = p_post;
    end if;
    return jsonb_build_object('ok', true, 'reports', cnt);
end $$;

-- ---------- بلاغات البوستات للأدمن ----------
create or replace function public.admin_list_post_reports(p_limit int default 50)
returns jsonb language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
    if not public.is_admin() then raise exception 'forbidden'; end if;
    select coalesce(jsonb_agg(row_to_json(r) order by r.created_at desc), '[]'::jsonb)
      into out
      from (
        select
            pr.post_id, pr.reporter_id, pr.reason, pr.created_at,
            (select count(*) from public.post_reports x where x.post_id = pr.post_id) as reports_count,
            (select p.body from public.posts p where p.id = pr.post_id) as post_body,
            (select p.is_hidden from public.posts p where p.id = pr.post_id) as post_hidden,
            (select case when p.identity_mode = 'public' and p.display_name is not null
                         then p.display_name else p.anonymous_alias end
               from public.profiles p where p.id = pr.reporter_id) as reporter_name
          from public.post_reports pr
         order by pr.created_at desc
         limit greatest(1, least(100, p_limit))
      ) r;
    return out;
end $$;

-- ---------- Realtime للتايم لاين ----------
alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.post_likes;
alter publication supabase_realtime add table public.post_comments;
