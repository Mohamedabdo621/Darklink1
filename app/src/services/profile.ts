import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';

export async function fetchMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data as Profile;
}

/** جلب الملف مع التمييز بين "مفيش صف" و"الجلب فشل" (شبكة/قاعدة).
 *  PGRST116 = مفيش صف مطابق — مش فشل، فـ error=false.
 *  أي خطأ تاني = فشل جلب، والمتصل لازم يعرض شاشة إعادة محاولة
 *  بدل ما يحوّل المستخدم لصفحة إكمال البيانات. */
export async function fetchMyProfileResult(
  userId: string,
): Promise<{ profile: Profile | null; error: boolean }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') {
      return { profile: null, error: false };
    }
    return { profile: null, error: true };
  }
  return { profile: data as Profile, error: false };
}

/** تحديث حقول محددة فقط — تغيير حقل لا يمس أي إعداد خصوصية آخر */
export async function updateMyProfile(
  userId: string,
  fields: Partial<Profile>,
): Promise<{ ok: boolean; taken?: boolean }> {
  const { error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('id', userId);
  if (error) {
    if (error.code === '23505') return { ok: false, taken: true };
    return { ok: false };
  }
  return { ok: true };
}

/** تحديث إعداد خصوصية واحد فقط في كل مرة */
export async function updatePrivacySetting(
  userId: string,
  field:
    | 'identity_mode'
    | 'discoverable'
    | 'share_photo'
    | 'share_info'
    | 'show_last_seen',
  value: string | boolean,
): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .update({ [field]: value })
    .eq('id', userId);
  return !error;
}

export async function uploadAvatar(userId: string, localUri: string): Promise<string | null> {
  const path = `${userId}/avatar.jpg`;
  const res = await fetch(localUri);
  const blob = await res.blob();
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  if (error) return null;
  const upd = await updateMyProfile(userId, { avatar_url: path });
  return upd.ok ? path : null;
}

const signedCache = new Map<string, { url: string; at: number }>();

/** رابط موقّع لعرض صورة من bucket خاص — يُخزّن مؤقتًا 50 دقيقة */
export async function avatarSignedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const hit = signedCache.get(path);
  if (hit && Date.now() - hit.at < 50 * 60 * 1000) return hit.url;
  const { data } = await supabase.storage
    .from('avatars')
    .createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  signedCache.set(path, { url: data.signedUrl, at: Date.now() });
  return data.signedUrl;
}
