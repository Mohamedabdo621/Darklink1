import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { mediaSignedUrl } from '../services/chat';
import { fonts, radius, spacing } from '../theme';

import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme';
const SPEEDS = [1, 1.5, 2];

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** اسم ملف الكاش لرسالة صوتية — مفتاحه الـ bucket + مسار التخزين
 *  (مش الرابط الموقّع، لأنه بينتهي). مثال:
 *  voice-notes/conv/u1/123.m4a ← voice-voice-notes-conv-u1-123.m4a */
function cacheFileFor(bucket: string, mediaPath: string): File {
  const safe = `${bucket}/${mediaPath}`
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
  return new File(Paths.cache, `voice-${safe}`);
}

/** فقاعة رسالة صوتية: تشغيل/إيقاف + تقدم + سرعة 1x/1.5x/2x + موجة صوتية
 *  (bucket افتراضي voice-notes — لبوستات المجتمع بيتبعت post-media) */
export default function VoiceBubble({
  mediaPath,
  durationSec,
  mine,
  bucket = 'voice-notes',
}: {
  mediaPath: string | null;
  durationSec: number | null;
  mine: boolean;
  bucket?: 'voice-notes' | 'post-media';
}) {
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  /** الموجة اللي لسه متسمعتش في الرسايل المستلمة كانت باهتة في الفاتح
   *  (بنفسجي 30% على خلفية فاتحة) — في الفاتح أغمق وأقوى، وفي الغامق
   *  زي ما هي. الموجة اللي اتسمعت بتفضل بلون الـ accent. */
  const [uri, setUri] = useState<string | null>(null);
  /** true لحد ما يتجهز مصدر الصوت (ملف كاش أو رابط موقّع) — زرار
   *  التشغيل بيعرض ActivityIndicator في الفترة دي */
  const [preparing, setPreparing] = useState(true);
  const [speedIdx, setSpeedIdx] = useState(0);
  const player = useAudioPlayer(uri ? { uri } : null);
  const status = useAudioPlayerStatus(player);

  // مصدر الصوت: ملف محلي في كاش التطبيق لو موجود، وإلا نزّل الرابط
  // الموقّع مرة واحدة لـ Paths.cache وأعد استخدامه بعدها. الرابط نفسه
  // بينتهي (ساعة) فمش بيتخزن — اللي بيتخزن بايتات الملف بس.
  // لو التنزيل فشل (رابط منتهي/انقطاع نت) بنرجع للبث من الرابط مباشرة.
  useEffect(() => {
    let live = true;
    (async () => {
      // إعادة التهيئة هنا (داخل الكولباك مش في جسم الـ effect مباشرة)
      // عشان تغيير الرسالة يرجّع زرار التشغيل لحالة التحميل
      setUri(null);
      setPreparing(true);
      if (!mediaPath) {
        setPreparing(false);
        return;
      }
      try {
        if (Platform.OS !== 'web') {
          const cached = cacheFileFor(bucket, mediaPath);
          if (cached.exists && cached.size > 0) {
            if (live) {
              setUri(cached.uri);
              setPreparing(false);
            }
            return;
          }
        }
        const signed = await mediaSignedUrl(bucket, mediaPath);
        if (!live) return;
        if (!signed) {
          setPreparing(false);
          return;
        }
        if (Platform.OS === 'web') {
          // الويب: مفيش كاش ملفات دائم — بث من الرابط زي قبل كده
          setUri(signed);
          setPreparing(false);
          return;
        }
        try {
          const dest = cacheFileFor(bucket, mediaPath);
          const downloaded = await File.downloadFileAsync(signed, dest, {
            idempotent: true,
          });
          if (live) setUri(downloaded.uri);
        } catch {
          // تنزيل جزئي/تالف على أندرويد ممكن يفضل في مكانه — امسحه
          // عشان المحاولة الجاية تنزّل من جديد بدل ما تشغّل ملف بايظ
          try {
            cacheFileFor(bucket, mediaPath).delete();
          } catch {
            // التجاهل آمن — البث من الرابط هو البديل
          }
          if (live) setUri(signed);
        }
        if (live) setPreparing(false);
      } catch {
        if (live) setPreparing(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [mediaPath, bucket]);

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
    if (!uri || preparing) return;
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
      <TouchableOpacity
        onPress={toggle}
        disabled={preparing}
        style={[styles.playBtn, mine && styles.playBtnMine]}>
        {preparing ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <Ionicons name={status.playing ? 'pause' : 'play'} size={16} color={colors.white} />
        )}
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
                    : resolved === 'light'
                      ? 'rgba(124,58,237,0.55)'
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
