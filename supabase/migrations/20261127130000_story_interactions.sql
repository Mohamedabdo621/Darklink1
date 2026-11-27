-- ============================================================
-- DARKLINK — تفاعلات الستوري: مشاهدات + قلوب + تعليقات
-- 2026-11-27 — إحصائيات الستوري زي واتساب (المشاهدات/القلوب/التعليقات)
-- ============================================================

create table if not exists public.story_views (
    id         uuid primary key default gen_random_uuid(),
    story_id   uuid not null references public.stories (id) on delete cascade,
    viewer_id  uuid not null references public.profiles (id) on delete cascade,
    viewed_at  timestamptz not null default now(),
    unique (story_id, viewer_id)
);
create index if not exists story_views_story
    on public.story_views (story_id, viewed_at desc);
alter table public.story_views enable row level security;

create table if not exists public.story_likes (
    id         uuid primary key default gen_random_uuid(),
    story_id   uuid not null references public.stories (id) on delete cascade,
    user_id    uuid not null references public.profiles (id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (story_id, user_id)
);
create index if not exists story_likes_story
    on public.story_likes (story_id);
alter table public.story_likes enable row level security;

create table if not exists public.story_comments (
    id         uuid primary key default gen_random_uuid(),
    story_id   uuid not null references public.stories (id) on delete cascade,
    user_id    uuid not null references public.profiles (id) on delete cascade,
    body       text not null check (char_length(body) between 1 and 500),
    created_at timestamptz not null default now()
);
create index if not exists story_comments_story
    on public.story_comments (story_id, created_at);
alter table public.story_comments enable row level security;

-- ---------- سياسات القراءة: نفس شروط ظهور الستوري ----------
-- (ستوري سارية + مفيش حظر بين الطرفين — زي stories_read)

drop policy if exists story_views_insert on public.story_views;
create policy story_views_insert on public.story_views
    for insert with check (viewer_id = auth.uid());

drop policy if exists story_views_read on public.story_views;
create policy story_views_read on public.story_views
    for select using (
        viewer_id = auth.uid()
        or exists (select 1 from public.stories s
                    where s.id = story_id and s.user_id = auth.uid()));

drop policy if exists story_likes_insert on public.story_likes;
create policy story_likes_insert on public.story_likes
    for insert with check (user_id = auth.uid());

drop policy if exists story_likes_delete on public.story_likes;
create policy story_likes_delete on public.story_likes
    for delete using (user_id = auth.uid());

drop policy if exists story_likes_read on public.story_likes;
create policy story_likes_read on public.story_likes
    for select using (
        exists (select 1 from public.stories s
                 where s.id = story_id
                   and s.expires_at > now()
                   and not exists (
                       select 1 from public.blocks b
                        where (b.blocker_id = auth.uid() and b.blocked_id = s.user_id)
                           or (b.blocker_id = s.user_id and b.blocked_id = auth.uid()))));

drop policy if exists story_comments_insert on public.story_comments;
create policy story_comments_insert on public.story_comments
    for insert with check (user_id = auth.uid());

drop policy if exists story_comments_delete on public.story_comments;
create policy story_comments_delete on public.story_comments
    for delete using (
        user_id = auth.uid()
        or exists (select 1 from public.stories s
                    where s.id = story_id and s.user_id = auth.uid()));

drop policy if exists story_comments_read on public.story_comments;
create policy story_comments_read on public.story_comments
    for select using (
        exists (select 1 from public.stories s
                 where s.id = story_id
                   and s.expires_at > now()
                   and not exists (
                       select 1 from public.blocks b
                        where (b.blocker_id = auth.uid() and b.blocked_id = s.user_id)
                           or (b.blocker_id = s.user_id and b.blocked_id = auth.uid()))));

-- ---------- تسجيل مشاهدة (مرة واحدة لكل مشاهد) ----------
create or replace function public.record_story_view(p_story uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); author uuid;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    select user_id into author from public.stories
     where id = p_story and expires_at > now();
    if author is null then raise exception 'not_found'; end if;
    if author = me then return jsonb_build_object('ok', true, 'own', true); end if;
    if public.is_blocked_pair(me, author) then raise exception 'blocked'; end if;
    insert into public.story_views (story_id, viewer_id)
    values (p_story, me)
    on conflict (story_id, viewer_id) do nothing;
    return jsonb_build_object('ok', true);
end $$;

-- ---------- قلب / إلغاء قلب + إشعار لصاحب الستوري ----------
create or replace function public.toggle_story_like(p_story uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    me uuid := auth.uid();
    author uuid;
    liked boolean;
    cnt int;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    select user_id into author from public.stories
     where id = p_story and expires_at > now();
    if author is null then raise exception 'not_found'; end if;
    if public.is_blocked_pair(me, author) then raise exception 'blocked'; end if;
    if exists (select 1 from public.story_likes
                where story_id = p_story and user_id = me) then
        delete from public.story_likes where story_id = p_story and user_id = me;
        liked := false;
    else
        insert into public.story_likes (story_id, user_id) values (p_story, me);
        liked := true;
        if author <> me then
            insert into public.notifications (user_id, type, payload)
            values (author, 'account',
                    jsonb_build_object('kind', 'story_like',
                                       'story_id', p_story, 'liker_id', me,
                                       'author_id', author));
        end if;
    end if;
    select count(*) into cnt from public.story_likes where story_id = p_story;
    return jsonb_build_object('ok', true, 'liked', liked, 'likes', cnt);
end $$;

-- ---------- حالة القلب (هل أنا عامل قلب؟ + العدد) ----------
create or replace function public.get_story_like_state(p_story uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); author uuid; liked boolean; cnt int;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    select user_id into author from public.stories
     where id = p_story and expires_at > now();
    if author is null then raise exception 'not_found'; end if;
    if public.is_blocked_pair(me, author) then raise exception 'blocked'; end if;
    liked := exists (select 1 from public.story_likes
                      where story_id = p_story and user_id = me);
    select count(*) into cnt from public.story_likes where story_id = p_story;
    return jsonb_build_object('ok', true, 'liked', liked, 'likes', cnt);
end $$;

-- ---------- تعليق + إشعار لصاحب الستوري ----------
create or replace function public.add_story_comment(p_story uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); author uuid; cid uuid;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    if p_body is null or char_length(trim(p_body)) < 1
       or char_length(p_body) > 500 then raise exception 'bad_body'; end if;
    select user_id into author from public.stories
     where id = p_story and expires_at > now();
    if author is null then raise exception 'not_found'; end if;
    if public.is_blocked_pair(me, author) then raise exception 'blocked'; end if;
    insert into public.story_comments (story_id, user_id, body)
    values (p_story, me, trim(p_body)) returning id into cid;
    if author <> me then
        insert into public.notifications (user_id, type, payload)
        values (author, 'account',
                jsonb_build_object('kind', 'story_comment',
                                   'story_id', p_story, 'commenter_id', me,
                                   'author_id', author));
    end if;
    return jsonb_build_object('ok', true, 'id', cid);
end $$;

-- ---------- تعليقات الستوري (بالاسم والصورة حسب إعدادات الخصوصية) ----------
create or replace function public.get_story_comments(p_story uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); author uuid; out jsonb;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    select user_id into author from public.stories
     where id = p_story and expires_at > now();
    if author is null then raise exception 'not_found'; end if;
    if public.is_blocked_pair(me, author) then raise exception 'blocked'; end if;
    select coalesce(jsonb_agg(row_to_json(r) order by r.created_at), '[]'::jsonb)
      into out
      from (
        select
            c.id, c.story_id, c.user_id, c.body, c.created_at,
            case when pr.identity_mode = 'public' and pr.share_info
                      and pr.display_name is not null
                 then pr.display_name else pr.anonymous_alias end as shown_name,
            case when pr.share_photo then pr.avatar_url else null end as avatar_url,
            pr.is_vip
          from public.story_comments c
          join public.profiles pr on pr.id = c.user_id
         where c.story_id = p_story
      ) r;
    return out;
end $$;

-- ---------- إحصائيات الستوري للمالك بس: المشاهدات + مين شاف + القلوب + التعليقات ----------
create or replace function public.get_story_stats(p_story uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    me uuid := auth.uid();
    author uuid;
    v_cnt int; l_cnt int; c_cnt int;
    viewers jsonb;
begin
    if me is null then raise exception 'not_authenticated'; end if;
    select user_id into author from public.stories
     where id = p_story and expires_at > now();
    if author is null then raise exception 'not_found'; end if;
    if author <> me then raise exception 'not_owner'; end if;
    select count(*) into v_cnt from public.story_views where story_id = p_story;
    select count(*) into l_cnt from public.story_likes where story_id = p_story;
    select count(*) into c_cnt from public.story_comments where story_id = p_story;
    select coalesce(jsonb_agg(row_to_json(r) order by r.viewed_at desc), '[]'::jsonb)
      into viewers
      from (
        select
            v.viewer_id as user_id, v.viewed_at,
            case when pr.identity_mode = 'public' and pr.share_info
                      and pr.display_name is not null
                 then pr.display_name else pr.anonymous_alias end as shown_name,
            case when pr.share_photo then pr.avatar_url else null end as avatar_url,
            pr.is_vip
          from public.story_views v
          join public.profiles pr on pr.id = v.viewer_id
         where v.story_id = p_story
      ) r;
    return jsonb_build_object(
        'ok', true, 'views', v_cnt, 'likes', l_cnt, 'comments', c_cnt,
        'viewers', viewers);
end $$;
