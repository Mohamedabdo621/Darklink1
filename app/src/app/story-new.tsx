import React, { useState, useMemo } from 'react';
import { I18nManager, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { NeonButton, Screen } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { appAlert } from '../lib/dialog';
import { createImageStory, createTextStory } from '../services/features';
import { fonts, radius, spacing } from '../theme';

import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme';
/** إنشاء قصة جديدة (نصية أو صورة) — تختفي بعد ٢٤ ساعة */
export default function StoryNew() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { profile: me } = useAuth();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  if (!me) return <Screen>{null}</Screen>;

  const postText = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const ok = await createTextStory(me.id, text);
    setBusy(false);
    if (ok) router.back();
    else appAlert(t('common.error'), t('common.error'));
  };

  const postImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (res.canceled || !res.assets[0]) return;
    setBusy(true);
    const ok = await createImageStory(me.id, res.assets[0].uri);
    setBusy(false);
    if (ok) router.back();
    else appAlert(t('common.error'), t('common.error'));
  };

  return (
    <Screen>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.text, fontSize: 22 }}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('home.addStory')}</Text>
        <View style={{ width: 22 }} />
      </View>

      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={t('stories.newText')}
        placeholderTextColor={colors.faint}
        style={styles.input}
        multiline
        maxLength={200}
      />
      <NeonButton title={t('stories.post')} onPress={postText} loading={busy} />

      <View style={{ height: spacing.lg }} />
      <NeonButton
        title={t('stories.imageStory')}
        icon="image-outline"
        onPress={postImage}
        loading={busy}
        variant="ghost"
      />
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: spacing.md,
  },
  title: { color: colors.text, fontSize: fonts.sizes.lg, fontWeight: fonts.weights.bold },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: fonts.sizes.md,
    padding: spacing.md,
    minHeight: 110,
    textAlignVertical: 'top',
    textAlign: I18nManager.isRTL ? 'right' : 'left',
    marginBottom: spacing.md,
  },
});
