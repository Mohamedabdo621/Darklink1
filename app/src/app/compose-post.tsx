import React, { useState, useMemo } from 'react';
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { GlowCard, NeonButton, Screen } from '../components/ui';
import { appAlert } from '../lib/dialog';
import { createPost, pickPostImage } from '../services/timeline';
import { fonts, radius, spacing } from '../theme';

import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme';
export default function ComposePost() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const [body, setBody] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (body.trim().length < 1) {
      appAlert(t('common.error'), t('timeline.empty'));
      return;
    }
    setBusy(true);
    const res = await createPost(body.trim(), imageUri);
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
          {imageUri ? (
            <View>
              <Image source={{ uri: imageUri }} style={styles.preview} />
              <TouchableOpacity onPress={() => setImageUri(null)}>
                <Text style={styles.remove}>{t('timeline.removePhoto')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <TouchableOpacity
            style={styles.photoBtn}
            onPress={async () => {
              const uri = await pickPostImage();
              if (uri) setImageUri(uri);
            }}>
            <Ionicons name="image-outline" size={22} color={colors.primaryBright} />
            <Text style={{ color: colors.primaryBright, fontWeight: '700' }}>
              {t('timeline.photo')}
            </Text>
          </TouchableOpacity>
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
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
});
