-- ============================================================
-- DARKLINK — الرد على الرسائل (اقتباس) + إخفاء المحادثة لطرف واحد
-- 2026-11-25 — ميزات السحب في v1.1.0 (سحب للرد + سحب لحذف المحادثة)
-- ============================================================

-- الرد على رسالة: كل رسالة تقدر تشير لرسالة أصلية داخل نفس المحادثة
alter table public.messages
    add column if not exists reply_to_id uuid
    references public.messages (id) on delete set null;

-- إخفاء المحادثة من قائمة أحد الطرفين فقط (من غير حذف فعلي)
alter table public.conversations
    add column if not exists hidden_for uuid[] not null default '{}';

-- أي رسالة جديدة تُظهر المحادثة من جديد للطرفين (وتحدّث آخر نشاط)
create or replace function public.bump_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    update public.conversations
       set last_message_at = new.created_at,
           hidden_for = '{}'
     where id = new.conversation_id;
    return new;
end $$;

-- إخفاء المحادثة عن المستخدم الحالي فقط
create or replace function public.hide_conversation(p_conversation uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
    update public.conversations
       set hidden_for = case
               when hidden_for @> array[auth.uid()] then hidden_for
               else hidden_for || array[auth.uid()]
           end
     where id = p_conversation
       and (user_a = auth.uid() or user_b = auth.uid());
end $$;
