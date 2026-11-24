-- سياسة حذف لوسائط المحادثات والصوتيات:
-- كانت توجد سياسات إدخال وقراءة فقط، فلا يستطيع المرسل حذف ملفاته.
-- الحذف للمرسل الأصلي فقط (المسار {conversation_id}/{sender_uid}/file)
-- وبشرط أنه ما زال مشاركًا في المحادثة.
drop policy if exists chat_media_delete on storage.objects;
create policy chat_media_delete on storage.objects
    for delete using (
        bucket_id in ('chat-media', 'voice-notes')
        and (storage.foldername(name))[2] = auth.uid()::text
        and exists (select 1 from public.conversations c
                    where c.id::text = (storage.foldername(name))[1]
                      and auth.uid() in (c.user_a, c.user_b)));
