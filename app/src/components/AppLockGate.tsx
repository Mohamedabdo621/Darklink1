// DARKLINK — بوابة قفل التطبيق (v1.6.0)
// بتظهر شاشة القفل فوق كل الشاشات لما القفل مفعّل: عند فتح التطبيق
// أو الرجوع من الخلفية. الفتح بالبصمة (لو متاحة ومسجلة) أو برمز PIN.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  authenticateBiometric,
  biometricsAvailable,
  hasPin,
  isLockEnabled,
  setLockEnabled,
  verifyPin,
} from '../lib/applock';
import { fonts, radius, spacing, type ThemeColors } from '../theme';
import { Logo } from './ui';

export function AppLockGate() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { profile } = useAuth();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [canBio, setCanBio] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const wasBackground = useRef(false);
  const profileId = profile?.id;

  // حالة القفل عند فتح التطبيق (بعد تحميل البروفايل)
  useEffect(() => {
    let live = true;
    (async () => {
      const en = await isLockEnabled();
      if (!live) return;
      setEnabled(en);
      if (en && profileId) {
        const bio = await biometricsAvailable();
        const pinSet = await hasPin();
        if (!live) return;
        const canUnlock = (bio.hardware && bio.enrolled) || pinSet;
        setCanBio(bio.hardware && bio.enrolled);
        if (canUnlock) {
          setLocked(true);
        } else {
          // مفيش أي طريقة فتح (بصمة اتشالت ومفيش PIN) — أوقف القفل
          // تلقائيًا عشان التطبيق ميتقفلش على المستخدم.
          await setLockEnabled(false);
          setEnabled(false);
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [profileId]);

  // الرجوع من الخلفية يقفل التطبيق تاني
  useEffect(() => {
    if (!enabled || !profileId) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        wasBackground.current = true;
      } else if (state === 'active' && wasBackground.current) {
        wasBackground.current = false;
        setPin('');
        setError('');
        setLocked(true);
      }
    });
    return () => sub.remove();
  }, [enabled, profileId]);

  const tryBiometric = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const ok = await authenticateBiometric(t('chat.unlockBiometrics'));
    setBusy(false);
    if (ok) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setPin('');
      setError('');
      setLocked(false);
    }
  }, [busy, t]);

  const submitPin = useCallback(async () => {
    if (pin.length < 4 || busy) return;
    setBusy(true);
    const ok = await verifyPin(pin);
    setBusy(false);
    if (ok) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setPin('');
      setError('');
      setLocked(false);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => {},
      );
      setError(t('chat.unlockFailed'));
      setPin('');
    }
  }, [pin, busy, t]);

  // اعرض البصمة تلقائيًا لما شاشة القفل تظهر
  useEffect(() => {
    if (locked && canBio) {
      const timer = setTimeout(() => {
        void tryBiometric();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [locked, canBio, tryBiometric]);

  if (!locked || !enabled) return null;

  return (
    <View style={styles.overlay}>
      <Logo size={30} />
      <Text style={styles.title}>{t('chat.unlockTitle')}</Text>
      {canBio ? (
        <TouchableOpacity
          style={styles.bioBtn}
          onPress={() => void tryBiometric()}
          disabled={busy}>
          <Text style={styles.bioBtnText}>👆 {t('chat.unlockBiometrics')}</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={styles.hint}>{t('chat.unlockPin')}</Text>
      <TextInput
        value={pin}
        onChangeText={(v) => {
          setError('');
          setPin(v.replace(/[^0-9]/g, '').slice(0, 8));
        }}
        onSubmitEditing={() => void submitPin()}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        autoFocus={!canBio}
        placeholder="••••"
        placeholderTextColor={colors.faint}
        style={styles.pinInput}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity
        style={styles.unlockBtn}
        onPress={() => void submitPin()}
        disabled={pin.length < 4 || busy}>
        <Text style={styles.unlockBtnText}>{t('common.continue')}</Text>
      </TouchableOpacity>
      {canBio ? (
        <Text style={styles.note}>{t('chat.usePinInstead')}</Text>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    zIndex: 999,
  },
  title: {
    color: colors.text,
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.bold,
    marginTop: spacing.sm,
  },
  bioBtn: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  bioBtnText: { color: colors.text, fontSize: fonts.sizes.md },
  hint: { color: colors.muted, fontSize: fonts.sizes.sm },
  pinInput: {
    width: 180,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 22,
    textAlign: 'center',
    letterSpacing: 8,
    paddingVertical: spacing.md,
  },
  error: { color: colors.danger, fontSize: fonts.sizes.sm },
  unlockBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  unlockBtnText: {
    color: colors.white,
    fontSize: fonts.sizes.md,
    fontWeight: fonts.weights.bold,
  },
  note: { color: colors.faint, fontSize: fonts.sizes.xs },
});
