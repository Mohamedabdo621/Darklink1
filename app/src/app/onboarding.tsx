import React, { useRef, useState, useMemo } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Logo, NeonButton, Screen } from '../components/ui';
import { setLanguage } from '../i18n';
import type { Language } from '../lib/types';
import { fonts, radius, spacing } from '../theme';
import { ONBOARDING_KEY } from './index';

import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme';
const { width } = Dimensions.get('window');

export default function Onboarding() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(0);
  const listRef = useRef<FlatList>(null);

  const slides = [
    { icon: '🌑', title: t('onboarding.slide1Title'), body: t('onboarding.slide1Body') },
    { icon: '🪪', title: t('onboarding.slide2Title'), body: t('onboarding.slide2Body') },
    { icon: '🎁', title: t('onboarding.slide3Title'), body: t('onboarding.slide3Body') },
  ];

  const pickLanguage = async (lang: Language) => {
    await setLanguage(lang);
  };

  const finish = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, '1');
    router.replace('/(auth)/login');
  };

  const next = () => {
    if (page < slides.length - 1) {
      // On web, programmatic scrolling does not reliably fire
      // onMomentumScrollEnd, so update the page state directly —
      // otherwise the button appears dead and every tap re-targets
      // the same slide.
      const nextPage = page + 1;
      setPage(nextPage);
      listRef.current?.scrollToIndex({ index: nextPage, animated: true });
    } else {
      finish();
    }
  };

  return (
    <Screen>
      <View style={{ alignItems: 'center', marginTop: spacing.xl }}>
        <Logo size={34} />
        <Text style={styles.tagline}>{t('common.tagline')}</Text>
      </View>

      <View style={styles.langRow}>
        <Text style={{ color: colors.muted }}>{t('onboarding.chooseLanguage')}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['ar', 'en'] as Language[]).map((l) => (
            <TouchableOpacity
              key={l}
              onPress={() => pickLanguage(l)}
              style={[
                styles.langChip,
                i18n.language === l && { borderColor: colors.accent, backgroundColor: colors.card },
              ]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {l === 'ar' ? 'العربية' : 'English'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        getItemLayout={(_, index) => ({
          length: width - spacing.lg * 2,
          offset: (width - spacing.lg * 2) * index,
          index,
        })}
        onMomentumScrollEnd={(e) =>
          setPage(Math.round(e.nativeEvent.contentOffset.x / width))
        }
        renderItem={({ item }) => (
          <View style={[styles.slide, { width: width - spacing.lg * 2 }]}>
            <Text style={{ fontSize: 64 }}>{item.icon}</Text>
            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.slideBody}>{item.body}</Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {slides.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === page && { backgroundColor: colors.accent, width: 22 }]}
          />
        ))}
      </View>

      <View style={{ marginBottom: spacing.xl }}>
        <NeonButton
          title={page === slides.length - 1 ? t('onboarding.getStarted') : t('common.continue')}
          onPress={next}
        />
      </View>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  tagline: {
    color: colors.muted,
    fontSize: fonts.sizes.sm,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
  },
  langChip: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  slide: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.lg },
  slideTitle: {
    color: colors.text,
    fontSize: fonts.sizes.xxl,
    fontWeight: fonts.weights.black,
    textAlign: 'center',
  },
  slideBody: {
    color: colors.muted,
    fontSize: fonts.sizes.md,
    textAlign: 'center',
    lineHeight: 24,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: spacing.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.stroke },
});
