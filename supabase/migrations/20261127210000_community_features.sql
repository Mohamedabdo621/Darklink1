-- ============================================================
-- المجتمع — الدفعة الكاملة (2026-11-27)
-- تبويبات الكل/أصدقائي/الرائج/محفوظ/منشوراتي، فيديو، منشن/هاشتاج،
-- حفظ، استطلاع، إعادة نشر، تثبيت، تعديل، فويس، شريط الرائج، متابعة
-- ============================================================

-- ---------- أعمدة جديدة على posts ----------
alter table public.posts
  add column if not exists media_type text,
  add column if not exists voice_duration int,
  add column if not exists repost_of uuid references public.posts (id) on delete set null,
  add column if not exists is_pinned boolean not null default false,
  add column if not exists poll jsonb,
  add column if not exists edited_at timestamptz;
create index if not exists posts_repost_of on public.posts (repost_of);
create index if not exists posts_pinned on public.posts (author_id, is_pinned, created_at desc);

-- تحديث البوستات القديمة: اللي ليها media_path صورة
update public.posts set media_type = 'image'
 where media_path is not null and media_type is null;

-- إعادة نشر من غير تعليق مسموح فيها نص فاضي
alter table public.posts drop constraint if exists posts_body_check;
alter table public.posts add constraint posts_body_check
  check (char_length(body) between 1 and 500
         or (repost_of is not null and char_length(body) = 0));

-- سياسة تعديل للبوستات (للتعديل والتثبيت — الـ RPCs أصلًا security definer)
drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts
    for update using (auth.uid() = author_id);

-- ---------- متابعة ----------
create table if not exists public.follows (
    follower_id  uuid not null references public.profiles (id) on delete cascade,
    following_id uuid not null references public.profiles (id) on delete cascade,
    created_at   timestamptz not null default now(),
    primary key (follower_id, following_id),
    check (follower_id <> following_id)
);
create index if not exists follows_following on public.follows (following_id, created_at desc);
alter table public.follows enable row level security;
drop policy if exists follows_read on public.follows;
create policy follows_read on public.follows
    for select using (auth.role() = 'authenticated');
drop policy if exists follows_write_own on public.follows;
create policy follows_write_own on public.follows
    for insert with check (auth.uid() = follower_id);
drop policy if exists follows_delete_own on public.follows;
create policy follows_delete_own on public.follows
    for delete using (auth.uid() = follower_id);

-- ---------- حفظ البوستات ----------
create table if not exists public.saved_posts (
    user_id    uuid not null references public.profiles (id) on delete cascade,
    post_id    uuid not null references public.posts (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, post_id)
);
create index if not exists saved_posts_user on public.saved_posts (user_id, created_at desc);
alter table public.saved_posts enable row level security;
drop policy if exists saved_posts_own on public.saved_posts;
create policy saved_posts_own on public.saved_posts
    for all using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- ---------- تصويت الاستطلاعات ----------
create table if not exists public.poll_votes (
    post_id      uuid not null references public.posts (id) on delete cascade,
    user_id      uuid not null references public.profiles (id) on delete cascade,
    option_index int not null check (option_index >= 0),
    created_at   timestamptz not null default now(),
    primary key (post_id, user_id)
);
alter table public.poll_votes enable row level security;
drop policy if exists poll_votes_read on public.poll_votes;
create policy poll_votes_read on public.poll_votes
    for select using (
        exists (select 1 from public.posts p
                 where p.id = poll_votes.post_id and not p.is_hidden
                   and not public.is_blocked_pair(auth.uid(), p.author_id)));
drop policy if exists poll_votes_write_own on public.poll_votes;
create policy poll_votes_write_own on public.poll_votes
    for insert with check (auth.uid() = user_id);
drop policy if exists poll_votes_update_own on public.poll_votes;
create policy poll_votes_update_own on public.poll_votes
    for update using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
drop policy if exists poll_votes_delete_own on public.poll_votes;
create policy poll_votes_delete_own on public.poll_votes
    for delete using (auth.uid() = user_id);

-- ---------- إنشاء بوست (موسّع: فيديو/فويس/استطلاع/إعادة نشر + إشعار للمتابعين) ----------
create or replace function public.create_post(
    p_body text,
    p_media_path text default null,
    p_media_type text default null,
    p_voice_duration int default null,
    p_poll jsonb default null,
    p_repost_of uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pid uuid; today int; opt_count int;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    -- إعادة النشر ممكن تكون من غير تعليق؛ غير كده النص إجباري 1-500
    if p_repost_of is null and (p_body is null or char_length(trim(p_body)) < 1
       or char_length(p_body) > 500) then raise exception 'bad_body'; end if;
    if p_body is not null and char_length(p_body) > 500 then raise exception 'bad_body'; end if;
    if p_media_type is not null and p_media_type not in ('image', 'video', 'voice') then
        raise exception 'bad_media_type'; end if;
    if p_repost_of is not null and not exists (
        select 1 from public.posts where id = p_repost_of and not is_hidden) then
        raise exception 'not_found'; end if;
    if p_poll is not null then
        select jsonb_array_length(p_poll -> 'options') into opt_count;
        if opt_count is null or opt_count < 2 or opt_count > 4 then
            raise exception 'bad_poll'; end if;
    end if;
    select count(*) into today from public.posts
     where author_id = me and created_at >= date_trunc('day', now());
    if today >= 10 then raise exception 'daily_limit'; end if;
    insert into public.posts (author_id, body, media_path, media_type,
                              voice_duration, poll, repost_of)
    values (me, coalesce(trim(p_body), ''), nullif(p_media_path, ''),
            p_media_type, p_voice_duration, p_poll, p_repost_of)
    returning id into pid;
    -- إشعار لكل المتابعين ببوست جديد
    insert into public.notifications (user_id, type, payload)
    select f.follower_id, 'account',
           jsonb_build_object('kind', 'post_new', 'post_id', pid, 'author_id', me)
      from public.follows f
     where f.following_id = me
       and f.follower_id <> me
       and not public.is_blocked_pair(f.follower_id, me);
    return jsonb_build_object('ok', true, 'id', pid);
end $$;

-- ---------- التايم لاين (فلاتر: all / friends / trending / saved / mine / tag) ----------
create or replace function public.get_timeline(
    p_before timestamptz default null,
    p_limit int default 20,
    p_filter text default 'all',
    p_tag text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); out jsonb;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    select coalesce(jsonb_agg(row_to_json(r)
      order by (case when p_filter = 'trending' then r.likes_count end) desc nulls last,
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
            exists (select 1 from public.post_likes l
                     where l.post_id = p.id and l.user_id = me) as liked_by_me,
            exists (select 1 from public.saved_posts s
                     where s.post_id = p.id and s.user_id = me) as saved_by_me,
            exists (select 1 from public.follows f
                     where f.follower_id = me and f.following_id = p.author_id) as following_author,
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
             (select count(*) from public.post_likes l where l.post_id = p.id)
           else null end desc nulls last,
           case when p_filter = 'mine' then p.is_pinned end desc nulls last,
           p.created_at desc
         limit greatest(1, least(50, p_limit))
      ) r;
    return out;
end $$;

-- ---------- الرائج اليوم (أعلى 3 بوستات لايكات في آخر 24 ساعة) ----------
create or replace function public.get_trending(p_limit int default 3)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); out jsonb;
begin
    if me is null then raise exception 'not_authenticated'; end if;
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
         order by likes_count desc, p.created_at desc
         limit greatest(1, least(10, p_limit))
      ) r;
    return out;
end $$;

-- ---------- تعديل بوست (صاحبه بس) ----------
create or replace function public.edit_post(p_post uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); author uuid;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    if p_body is null or char_length(trim(p_body)) < 1
       or char_length(p_body) > 500 then raise exception 'bad_body'; end if;
    select author_id into author from public.posts where id = p_post;
    if author is null then raise exception 'not_found'; end if;
    if author <> me then raise exception 'forbidden'; end if;
    update public.posts set body = trim(p_body), edited_at = now() where id = p_post;
    return jsonb_build_object('ok', true);
end $$;

-- ---------- تثبيت / إلغاء تثبيت بوست (صاحبه بس — واحد بس مثبت) ----------
create or replace function public.toggle_pin_post(p_post uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); author uuid; pinned boolean;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    select author_id, is_pinned into author, pinned from public.posts where id = p_post;
    if author is null then raise exception 'not_found'; end if;
    if author <> me then raise exception 'forbidden'; end if;
    if pinned then
        update public.posts set is_pinned = false where id = p_post;
        return jsonb_build_object('ok', true, 'pinned', false);
    end if;
    update public.posts set is_pinned = false where author_id = me;
    update public.posts set is_pinned = true where id = p_post;
    return jsonb_build_object('ok', true, 'pinned', true);
end $$;

-- ---------- حفظ / إلغاء حفظ بوست ----------
create or replace function public.toggle_save_post(p_post uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); saved boolean;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    if not exists (select 1 from public.posts where id = p_post and not is_hidden) then
        raise exception 'not_found'; end if;
    if exists (select 1 from public.saved_posts where post_id = p_post and user_id = me) then
        delete from public.saved_posts where post_id = p_post and user_id = me;
        saved := false;
    else
        insert into public.saved_posts (post_id, user_id) values (p_post, me);
        saved := true;
    end if;
    return jsonb_build_object('ok', true, 'saved', saved);
end $$;

-- ---------- تصويت في استطلاع (ممكن تغيير الصوت) ----------
create or replace function public.vote_poll(p_post uuid, p_option int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); opt_count int; votes jsonb;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    select jsonb_array_length(poll -> 'options') into opt_count
      from public.posts where id = p_post and not is_hidden;
    if opt_count is null then raise exception 'not_found'; end if;
    if p_option < 0 or p_option >= opt_count then raise exception 'bad_option'; end if;
    insert into public.poll_votes (post_id, user_id, option_index)
    values (p_post, me, p_option)
    on conflict (post_id, user_id)
    do update set option_index = excluded.option_index;
    select coalesce(jsonb_agg(v.cnt order by v.idx), '[]'::jsonb) into votes
      from (select o.idx, count(pv.user_id) as cnt
              from generate_series(0, opt_count - 1) o(idx)
              left join public.poll_votes pv
                on pv.post_id = p_post and pv.option_index = o.idx
             group by o.idx) v;
    return jsonb_build_object('ok', true, 'votes', votes, 'my_vote', p_option);
end $$;

-- ---------- متابعة / إلغاء متابعة ----------
create or replace function public.toggle_follow(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); following boolean;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    if p_user = me then raise exception 'bad_target'; end if;
    if not exists (select 1 from public.profiles where id = p_user) then
        raise exception 'not_found'; end if;
    if public.is_blocked_pair(me, p_user) then raise exception 'blocked'; end if;
    if exists (select 1 from public.follows
                where follower_id = me and following_id = p_user) then
        delete from public.follows where follower_id = me and following_id = p_user;
        following := false;
    else
        insert into public.follows (follower_id, following_id) values (me, p_user);
        following := true;
    end if;
    return jsonb_build_object('ok', true, 'following', following);
end $$;

-- ---------- بحث عن مستخدم باليوزرنيم (للمينشن @) ----------
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
               p.is_vip
          from public.profiles p
         where lower(p.username) = lower(p_username)
           and not public.is_blocked_pair(me, p.id)
         limit 1
      ) r;
    return coalesce(out, 'null'::jsonb);
end $$;
