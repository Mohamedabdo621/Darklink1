import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import type { FollowUser, Post, PostComment, ReferralStats, TrendingPost } from '../lib/types';

export type TimelineFilter = 'all' | 'friends' | 'trending' | 'saved' | 'mine' | 'tag';

export async function fetchTimeline(
  before?: string,
  filter: TimelineFilter = 'all',
  tag?: string | null,
): Promise<Post[]> {
  const { data, error } = await supabase.rpc('get_timeline', {
    p_before: before ?? null,
    p_limit: 20,
    p_filter: filter,
    p_tag: tag ?? null,
  });
  if (error || !data) return [];
  return data as Post[];
}

export async function fetchTrending(): Promise<TrendingPost[]> {
  const { data, error } = await supabase.rpc('get_trending', { p_limit: 3 });
  if (error || !data) return [];
  return data as TrendingPost[];
}

export interface PollDraft {
  question: string;
  options: string[];
}

export async function createPost(
  body: string,
  mediaUri?: string | null,
  mediaType?: 'image' | 'video' | 'voice' | null,
  voiceDuration?: number | null,
  poll?: PollDraft | null,
  repostOf?: string | null,
): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) return { ok: false, reason: 'not_authenticated' };
  let mediaPath: string | null = null;
  if (mediaUri) {
    try {
      const res = await fetch(mediaUri);
      const blob = await res.blob();
      const ext = mediaUri.split('.').pop()?.split('?')[0] ?? 'jpg';
      mediaPath = `${uid}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('post-media')
        .upload(mediaPath, blob, { contentType: blob.type || 'image/jpeg' });
      if (error) return { ok: false, reason: 'upload_failed' };
    } catch {
      return { ok: false, reason: 'upload_failed' };
    }
  }
  const pollJson =
    poll && poll.options.length >= 2
      ? { question: poll.question, options: poll.options.map((text) => ({ text })) }
      : null;
  const { data, error } = await supabase.rpc('create_post', {
    p_body: body,
    p_media_path: mediaPath,
    p_media_type: mediaType ?? null,
    p_voice_duration: voiceDuration ?? null,
    p_poll: pollJson,
    p_repost_of: repostOf ?? null,
  });
  if (error) {
    // الرفع نجح بس إنشاء البوست فشل — امسح الملف من التخزين عشان
    // ميبقاش يتيم (القاعدة مش هتشاور عليه أبدًا).
    if (mediaPath) {
      await supabase.storage.from('post-media').remove([mediaPath]);
    }
    return { ok: false, reason: 'error' };
  }
  const result = data as { ok: boolean; id?: string; reason?: string };
  if (!result.ok && mediaPath) {
    await supabase.storage.from('post-media').remove([mediaPath]);
  }
  return result;
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

export async function editPost(
  postId: string,
  body: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase.rpc('edit_post', {
    p_post: postId,
    p_body: body,
  });
  if (error) return { ok: false, reason: 'error' };
  return data as { ok: boolean };
}

export async function togglePinPost(
  postId: string,
): Promise<{ ok: boolean; pinned?: boolean }> {
  const { data, error } = await supabase.rpc('toggle_pin_post', { p_post: postId });
  if (error) return { ok: false };
  return data as { ok: boolean; pinned?: boolean };
}

export async function toggleSavePost(
  postId: string,
): Promise<{ ok: boolean; saved?: boolean }> {
  const { data, error } = await supabase.rpc('toggle_save_post', { p_post: postId });
  if (error) return { ok: false };
  return data as { ok: boolean; saved?: boolean };
}

export async function votePoll(
  postId: string,
  option: number,
): Promise<{ ok: boolean; votes?: number[]; my_vote?: number }> {
  const { data, error } = await supabase.rpc('vote_poll', {
    p_post: postId,
    p_option: option,
  });
  if (error) return { ok: false };
  return data as { ok: boolean; votes?: number[]; my_vote?: number };
}

export async function toggleFollow(
  userId: string,
): Promise<{ ok: boolean; following?: boolean }> {
  const { data, error } = await supabase.rpc('toggle_follow', { p_user: userId });
  if (error) return { ok: false };
  return data as { ok: boolean; following?: boolean };
}

export async function toggleRepost(
  postId: string,
): Promise<{ ok: boolean; reposted?: boolean; reposts_count?: number }> {
  const { data, error } = await supabase.rpc('toggle_repost', {
    p_post: postId,
  });
  if (error) return { ok: false };
  return data as { ok: boolean; reposted?: boolean; reposts_count?: number };
}

/** قائمة المتابعين لمستخدم — بترجع من RPC ‏get_followers */
export async function fetchFollowers(userId: string): Promise<FollowUser[]> {
  const { data, error } = await supabase.rpc('get_followers', {
    p_user: userId,
  });
  if (error || !data) return [];
  return data as FollowUser[];
}

/** قائمة اللي بيتابعهم مستخدم — بترجع من RPC ‏get_following */
export async function fetchFollowing(userId: string): Promise<FollowUser[]> {
  const { data, error } = await supabase.rpc('get_following', {
    p_user: userId,
  });
  if (error || !data) return [];
  return data as FollowUser[];
}

export async function findByUsername(
  username: string,
): Promise<{ id: string; shown_name: string; username: string | null } | null> {
  const { data, error } = await supabase.rpc('find_by_username', {
    p_username: username,
  });
  if (error || !data) return null;
  return data as { id: string; shown_name: string; username: string | null };
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
