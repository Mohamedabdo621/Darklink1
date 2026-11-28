-- ============================================================
-- DARKLINK — عدّاد إعادة النشر + نقاط الرائج المخفية
-- 2026-11-28 — v1.6.x
-- جدول post_reposts + RPC toggle_repost + حقول جديدة في
-- get_timeline و get_public_profile + get_followers/get_following
-- + أوزان الرائج في app_config (داخلية فقط — لا تظهر في أي مخرجات)
-- ============================================================

-- ---------- جدول إعادة النشر (عدّاد) ----------
create table if not exists public.post_reposts (
    post_id    uuid not null references public.posts (id) on delete cascade,
    user_id    uuid not null references public.profiles (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (post_id, user_id)
);
create index if not exists post_reposts_post on public.post_reposts (post_id, created_at desc);
alter table public.post_reposts enable row level security;
drop policy if exists post_reposts_read on public.post_reposts;
create policy post_reposts_read on public.post_reposts
    for select using (
        exists (select 1 from public.posts p
                 where p.id = post_reposts.post_id and not p.is_hidden
                   and not public.is_blocked_pair(auth.uid(), p.author_id)));
drop policy if exists post_reposts_write_own on public.post_reposts;
create policy post_reposts_write_own on public.post_reposts
    for insert with check (auth.uid() = user_id);
drop policy if exists post_reposts_delete_own on public.post_reposts;
create policy post_reposts_delete_own on public.post_reposts
    for delete using (auth.uid() = user_id);

-- ---------- إعادة نشر / إلغاء إعادة نشر (عدّاد — مرآة toggle_post_like) ----------
create or replace function public.toggle_repost(p_post uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    me uuid := auth.uid();
    author uuid;
    reposted boolean;
    cnt int;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    select author_id into author from public.posts
     where id = p_post and not is_hidden;
    if author is null then raise exception 'not_found'; end if;
    if public.is_blocked_pair(me, author) then raise exception 'blocked'; end if;
    if exists (select 1 from public.post_reposts
                where post_id = p_post and user_id = me) then
        delete from public.post_reposts where post_id = p_post and user_id = me;
        reposted := false;
    else
        insert into public.post_reposts (post_id, user_id) values (p_post, me);
        reposted := true;
    end if;
    select count(*) into cnt from public.post_reposts where post_id = p_post;
    return jsonb_build_object('ok', true, 'reposted', reposted, 'reposts_count', cnt);
end $$;

-- ---------- أوزان الرائج (داخلية فقط — تُقرأ من دوال SECURITY DEFINER) ----------
insert into public.app_config (key, value) values
    ('trending_repost_weight', '3'),
    ('trending_comment_weight', '2'),
    ('trending_like_weight', '1'),
    ('trending_save_weight', '1'),
    ('trending_half_life_hours', '12')
on conflict (key) do nothing;

-- ---------- التايم لاين (فلاتر: all / friends / trending / saved / mine / tag)
--   + reposts_count / reposted_by_me / follows_me
--   + ترتيب الرائج بنقاط موزونة مع اضمحلال زمني (داخلي فقط — لا يظهر في المخرجات) ----------
create or replace function public.get_timeline(
    p_before timestamptz default null,
    p_limit int default 20,
    p_filter text default 'all',
    p_tag text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    me uuid := auth.uid();
    out jsonb;
    w_repost numeric;
    w_comment numeric;
    w_like numeric;
    w_save numeric;
    w_half_life numeric;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    select coalesce((select value::numeric from public.app_config where key = 'trending_repost_weight'), 3),
           coalesce((select value::numeric from public.app_config where key = 'trending_comment_weight'), 2),
           coalesce((select value::numeric from public.app_config where key = 'trending_like_weight'), 1),
           coalesce((select value::numeric from public.app_config where key = 'trending_save_weight'), 1),
           coalesce((select value::numeric from public.app_config where key = 'trending_half_life_hours'), 12)
      into w_repost, w_comment, w_like, w_save, w_half_life;
    select coalesce(jsonb_agg(row_to_json(r)
      order by (case when p_filter = 'trending' then
                   (r.reposts_count * w_repost + r.comments_count * w_comment
                    + r.likes_count * w_like
                    + (select count(*) from public.saved_posts s where s.post_id = r.id) * w_save)
                   * power(0.5, extract(epoch from (now() - r.created_at)) / 3600 / w_half_life)
                 end) desc nulls last,
               (case when p_filter = 'mine' then r.is_pinned end) desc nulls last,
               r.created_at desc), '[]'::jsonb)
      into out
      from (
        select
            p.id, p.author_id, p.body, p.media_path, p.media_type,
            p.voice_duration, p.repost_of, p.is_pinned, p.poll,
            p.created_at,
            (p.edited_at is not null) as edited,
            case when pr.identity_mode = 'public' and pr.share_info
                      and pr.display_name is not null
                 then pr.display_name else pr.anonymous_alias end as shown_name,
            case when pr.identity_mode = 'public' then pr.username else null end as username,
            case when pr.share_photo then pr.avatar_url else null end as avatar_url,
            pr.is_vip,
            (select count(*) from public.post_likes l where l.post_id = p.id) as likes_count,
            (select count(*) from public.post_comments c where c.post_id = p.id) as comments_count,
            (select count(*) from public.post_reposts rp where rp.post_id = p.id) as reposts_count,
            exists (select 1 from public.post_likes l
                     where l.post_id = p.id and l.user_id = me) as liked_by_me,
            exists (select 1 from public.post_reposts rp
                     where rp.post_id = p.id and rp.user_id = me) as reposted_by_me,
            exists (select 1 from public.saved_posts s
                     where s.post_id = p.id and s.user_id = me) as saved_by_me,
            exists (select 1 from public.follows f
                     where f.follower_id = me and f.following_id = p.author_id) as following_author,
            exists (select 1 from public.follows f
                     where f.follower_id = p.author_id and f.following_id = me) as follows_me,
            -- الاستطلاع: عدد الأصوات لكل خيار + صوتي
            (select coalesce(jsonb_agg(v.cnt order by v.idx), '[]'::jsonb)
               from (select o.idx, count(pv.user_id) as cnt
                       from generate_series(0, jsonb_array_length(p.poll -> 'options') - 1) o(idx)
                       left join public.poll_votes pv
                         on pv.post_id = p.id and pv.option_index = o.idx
                      group by o.idx) v) as poll_votes,
            (select option_index from public.poll_votes
              where post_id = p.id and user_id = me) as my_vote,
            -- البوست الأصلي في حالة إعادة النشر
            op.body as repost_body,
            op.media_path as repost_media_path,
            op.media_type as repost_media_type,
            op.created_at as repost_created_at,
            case when opr.identity_mode = 'public' and opr.share_info
                      and opr.display_name is not null
                 then opr.display_name else opr.anonymous_alias end as repost_author_name
          from public.posts p
          join public.profiles pr on pr.id = p.author_id
          left join public.posts op on op.id = p.repost_of
          left join public.profiles opr on opr.id = op.author_id
         where not p.is_hidden
           and not public.is_blocked_pair(me, p.author_id)
           and (p_before is null or p.created_at < p_before)
           and (case
                  when p_filter = 'friends' then p.author_id in (
                    select following_id from public.follows where follower_id = me)
                  when p_filter = 'saved' then exists (
                    select 1 from public.saved_posts s
                     where s.post_id = p.id and s.user_id = me)
                  when p_filter = 'mine' then p.author_id = me
                  when p_filter = 'tag' and p_tag is not null then
                    strpos(lower(p.body), lower('#' || p_tag)) > 0
                  else true
                end)
         order by
           case when p_filter = 'trending' then
             ((select count(*) from public.post_reposts rp where rp.post_id = p.id) * w_repost
              + (select count(*) from public.post_comments c where c.post_id = p.id) * w_comment
              + (select count(*) from public.post_likes l where l.post_id = p.id) * w_like
              + (select count(*) from public.saved_posts s where s.post_id = p.id) * w_save)
             * power(0.5, extract(epoch from (now() - p.created_at)) / 3600 / w_half_life)
           else null end desc nulls last,
           case when p_filter = 'mine' then p.is_pinned end desc nulls last,
           p.created_at desc
         limit greatest(1, least(50, p_limit))
      ) r;
    return out;
end $$;

-- ---------- الرائج اليوم (أعلى 3 بوستات في آخر 24 ساعة)
--   الترتيب بنقاط موزونة مع اضمحلال زمني (داخلي فقط — لا يظهر في المخرجات) ----------
create or replace function public.get_trending(p_limit int default 3)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    me uuid := auth.uid();
    out jsonb;
    w_repost numeric;
    w_comment numeric;
    w_like numeric;
    w_save numeric;
    w_half_life numeric;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    select coalesce((select value::numeric from public.app_config where key = 'trending_repost_weight'), 3),
           coalesce((select value::numeric from public.app_config where key = 'trending_comment_weight'), 2),
           coalesce((select value::numeric from public.app_config where key = 'trending_like_weight'), 1),
           coalesce((select value::numeric from public.app_config where key = 'trending_save_weight'), 1),
           coalesce((select value::numeric from public.app_config where key = 'trending_half_life_hours'), 12)
      into w_repost, w_comment, w_like, w_save, w_half_life;
    select coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      into out
      from (
        select
            p.id, p.author_id, p.body, p.media_path, p.media_type,
            p.voice_duration, p.created_at,
            case when pr.identity_mode = 'public' and pr.share_info
                      and pr.display_name is not null
                 then pr.display_name else pr.anonymous_alias end as shown_name,
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
           and p.created_at >= now() - interval '24 hours'
         order by
           ((select count(*) from public.post_reposts rp where rp.post_id = p.id) * w_repost
            + (select count(*) from public.post_comments c where c.post_id = p.id) * w_comment
            + (select count(*) from public.post_likes l where l.post_id = p.id) * w_like
            + (select count(*) from public.saved_posts s where s.post_id = p.id) * w_save)
           * power(0.5, extract(epoch from (now() - p.created_at)) / 3600 / w_half_life) desc,
           p.created_at desc
         limit greatest(1, least(10, p_limit))
      ) r;
    return out;
end $$;

-- ---------- البروفايل العام + followers_count / following_count / follows_me ----------
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
        'created_at', p.created_at,
        'followers_count', (select count(*) from public.follows where following_id = target),
        'following_count', (select count(*) from public.follows where follower_id = target),
        'follows_me', exists (select 1 from public.follows
                               where follower_id = target and following_id = auth.uid()));
end $$;

-- ---------- قائمة المتابعين ----------
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
            'avatar_url', case when pr.share_photo then pr.avatar_url else null end)
        order by f.created_at desc), '[]'::jsonb)
      into out
      from public.follows f
      join public.profiles pr on pr.id = f.follower_id
     where f.following_id = p_user
       and not public.is_blocked_pair(me, f.follower_id);
    return out;
end $$;

-- ---------- قائمة من يتابعهم المستخدم ----------
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
            'avatar_url', case when pr.share_photo then pr.avatar_url else null end)
        order by f.created_at desc), '[]'::jsonb)
      into out
      from public.follows f
      join public.profiles pr on pr.id = f.following_id
     where f.follower_id = p_user
       and not public.is_blocked_pair(me, f.following_id);
    return out;
end $$;
