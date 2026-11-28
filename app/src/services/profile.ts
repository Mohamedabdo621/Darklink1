import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';
import { PUBLIC_CODE_RE } from './social';

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

/** تحديث حقول محددة فقط — تغيير حقل لا يمس أي إعداد خصوصية آخر.
 *  لو فشل بسبب قيد تميّز (23505) بيرجع الحقل المتعارض: الاسم المعروض
 *  (profiles_display_name_lower_uidx) أو اليوزر (profiles_username_key). */
export async function updateMyProfile(
  userId: string,
  fields: Partial<Profile>,
): Promise<{ ok: boolean; taken?: boolean; takenField?: 'display_name' | 'username' }> {
  const { error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('id', userId);
  if (error) {
    if (error.code === '23505') {
      const msg = (error as { message?: string }).message ?? '';
      return {
        ok: false,
        taken: true,
        takenField: msg.includes('display_name') ? 'display_name' : 'username',
      };
    }
    return { ok: false };
  }
  return { ok: true };
}

/** هل الاسم المعروض متاح؟ (غير اسم المستخدم نفسه — الـ RPC بيستثنيه) */
export async function isDisplayNameAvailable(name: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_display_name_available', {
    p_name: name.trim(),
  });
  if (error) return false;
  return data === true;
}

/** اقتراحات بديلة متاحة (الاسم + رقم) — بيتحقق من كل اقتراح قبل عرضه */
export async function suggestDisplayNames(name: string): Promise<string[]> {
  const base = name.trim().slice(0, 27);
  if (!base) return [];
  const out: string[] = [];
  for (let tries = 0; tries < 8 && out.length < 3; tries += 1) {
    const n = 100 + Math.floor(Math.random() * 900);
    const cand = tries % 2 === 0 ? `${base}${n}` : `${base}_${n}`;
    if (out.includes(cand)) continue;
    if (await isDisplayNameAvailable(cand)) out.push(cand);
  }
  return out;
}

export type DisplayNameCheck =
  | { ok: true }
  | { ok: false; reason: 'pattern' | 'taken'; suggestions?: string[] };

/** تحقق كامل من الاسم المعروض قبل الحفظ:
 *  - الاسم زي ما هو (من غير تغيير) مقبول دايمًا.
 *  - اسم على شكل كود (A-1…) مرفوض إلا لو هو كود المستخدم نفسه.
 *  - الاسم المتاخد مرفوض مع اقتراحات بديلة (اسم+رقم). */
export async function validateDisplayName(
  name: string,
  own: { displayName?: string | null; publicCode?: string | null },
): Promise<DisplayNameCheck> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: true };
  if (own.displayName && trimmed.toLowerCase() === own.displayName.toLowerCase()) {
    return { ok: true };
  }
  if (
    PUBLIC_CODE_RE.test(trimmed) &&
    (!own.publicCode || trimmed.toLowerCase() !== own.publicCode.toLowerCase())
  ) {
    return { ok: false, reason: 'pattern' };
  }
  if (!(await isDisplayNameAvailable(trimmed))) {
    return {
      ok: false,
      reason: 'taken',
      suggestions: await suggestDisplayNames(trimmed),
    };
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
