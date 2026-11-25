import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import type { Post, PostComment, ReferralStats } from '../lib/types';

export async function fetchTimeline(before?: string): Promise<Post[]> {
  const { data, error } = await supabase.rpc('get_timeline', {
    p_before: before ?? null,
    p_limit: 20,
  });
  if (error || !data) return [];
  return data as Post[];
}

export async function createPost(
  body: string,
  imageUri?: string | null,
): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) return { ok: false, reason: 'not_authenticated' };
  let mediaPath: string | null = null;
  if (imageUri) {
    const res = await fetch(imageUri);
    const blob = await res.blob();
    const ext = imageUri.split('.').pop()?.split('?')[0] ?? 'jpg';
    mediaPath = `${uid}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('post-media')
      .upload(mediaPath, blob, { contentType: blob.type || 'image/jpeg' });
    if (error) return { ok: false, reason: 'upload_failed' };
  }
  const { data, error } = await supabase.rpc('create_post', {
    p_body: body,
    p_media_path: mediaPath,
  });
  if (error) return { ok: false, reason: 'error' };
  return data as { ok: boolean; id?: string; reason?: string };
}

export async function pickPostImage(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
  });
  if (res.canceled || !res.assets[0]) return null;
  return res.assets[0].uri;
}

export async function postMediaUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage
    .from('post-media')
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function togglePostLike(
  postId: string,
): Promise<{ ok: boolean; liked?: boolean; likes?: number }> {
  const { data, error } = await supabase.rpc('toggle_post_like', {
    p_post: postId,
  });
  if (error) return { ok: false };
  return data as { ok: boolean; liked?: boolean; likes?: number };
}

export async function fetchPostComments(postId: string): Promise<PostComment[]> {
  const { data, error } = await supabase.rpc('get_post_comments', {
    p_post: postId,
  });
  if (error || !data) return [];
  return data as PostComment[];
}

export async function addPostComment(
  postId: string,
  body: string,
): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const { data, error } = await supabase.rpc('add_post_comment', {
    p_post: postId,
    p_body: body,
  });
  if (error) return { ok: false, reason: 'error' };
  return data as { ok: boolean; id?: string; reason?: string };
}

export async function deletePost(postId: string): Promise<boolean> {
  const { error } = await supabase.rpc('delete_post', { p_post: postId });
  return !error;
}

export async function reportPost(
  postId: string,
  reason = '',
): Promise<{ ok: boolean; reports?: number }> {
  const { data, error } = await supabase.rpc('report_post', {
    p_post: postId,
    p_reason: reason,
  });
  if (error) return { ok: false };
  return data as { ok: boolean; reports?: number };
}

export async function fetchMyReferralStats(): Promise<ReferralStats | null> {
  const { data, error } = await supabase.rpc('my_referral_stats');
  if (error || !data) return null;
  return data as ReferralStats;
}
