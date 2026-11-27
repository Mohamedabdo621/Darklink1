import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { mediaSignedUrl } from '../services/chat';
import { fonts, radius, sentBubble, spacing } from '../theme';

import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme';
const SPEEDS = [1, 1.5, 2];

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** فقاعة رسالة صوتية: تشغيل/إيقاف + تقدم + سرعة 1x/1.5x/2x + موجة صوتية */
export default function VoiceBubble({
  mediaPath,
  durationSec,
  mine,
}: {
  mediaPath: string | null;
  durationSec: number | null;
  mine: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [uri, setUri] = useState<string | null>(null);
  const [speedIdx, setSpeedIdx] = useState(0);
  const player = useAudioPlayer(uri ? { uri } : null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    let live = true;
    mediaSignedUrl('voice-notes', mediaPath).then((u) => {
      if (live) setUri(u);
    });
    return () => {
      live = false;
    };
  }, [mediaPath]);

  const duration = status.duration || durationSec || 0;
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;

  const bars = useMemo(() => {
    const seed = (durationSec ?? 7) * 13;
    return Array.from({ length: 20 }, (_, i) => {
      const v = Math.abs(Math.sin(seed + i * 1.7)) * 14 + 4;
      return v;
    });
  }, [durationSec]);

  const toggle = () => {
    if (!uri) return;
    if (status.playing) player.pause();
    else {
      if (status.currentTime >= duration - 0.2) player.seekTo(0);
      player.play();
    }
  };

  const cycleSpeed = () => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    player.setPlaybackRate(SPEEDS[next], 'high');
  };

  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={toggle} style={[styles.playBtn, mine && styles.playBtnMine]}>
        <Ionicons name={status.playing ? 'pause' : 'play'} size={16} color={colors.white} />
      </TouchableOpacity>
      <View style={styles.bars}>
        {bars.map((h, i) => (
          <View
            key={i}
            style={{
              width: 3,
              height: h,
              borderRadius: 2,
              backgroundColor:
                i / bars.length <= progress
                  ? mine
                    ? sentBubble.text
                    : colors.accent
                  : mine
                    ? 'rgba(30,27,75,0.25)'
                    : 'rgba(168,85,247,0.3)',
            }}
          />
        ))}
      </View>
      <Text style={[styles.time, mine && { color: sentBubble.text }]}>
        {fmt(status.playing || status.currentTime > 0 ? status.currentTime : duration)}
      </Text>
      <TouchableOpacity onPress={cycleSpeed} style={[styles.speedBtn, mine && styles.speedBtnMine]}>
        <Text style={[styles.speedText, mine && { color: sentBubble.text }]}>
          {SPEEDS[speedIdx]}x
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 170,
    paddingVertical: 2,
  },
  playBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnMine: { backgroundColor: sentBubble.play },
  bars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 22,
  },
  time: { color: colors.muted, fontSize: fonts.sizes.xs, minWidth: 28 },
  speedBtn: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  speedBtnMine: { borderColor: 'rgba(30,27,75,0.3)' },
  speedText: { color: colors.primaryBright, fontSize: fonts.sizes.xs, fontWeight: '700' },
});
