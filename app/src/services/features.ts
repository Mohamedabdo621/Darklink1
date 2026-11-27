import { supabase } from '../lib/supabase';
import type { PublicProfile, Story } from '../lib/types';
import { fetchPublicProfile } from './social';

// ---------------- المكافأة اليومية ----------------

export interface DailyStatus {
  claimable: boolean;
  streak: number;
  next_amount: number;
}

export async function fetchDailyStatus(): Promise<DailyStatus | null> {
  const { data, error } = await supabase.rpc('daily_status');
  if (error || !data) return null;
  return data as DailyStatus;
}

export interface ClaimResult {
  claimed: boolean;
  amount?: number;
  streak?: number;
  reason?: string;
}

export async function claimDailyReward(): Promise<ClaimResult | null> {
  const { data, error } = await supabase.rpc('claim_daily_reward');
  if (error || !data) return null;
  return data as ClaimResult;
}

// ---------------- الإنجازات ----------------

export const ACHIEVEMENT_KEYS = [
  'first_gift_sent',
  'first_gift_received',
  'gifts_10',
  'vip_member',
  'streak_7',
  'gems_1000',
  'social_5',
] as const;

export async function fetchMyAchievements(myId: string): Promise<string[]> {
  const { data } = await supabase
    .from('achievements')
    .select('key')
    .eq('user_id', myId);
  return (data ?? []).map((r) => (r as { key: string }).key);
}

/** يفحص الإنجازات ويرجع الجديدة التي فُتحت الآن فقط */
export async function checkAchievements(): Promise<string[]> {
  const { data, error } = await supabase.rpc('check_achievements');
  if (error || !data) return [];
  return (data as { key: string }[]).map((r) => r.key);
}

// ---------------- لوحة الشرف ----------------

export interface LeaderRow {
  user_id: string;
  total: number;
  gifts: number;
  profile: PublicProfile | null;
}

export async function fetchLeaderboard(): Promise<{
  givers: LeaderRow[];
  receivers: LeaderRow[];
}> {
  const { data, error } = await supabase.rpc('gift_leaderboard');
  if (error || !data) return { givers: [], receivers: [] };
  const raw = data as {
    givers: { user_id: string; total: number; gifts: number }[];
    receivers: { user_id: string; total: number; gifts: number }[];
  };
  const enrich = async (
    rows: { user_id: string; total: number; gifts: number }[],
  ): Promise<LeaderRow[]> => {
    const out: LeaderRow[] = [];
    for (const r of rows) {
      out.push({ ...r, profile: await fetchPublicProfile(r.user_id) });
    }
    return out;
  };
  return {
    givers: await enrich(raw.givers ?? []),
    receivers: await enrich(raw.receivers ?? []),
  };
}

// ---------------- الستوري ----------------

export interface StoryGroup {
  user: PublicProfile;
  stories: Story[];
  avatar: string | null;
}

export async function fetchStories(): Promise<Story[]> {
  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []) as Story[];
}

export async function createTextStory(myId: string, body: string): Promise<boolean> {
  const { error } = await supabase
    .from('stories')
    .insert({ user_id: myId, type: 'text', body: body.trim() });
  return !error;
}

export async function createImageStory(
  myId: string,
  localUri: string,
): Promise<boolean> {
  const path = `${myId}/${Date.now()}.jpg`;
  const res = await fetch(localUri);
  const blob = await res.blob();
  const { error: upErr } = await supabase.storage
    .from('stories')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (upErr) return false;
  const { error } = await supabase
    .from('stories')
    .insert({ user_id: myId, type: 'image', media_path: path });
  return !error;
}

export async function deleteStory(story: Story): Promise<boolean> {
  const { error } = await supabase.from('stories').delete().eq('id', story.id);
  if (story.media_path) {
    await supabase.storage.from('stories').remove([story.media_path]);
  }
  return !error;
}

const storyUrlCache = new Map<string, { url: string; at: number }>();
export async function storySignedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const hit = storyUrlCache.get(path);
  if (hit && Date.now() - hit.at < 50 * 60 * 1000) return hit.url;
  const { data } = await supabase.storage.from('stories').createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  storyUrlCache.set(path, { url: data.signedUrl, at: Date.now() });
  return data.signedUrl;
}

// ---------------- تفاعلات الستوري: مشاهدات + قلوب + تعليقات ----------------

export interface StoryViewerRow {
  user_id: string;
  shown_name: string;
  avatar_url: string | null;
  is_vip: boolean;
  viewed_at: string;
}

export interface StoryStats {
  views: number;
  likes: number;
  comments: number;
  viewers: StoryViewerRow[];
}

export interface StoryComment {
  id: string;
  story_id: string;
  user_id: string;
  body: string;
  created_at: string;
  shown_name: string;
  avatar_url: string | null;
  is_vip: boolean;
}

export async function recordStoryView(storyId: string): Promise<void> {
  await supabase.rpc('record_story_view', { p_story: storyId });
}

export async function toggleStoryLike(
  storyId: string,
): Promise<{ liked: boolean; likes: number } | null> {
  const { data, error } = await supabase.rpc('toggle_story_like', {
    p_story: storyId,
  });
  if (error || !data) return null;
  return data as { liked: boolean; likes: number };
}

export async function getStoryLikeState(
  storyId: string,
): Promise<{ liked: boolean; likes: number } | null> {
  const { data, error } = await supabase.rpc('get_story_like_state', {
    p_story: storyId,
  });
  if (error || !data) return null;
  return data as { liked: boolean; likes: number };
}

export async function addStoryComment(storyId: string, body: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('add_story_comment', {
    p_story: storyId,
    p_body: body,
  });
  return !error && !!(data as { ok?: boolean } | null)?.ok;
}

export async function getStoryComments(storyId: string): Promise<StoryComment[]> {
  const { data, error } = await supabase.rpc('get_story_comments', {
    p_story: storyId,
  });
  if (error || !data) return [];
  return data as StoryComment[];
}

export async function getStoryStats(storyId: string): Promise<StoryStats | null> {
  const { data, error } = await supabase.rpc('get_story_stats', {
    p_story: storyId,
  });
  if (error || !data) return null;
  return data as StoryStats;
}

// ---------------- زوار البروفايل ----------------

export async function recordProfileVisit(profileId: string): Promise<void> {
  await supabase.rpc('record_profile_visit', { p_profile: profileId });
}

export interface VisitRow {
  visitor: PublicProfile;
  visited_at: string;
}

export async function fetchMyVisitors(myId: string): Promise<VisitRow[]> {
  const { data } = await supabase
    .from('profile_visits')
    .select('visitor_id, visited_at')
    .eq('profile_id', myId)
    .order('visited_at', { ascending: false })
    .limit(50);
  const out: VisitRow[] = [];
  for (const r of (data ?? []) as { visitor_id: string; visited_at: string }[]) {
    const p = await fetchPublicProfile(r.visitor_id);
    if (p) out.push({ visitor: p, visited_at: r.visited_at });
  }
  return out;
}
