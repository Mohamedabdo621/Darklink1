import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { colors, spacing } from '../theme';

/** عارض وسائط بملء الشاشة داخل التطبيق (صورة أو فيديو) */
export default function MediaViewer() {
  const { url, type } = useLocalSearchParams<{ url: string; type: string }>();
  const player = useVideoPlayer(type === 'video' ? (url ?? null) : null, (p) => {
    p.loop = false;
    p.play();
  });

  return (
    <View style={styles.root}>
      <TouchableOpacity style={styles.close} onPress={() => router.back()}>
        <Text style={{ color: colors.white, fontSize: 22 }}>✕</Text>
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
});
