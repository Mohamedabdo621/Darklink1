import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useVideoPlayer, VideoView } from 'expo-video';
import { spacing } from '../theme';
import { downloadMedia, fileNameFromPath } from '../lib/mediaDownload';
import { appAlert } from '../lib/dialog';

import { useTheme } from '../contexts/ThemeContext';
/** عارض وسائط بملء الشاشة داخل التطبيق (صورة أو فيديو) */
export default function MediaViewer() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { url, type } = useLocalSearchParams<{ url: string; type: string }>();
  const player = useVideoPlayer(type === 'video' ? (url ?? null) : null, (p) => {
    p.loop = false;
    p.play();
  });

  /** تنزيل الوسائط إلى المعرض (أو تحميلها على الويب) */
  const onDownload = async () => {
    if (!url) return;
    const clean = url.split('?')[0];
    const result = await downloadMedia(url, fileNameFromPath(clean));
    if (result === 'ok') appAlert('✓', t('chat.downloaded'));
    else appAlert(t('common.error'), t('chat.downloadFailed'));
  };

  return (
    <View style={styles.root}>
      <TouchableOpacity style={styles.close} onPress={() => router.back()}>
        <Text style={{ color: colors.white, fontSize: 22 }}>✕</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.download} onPress={onDownload}>
        <Text style={{ color: colors.white, fontSize: 20 }}>⬇</Text>
      </TouchableOpacity>
      {type === 'video' ? (
        <VideoView
          player={player}
          style={styles.media}
          contentFit="contain"
          nativeControls
        />
      ) : (
        <Image source={{ uri: url }} style={styles.media} resizeMode="contain" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  media: { width: '100%', height: '100%' },
  close: {
    position: 'absolute',
    top: 48,
    end: spacing.md,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  download: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    zIndex: 10,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
