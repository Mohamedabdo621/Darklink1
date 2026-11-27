// DARKLINK — الوسائط المشتركة في محادثة (شبكة صور وفيديوهات)
// بتتفتح من قائمة الـ 3 نقط في الهيدر — الدوس على عنصر بيفتح العارض بملء الشاشة
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme';
import { fonts, radius, spacing } from '../theme';
import { fetchConversationMedia, mediaSignedUrl } from '../services/chat';
import type { Message } from '../lib/types';

export default function ChatMedia() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const [items, setItems] = useState<Message[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!conversationId) return;
    (async () => {
      const msgs = await fetchConversationMedia(conversationId);
      setItems(msgs);
      const map: Record<string, string> = {};
      await Promise.all(
        msgs.map(async (m) => {
          if (m.media_path) {
            const u = await mediaSignedUrl('chat-media', m.media_path);
            if (u) map[m.id] = u;
          }
        }),
      );
      setUrls(map);
      setLoading(false);
    })();
  }, [conversationId]);

  const open = useCallback(
    (m: Message) => {
      const url = urls[m.id];
      if (!url) return;
      router.push({
        pathname: '/media-viewer',
        params: { url, type: m.type },
      });
    },
    [urls],
  );

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={{ color: colors.muted }}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={{ color: colors.text, fontSize: 22 }}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('chat.menuMedia')}</Text>
      </View>
      {items.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ color: colors.muted, fontSize: fonts.sizes.md }}>
            {t('chat.noMedia')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          numColumns={3}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.tile} onPress={() => open(item)}>
              {urls[item.id] ? (
                <Image
                  source={{ uri: urls[item.id] }}
                  style={styles.thumb}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.thumb, styles.tileLoading]} />
              )}
              {item.type === 'video' ? (
                <View style={styles.playBadge}>
                  <Text style={{ fontSize: 22 }}>▶️</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg, paddingTop: 44 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
    },
    backBtn: { paddingHorizontal: 6, paddingVertical: 2 },
    title: {
      color: colors.text,
      fontSize: fonts.sizes.lg,
      fontWeight: fonts.weights.bold,
    },
    grid: { padding: spacing.xs },
    tile: { flex: 1 / 3, aspectRatio: 1, padding: 2 },
    thumb: {
      width: '100%',
      height: '100%',
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceLight,
    },
    tileLoading: { backgroundColor: colors.surfaceLight },
    playBadge: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      start: 0,
      end: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
