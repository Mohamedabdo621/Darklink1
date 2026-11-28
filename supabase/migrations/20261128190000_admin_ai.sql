-- DARKLINK AI — المرحلة 4: دوال الإدارة (SECURITY DEFINER + فحص is_admin)
-- العميل لا يستطيع قراءة عدادات الاستخدام أو قاعدة المعرفة مباشرة (RLS)،
-- فالإحصاءات وإدارة المعرفة تمر من هنا فقط، وللمشرفين فقط.

create or replace function public.admin_ai_stats()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_total bigint;
  v_today bigint;
  v_users bigint;
  v_convs bigint;
  v_errors bigint;
  v_providers jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select count(*) into v_total from public.ai_messages where role = 'assistant';
  select coalesce(sum(message_count), 0) into v_today
    from public.ai_usage_daily where usage_date = current_date;
  select count(distinct user_id) into v_users from public.ai_conversations;
  select count(*) into v_convs from public.ai_conversations;
  select count(*) into v_errors from public.error_logs
    where route = 'darklink-ai-chat' and created_at >= current_date;
  select coalesce(jsonb_agg(jsonb_build_object(
    'provider', provider,
    'requests', request_count,
    'tokens', input_tokens + output_tokens
  )), '[]'::jsonb) into v_providers
    from public.ai_provider_usage_daily where usage_date = current_date;
  return jsonb_build_object(
    'total_messages', v_total,
    'today_messages', v_today,
    'users_count', v_users,
    'conversations_count', v_convs,
    'errors_today', v_errors,
    'providers_today', v_providers
  );
end
$$;

create or replace function public.admin_ai_kb_list()
returns setof public.ai_knowledge
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query select * from public.ai_knowledge order by topic, lang;
end
$$;

create or replace function public.admin_ai_kb_upsert(
  p_id uuid,
  p_topic text,
  p_question text,
  p_answer text,
  p_keywords text,
  p_lang text,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_id is null then
    insert into public.ai_knowledge (topic, question, answer, keywords, lang, is_active)
    values (p_topic, p_question, p_answer, p_keywords, p_lang, p_is_active)
    returning id into v_id;
  else
    update public.ai_knowledge
      set topic = p_topic, question = p_question, answer = p_answer,
          keywords = p_keywords, lang = p_lang, is_active = p_is_active,
          updated_at = now()
      where id = p_id
      returning id into v_id;
  end if;
  return v_id;
end
$$;

create or replace function public.admin_ai_kb_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from public.ai_knowledge where id = p_id;
end
$$;

-- تسجيل الهجرة (نفس نمط الهجرات السابقة)
insert into supabase_migrations.schema_migrations (version)
values ('20261128190000')
on conflict (version) do nothing;
