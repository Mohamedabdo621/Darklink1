import React, { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { appAlert } from '../lib/dialog';
import type { Story } from '../lib/types';
import {
  deleteStory,
  fetchStories,
  storySignedUrl,
} from '../services/features';
import { avatarSignedUrl } from '../services/profile';
import { fetchPublicProfile } from '../services/social';
import { colors, fonts, gradients, spacing } from '../theme';

/** عارض قصص مستخدم واحد: تقدم تلقائي + تنقل باللمس */
export default function StoryViewer() {
  const { t } = useTranslation();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { profile: me } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [idx, setIdx] = useState(0);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const all = await fetchStories();
    setStories(all.filter((s) => s.user_id === userId));
    const pub = await fetchPublicProfile(userId);
    if (pub) {
      setName(pub.shown_name);
      setAvatar(await avatarSignedUrl(pub.avatar_url));
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const current = stories[idx];

  useEffect(() => {
    let live = true;
    if (current?.type === 'image') {
      storySignedUrl(current.media_path).then((u) => {
        if (live) setMediaUrl(u);
      });
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMediaUrl(null);
    }
    return () => {
      live = false;
    };
  }, [current]);

  // تقدم تلقائي كل ٥ ثوانٍ
  useEffect(() => {
    if (!stories.length) return;
    const iv = setTimeout(() => {
      if (idx < stories.length - 1) setIdx(idx + 1);
      else router.back();
    }, 5000);
    return () => clearTimeout(iv);
  }, [idx, stories.length]);

  if (!current) {
    return (
      <Screen>
        <Text style={{ color: colors.muted, textAlign: 'center', marginTop: spacing.xxl }}>
          …
        </Text>
      </Screen>
    );
  }

  const mine = current.user_id === me?.id;

  const onDelete = () => {
    appAlert(t('stories.delete'), t('stories.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          if (await deleteStory(current)) router.back();
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      {/* أشرطة التقدم */}
      <View style={styles.bars}>
        {stories.map((s, i) => (
          <View key={s.id} style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { width: i < idx ? '100%' : i === idx ? '55%' : '0%' },
              ]}
            />
          </View>
        ))}
      </View>
      <View style={styles.header}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text>👤</Text>
          </View>
        )}
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.time}>
          {new Date(current.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
        <View style={{ flex: 1 }} />
        {mine ? (
          <TouchableOpacity onPress={onDelete}>
            <Text style={{ fontSize: 19 }}>🗑</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.white, fontSize: 21 }}>✕</Text>
        </TouchableOpacity>
      </View>

      {current.type === 'image' ? (
        mediaUrl ? (
          <Image source={{ uri: mediaUrl }} style={styles.image} resizeMode="contain" />
        ) : (
          <Text style={styles.loading}>…</Text>
        )
      ) : (
        <LinearGradient colors={[...gradients.button]} style={styles.textBox}>
          <Text style={styles.storyText}>{current.body}</Text>
        </LinearGradient>
      )}

      {/* مناطق اللمس للتنقل */}
      <TouchableOpacity
        style={styles.tapStart}
        onPress={() => (idx > 0 ? setIdx(idx - 1) : null)}
      />
      <TouchableOpacity
        style={styles.tapEnd}
        onPress={() => (idx < stories.length - 1 ? setIdx(idx + 1) : router.back())}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', paddingTop: 44 },
  bars: { flexDirection: 'row', gap: 4, paddingHorizontal: spacing.sm },
  barTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  avatarFallback: {
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { color: colors.white, fontSize: fonts.sizes.md, fontWeight: fonts.weights.bold },
  time: { color: 'rgba(255,255,255,0.7)', fontSize: fonts.sizes.xs },
  image: { flex: 1, width: '100%' },
  loading: { color: colors.white, textAlign: 'center', marginTop: 200 },
  textBox: {
    flex: 1,
    margin: spacing.md,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  storyText: {
    color: colors.white,
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.bold,
    textAlign: 'center',
    lineHeight: 34,
  },
  tapStart: { position: 'absolute', start: 0, top: 110, bottom: 0, width: '35%' },
  tapEnd: { position: 'absolute', end: 0, top: 110, bottom: 0, width: '35%' },
});
