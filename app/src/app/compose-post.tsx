import React, { useState, useMemo } from 'react';
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  AudioModule,
  RecordingPresets,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useTranslation } from 'react-i18next';
import { GlowCard, NeonButton, Screen } from '../components/ui';
import { appAlert } from '../lib/dialog';
import { createPost, pickPostImage, pickPostVideo } from '../services/timeline';
import { fonts, radius, spacing } from '../theme';

import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme';

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function ComposePost() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const [body, setBody] = useState('');
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'voice' | null>(null);
  const [voiceDuration, setVoiceDuration] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // الاستطلاع: سؤال اختياري + خيارين لحد 4
  const [pollOn, setPollOn] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  // الفويس: تسجيل سريع من نفس الشاشة
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: false,
  });
  const recState = useAudioRecorderState(recorder, 500);
  const [recording, setRecording] = useState(false);

  const videoPlayer = useVideoPlayer(mediaType === 'video' ? mediaUri : null);

  const clearMedia = () => {
    setMediaUri(null);
    setMediaType(null);
    setVoiceDuration(null);
  };

  const startVoice = async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      appAlert(t('common.error'), t('timeline.voicePermission'));
      return;
    }
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch {
      appAlert(t('common.error'), t('common.error'));
    }
  };

  const stopVoice = async () => {
    try {
      await recorder.stop();
    } catch {
      // المسجل واقف أصلًا
    }
    const uri = recorder.uri;
    const dur = Math.max(1, Math.round(recState.durationMillis / 1000));
    setRecording(false);
    if (uri) {
      setMediaUri(uri);
      setMediaType('voice');
      setVoiceDuration(dur);
    }
  };

  const submit = async () => {
    if (body.trim().length < 1) {
      appAlert(t('common.error'), t('timeline.empty'));
      return;
    }
    const options = pollOptions.map((o) => o.trim()).filter((o) => o.length > 0);
    if (pollOn && options.length < 2) {
      appAlert(t('common.error'), t('timeline.pollNeedTwo'));
      return;
    }
    setBusy(true);
    const res = await createPost(
      body.trim(),
      mediaUri,
      mediaType,
      voiceDuration,
      pollOn ? { question: pollQuestion.trim(), options } : null,
    );
    setBusy(false);
    if (res.ok) {
      appAlert('✓', t('timeline.posted'), [
        { text: t('common.ok'), onPress: () => router.back() },
      ]);
    } else if (res.reason === 'daily_limit') {
      appAlert(t('common.error'), t('timeline.dailyLimit'));
    } else {
      appAlert(t('common.error'), t('common.error'));
    }
  };

  return (
    <Screen>
      <KeyboardAwareScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('timeline.compose')}</Text>
        <GlowCard>
          <TextInput
            style={styles.input}
            value={body}
            onChangeText={(v) => setBody(v.slice(0, 500))}
            placeholder={t('timeline.placeholder')}
            placeholderTextColor={colors.faint}
            multiline
            autoFocus
          />
          <Text style={styles.counter}>{body.length}/500</Text>

          {mediaUri && mediaType === 'image' ? (
            <View>
              <Image source={{ uri: mediaUri }} style={styles.preview} />
              <TouchableOpacity onPress={clearMedia}>
                <Text style={styles.remove}>{t('timeline.removePhoto')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {mediaUri && mediaType === 'video' ? (
            <View>
              <VideoView
                player={videoPlayer}
                style={styles.preview}
                nativeControls
                contentFit="contain"
              />
              <TouchableOpacity onPress={clearMedia}>
                <Text style={styles.remove}>{t('timeline.removeVideo')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {mediaUri && mediaType === 'voice' ? (
            <View style={styles.voiceRow}>
              <Ionicons name="mic" size={22} color={colors.primaryBright} />
              <Text style={styles.voiceText}>
                🎙️ {fmt(voiceDuration ?? 0)}
              </Text>
              <TouchableOpacity onPress={clearMedia}>
                <Text style={styles.remove}>{t('timeline.removeVoice')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.attachRow}>
            <TouchableOpacity
              style={styles.attachBtn}
              onPress={async () => {
                const uri = await pickPostImage();
                if (uri) {
                  setMediaUri(uri);
                  setMediaType('image');
                  setVoiceDuration(null);
                }
              }}>
              <Ionicons name="image-outline" size={22} color={colors.primaryBright} />
              <Text style={styles.attachText}>{t('timeline.photo')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.attachBtn}
              onPress={async () => {
                const uri = await pickPostVideo();
                if (uri) {
                  setMediaUri(uri);
                  setMediaType('video');
                  setVoiceDuration(null);
                }
              }}>
              <Ionicons name="videocam-outline" size={22} color={colors.primaryBright} />
              <Text style={styles.attachText}>{t('timeline.video')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.attachBtn}
              onPress={() => void (recording ? stopVoice() : startVoice())}>
              <Ionicons
                name={recording ? 'stop-circle' : 'mic-outline'}
                size={22}
                color={recording ? colors.danger : colors.primaryBright}
              />
              <Text style={[styles.attachText, recording && { color: colors.danger }]}>
                {recording ? `${t('timeline.recording')} ${fmt(recState.durationMillis / 1000)}` : t('timeline.voice')}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.pollToggle}
            onPress={() => setPollOn((v) => !v)}>
            <Ionicons
              name={pollOn ? 'stats-chart' : 'stats-chart-outline'}
              size={22}
              color={colors.primaryBright}
            />
            <Text style={styles.attachText}>{t('timeline.addPoll')}</Text>
          </TouchableOpacity>
          {pollOn ? (
            <View style={styles.pollBox}>
              <TextInput
                style={styles.pollInput}
                value={pollQuestion}
                onChangeText={(v) => setPollQuestion(v.slice(0, 100))}
                placeholder={t('timeline.pollQuestion')}
                placeholderTextColor={colors.faint}
              />
              {pollOptions.map((opt, i) => (
                <View key={i} style={styles.pollOptRow}>
                  <TextInput
                    style={[styles.pollInput, { flex: 1 }]}
                    value={opt}
                    onChangeText={(v) => {
                      const next = [...pollOptions];
                      next[i] = v.slice(0, 50);
                      setPollOptions(next);
                    }}
                    placeholder={`${t('timeline.pollOption')} ${i + 1}`}
                    placeholderTextColor={colors.faint}
                  />
                  {pollOptions.length > 2 ? (
                    <TouchableOpacity
                      onPress={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}>
                      <Ionicons name="close-circle" size={22} color={colors.muted} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
              {pollOptions.length < 4 ? (
                <TouchableOpacity
                  onPress={() => setPollOptions([...pollOptions, ''])}
                  style={styles.addOpt}>
                  <Ionicons name="add-circle-outline" size={20} color={colors.primaryBright} />
                  <Text style={styles.attachText}>{t('timeline.addOption')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </GlowCard>
        <View style={{ marginTop: spacing.lg }}>
          <NeonButton title={t('timeline.post')} onPress={submit} loading={busy} />
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.bold,
    marginVertical: spacing.md,
  },
  input: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    lineHeight: 23,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  counter: { color: colors.faint, fontSize: fonts.sizes.xs, textAlign: 'right', marginTop: 4 },
  preview: {
    width: '100%',
    height: 220,
    borderRadius: radius.lg,
    marginTop: spacing.md,
    backgroundColor: colors.surfaceLight,
  },
  remove: { color: colors.danger, fontSize: fonts.sizes.sm, marginTop: spacing.sm },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  voiceText: { color: colors.text, fontWeight: '700', flex: 1 },
  attachRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginTop: spacing.md },
  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  attachText: { color: colors.primaryBright, fontWeight: '700' },
  pollToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  pollBox: { gap: spacing.sm, marginTop: spacing.sm },
  pollInput: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceLight,
  },
  pollOptRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  addOpt: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
