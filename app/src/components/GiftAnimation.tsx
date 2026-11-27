// أوفيرلاي أنيميشن الهدية (Lottie) — بيغطي الشاشة كلها وبيقفل لوحده
// بعد مدة المستوى، أو لما المستخدم يدوس في أي مكان
import React, { useEffect, useMemo, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import LottieView from 'lottie-react-native';
import { useTranslation } from 'react-i18next';
import { giftAnimationFor } from '../lib/giftAnimations';
import { fonts, spacing } from '../theme';

import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme';
interface Props {
  visible: boolean;
  /** name_key الهدية (rose, teddy_bear, ...) — null يعني مفيش أنيميشن */
  giftNameKey: string | null;
  /** اسم الهدية المعروض تحت الأنيميشن */
  giftLabel?: string;
  /** العنوان فوق الأنيميشن (بعت هدية / استلمت هدية / معاينة) */
  title?: string;
  onClose: () => void;
}

export default function GiftAnimation({ visible, giftNameKey, giftLabel, title, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const spec = useMemo(
    () => (giftNameKey ? giftAnimationFor(giftNameKey) : null),
    [giftNameKey],
  );
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!visible) return;
    // هدية ملهاش أنيميشن: اقفل فوراً بدل ما تعلق الشاشة
    if (!spec) {
      onCloseRef.current();
      return;
    }
    const id = setTimeout(() => onCloseRef.current(), spec.durationMs);
    return () => clearTimeout(id);
  }, [visible, spec]);

  if (!visible || !spec) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.center} pointerEvents="box-none">
          <LottieView
            source={spec.source}
            autoPlay
            loop
            style={{ width: spec.size, height: spec.size }}
          />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {giftLabel ? <Text style={styles.gift}>{giftLabel}</Text> : null}
          <Text style={styles.hint}>{t('giftAnimation.tapToClose')}</Text>
        </View>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 0, 20, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
  title: {
    color: colors.text,
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.bold,
    textAlign: 'center',
  },
  gift: { color: colors.gold, fontSize: fonts.sizes.lg, fontWeight: fonts.weights.bold },
  hint: { color: colors.muted, fontSize: fonts.sizes.sm, marginTop: spacing.md },
});
