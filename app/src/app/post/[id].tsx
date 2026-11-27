import React, { useCallback, useState, useMemo } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { GlowCard, GradientRing, NeonButton, Screen } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { avatarSignedUrl } from '../../services/profile';
import {
  addPostComment,
  fetchPostComments,
  fetchTimeline,
  postMediaUrl,
} from '../../services/timeline';
import type { Post, PostComment } from '../../lib/types';
import { fonts, radius, spacing } from '../../theme';

import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme';
export default function PostDetail() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const rows = await fetchTimeline();
    const found = rows.find((p) => p.id === id) ?? null;
    setPost(found);
    if (found?.media_path) setImgUrl(await postMediaUrl(found.media_path));
    const cs = await fetchPostComments(id);
    setComments(cs);
    const urls: Record<string, string> = {};
    for (const c of cs) {
      if (c.avatar_url && !urls[c.user_id]) {
        const u = await avatarSignedUrl(c.avatar_url);
        if (u) urls[c.user_id] = u;
      }
    }
    setAvatars(urls);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const submit = async () => {
    if (!id || body.trim().length < 1) return;
    setBusy(true);
    const res = await addPostComment(id, body.trim());
    setBusy(false);
    if (res.ok) {
      setBody('');
      load();
    }
  };

  if (!profile) return <Screen>{null}</Screen>;

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        {post ? (
          <GlowCard>
            <View style={styles.header}>
              <GradientRing size={44}>
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={{ fontSize: 16 }}>👤</Text>
                </View>
              </GradientRing>
              <View>
                <Text style={styles.name}>
                  {post.shown_name}
                  {post.is_vip ? ' 👑' : ''}
                </Text>
                <Text style={styles.time}>
                  {new Date(post.created_at).toLocaleString()}
                </Text>
              </View>
            </View>
            <Text style={styles.body}>{post.body}</Text>
            {imgUrl ? (
              <Image source={{ uri: imgUrl }} style={styles.postImg} resizeMode="cover" />
            ) : null}
            <Text style={{ color: colors.muted, marginTop: spacing.sm }}>
              ❤️ {post.likes_count} • 💬 {post.comments_count}
            </Text>
          </GlowCard>
        ) : null}

        <Text style={styles.section}>{t('timeline.comments')}</Text>
        {comments.map((c) => (
          <GlowCard key={c.id} style={styles.comment}>
            <View style={styles.header}>
              <GradientRing size={36}>
                {avatars[c.user_id] ? (
                  <Image source={{ uri: avatars[c.user_id] }} style={styles.cAvatar} />
                ) : (
                  <View style={[styles.cAvatar, styles.avatarFallback]}>
                    <Text style={{ fontSize: 14 }}>👤</Text>
                  </View>
                )}
              </GradientRing>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>
                  {c.shown_name}
                  {c.is_vip ? ' 👑' : ''}
                </Text>
                <Text style={styles.time}>
                  {new Date(c.created_at).toLocaleString()}
                </Text>
              </View>
            </View>
            <Text style={styles.body}>{c.body}</Text>
          </GlowCard>
        ))}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={body}
            onChangeText={(v) => setBody(v.slice(0, 500))}
            placeholder={t('timeline.addComment')}
            placeholderTextColor={colors.faint}
            multiline
          />
          <NeonButton title={t('timeline.send')} onPress={submit} loading={busy} />
        </View>
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  back: { marginVertical: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  cAvatar: { width: 30, height: 30, borderRadius: 15 },
  avatarFallback: {
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.stroke,
  },
  name: { color: colors.text, fontWeight: '700', fontSize: fonts.sizes.md },
  time: { color: colors.faint, fontSize: fonts.sizes.xs, marginTop: 2 },
  body: { color: colors.text, fontSize: fonts.sizes.md, lineHeight: 23 },
  postImg: {
    width: '100%',
    height: 260,
    borderRadius: radius.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceLight,
  },
  section: {
    color: colors.text,
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  comment: { marginBottom: spacing.sm },
  inputRow: { gap: spacing.sm, marginTop: spacing.md },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: fonts.sizes.md,
    minHeight: 48,
  },
});
