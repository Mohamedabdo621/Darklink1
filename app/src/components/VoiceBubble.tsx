import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { mediaSignedUrl } from '../services/chat';
import { colors, fonts, radius, spacing } from '../theme';

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
    return Array.from({ length: 28 }, (_, i) => {
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
        <Text style={{ fontSize: 15 }}>{status.playing ? '⏸' : '▶️'}</Text>
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
                    ? colors.white
                    : colors.accent
                  : mine
                    ? 'rgba(255,255,255,0.35)'
                    : 'rgba(168,85,247,0.3)',
            }}
          />
        ))}
      </View>
      <Text style={[styles.time, mine && { color: colors.white }]}>
        {fmt(status.playing || status.currentTime > 0 ? status.currentTime : duration)}
      </Text>
      <TouchableOpacity onPress={cycleSpeed} style={styles.speedBtn}>
        <Text style={[styles.speedText, mine && { color: colors.white }]}>
          {SPEEDS[speedIdx]}x
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 210,
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
  playBtnMine: { backgroundColor: 'rgba(255,255,255,0.25)' },
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
  speedText: { color: colors.primaryBright, fontSize: fonts.sizes.xs, fontWeight: '700' },
});
