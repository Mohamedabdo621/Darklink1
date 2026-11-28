import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { appAlert } from '../lib/dialog';
import { INTEREST_KEYS, MAX_INTERESTS } from '../lib/interests';
import { Avatar } from '../components/Avatar';
import { Logo, NeonButton, NeonInput, Screen } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import type { IdentityMode, Profile } from '../lib/types';
import {
  avatarSignedUrl,
  suggestDisplayNames,
  updateMyProfile,
  uploadAvatar,
  validateDisplayName,
} from '../services/profile';
import { fonts, radius, spacing } from '../theme';

import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme';

type Gender = 'male' | 'female' | 'prefer_not_to_say';

function calcAge(birth: Date): number {
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

/** يحوّل يوم/شهر/سنة لتاريخ ISO — ويرجع null لو التاريخ مش حقيقي */
function parseBirthdate(
  day: string,
  month: string,
  year: string,
): string | null {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  const now = new Date();
  if (!day || !month || !year) return null;
  if (d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > now.getFullYear()) {
    return null;
  }
  const date = new Date(y, m - 1, d);
  if (
    date.getDate() !== d ||
    date.getMonth() !== m - 1 ||
    date.getFullYear() !== y
  ) {
    return null;
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export default function CompleteProfile() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { profile, refreshProfile, signOut, loading, profileError } = useAuth();

  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<IdentityMode>(
    profile?.identity_mode ?? 'anonymous',
  );
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [day, setDay] = useState(() => profile?.birthdate?.split('-')[2] ?? '');
  const [month, setMonth] = useState(() => profile?.birthdate?.split('-')[1] ?? '');
  const [year, setYear] = useState(() => profile?.birthdate?.split('-')[0] ?? '');
  const [gender, setGender] = useState<Gender | null>(
    (profile?.gender as Gender | null) ?? null,
  );
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [nameErr, setNameErr] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [birthErr, setBirthErr] = useState('');
  const [underage, setUnderage] = useState(false);
  const [busy, setBusy] = useState(false);

  // تعبئة الصورة من الملف لو موجودة
  useEffect(() => {
    if (profile?.avatar_url) {
      avatarSignedUrl(profile.avatar_url).then((u) => setAvatar(u));
    }
  }, [profile?.avatar_url]);

  const digits = (v: string) => v.replace(/[^0-9]/g, '');

  const pickPhoto = async () => {
    if (!profile) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (res.canceled || !res.assets[0]) return;
    setBusy(true);
    const path = await uploadAvatar(profile.id, res.assets[0].uri);
    setBusy(false);
    if (path) setAvatar(res.assets[0].uri);
  };

  const toggleInterest = (key: string) => {
    setInterests((prev) =>
      prev.includes(key)
        ? prev.filter((k) => k !== key)
        : prev.length >= MAX_INTERESTS
          ? prev
          : [...prev, key],
    );
  };

  const next = async () => {
    if (step === 0) {
      const name = displayName.trim();
      if (mode === 'public') {
        if (!name) {
          setNameErr(t('completeProfile.nameRequired'));
          return;
        }
        if (name.length < 2) {
          setNameErr(t('completeProfile.nameShort'));
          return;
        }
      }
      if (name) {
        // الاسم ميتكررش: تحقق مسبق قبل ما نكمل الخطوات (حتى لو الوضع
        // مجهول — الاسم بيتحفظ برضه). اسم على شكل كود مرفوض إلا لو
        // هو كود المستخدم نفسه (مثال: أليكس اسمه A-1 وهو كوده).
        const check = await validateDisplayName(name, {
          displayName: profile?.display_name ?? null,
          publicCode: profile?.public_code ?? null,
        });
        if (!check.ok) {
          if (check.reason === 'pattern') {
            setNameErr('مينفعش الاسم يكون على شكل كود (زي A-1) — اختار اسم تاني');
            setSuggestions([]);
          } else {
            setNameErr('الاسم ده مستخدم بالفعل، جرّب تضيف رقم أو رمز');
            setSuggestions(check.suggestions ?? []);
          }
          return;
        }
        setSuggestions([]);
      }
      setNameErr('');
      setStep(1);
      return;
    }
    if (step === 1) {
      if (!day || !month || !year) {
        setBirthErr(t('completeProfile.birthdateRequired'));
        return;
      }
      const iso = parseBirthdate(day, month, year);
      if (!iso) {
        setBirthErr(t('completeProfile.birthdateInvalid'));
        return;
      }
      if (calcAge(new Date(iso)) < 16) {
        setBirthErr('');
        setUnderage(true);
        return;
      }
      setBirthErr('');
      setStep(2);
    }
  };

  const save = async () => {
    if (!profile) return;
    const iso = parseBirthdate(day, month, year);
    if (!iso) {
      setStep(1);
      setBirthErr(t('completeProfile.birthdateInvalid'));
      return;
    }
    setBusy(true);
    const fields: Partial<Profile> = {
      display_name: displayName.trim() || null,
      identity_mode: mode,
      birthdate: iso,
      gender: gender ?? null,
      bio: bio.trim() || null,
      interests,
      // اختيار "عام" بيشغّل "مشاركة معلوماتي" تلقائيًا — من غيرها الاسم
      // المعروض مش هيبان للناس حتى لو الحساب عام (shownNameOf بيشترط الاتنين).
      ...(mode === 'public' ? { share_info: true } : {}),
    };
    const res = await updateMyProfile(profile.id, fields);
    setBusy(false);
    if (!res.ok) {
      if (res.taken) {
        // سباق: الاسم اتاخد بعد التحقق المسبق — نرجع لخطوة الاسم
        setStep(0);
        setNameErr('الاسم ده مستخدم بالفعل، جرّب تضيف رقم أو رمز');
        setSuggestions(await suggestDisplayNames(displayName.trim()));
        return;
      }
      appAlert(t('common.error'), t('common.error'));
      return;
    }
    // مننتقلش للرئيسية غير بعد ما إعادة جلب الملف تنجح — لو فشلت
    // المستخدم يفضل هنا ويقدر يدوس "إنهاء" تاني بدل ما يدخل بملف قديم.
    const ok = await refreshProfile();
    if (!ok) {
      appAlert(t('common.error'), 'اتحفظت بياناتك بس تعذّر تحديث ملفك — دوس إنهاء تاني');
      return;
    }
    router.replace('/(tabs)/home');
  };

  const doSignOut = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  if (!profile) {
    // لسه الجلب شغال — سبينر بس. لو الجلب فشل — شاشة إعادة محاولة
    // (مش الفورم)، ولو مفيش صف أصلًا من غير خطأ — إعادة محاولة برضه
    // لحد ما الصف يتكوّن.
    if (loading) {
      return (
        <Screen>
          <View style={styles.center}>
            <Logo size={32} />
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        </Screen>
      );
    }
    return (
      <Screen>
        <View style={styles.center}>
          <Logo size={32} />
          <Text style={styles.title}>
            {profileError ? 'تعذّر تحميل ملفك' : 'ملفك لسه بيتجهز'}
          </Text>
          <Text style={styles.subtitle}>
            {profileError ? 'اتأكد من النت وحاول تاني' : 'حاول تاني بعد شوية'}
          </Text>
          <NeonButton title={t('common.retry')} onPress={() => void refreshProfile()} />
          <TouchableOpacity onPress={doSignOut} style={styles.backBtn}>
            <Text style={{ color: colors.faint, fontSize: fonts.sizes.sm }}>
              {t('completeProfile.signOut')}
            </Text>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  if (underage) {
    return (
      <Screen>
        <View style={styles.center}>
          <Logo size={32} />
          <Text style={styles.title}>{t('completeProfile.underage')}</Text>
          <Text style={styles.subtitle}>{t('completeProfile.underageDesc')}</Text>
          <NeonButton title={t('completeProfile.signOut')} onPress={doSignOut} />
        </View>
      </Screen>
    );
  }

  const steps = [
    t('completeProfile.stepIdentity'),
    t('completeProfile.stepAge'),
    t('completeProfile.stepAbout'),
  ];

  return (
    <Screen>
      <KeyboardAwareScrollView
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
          <Logo size={30} />
          <Text style={styles.title}>{t('completeProfile.title')}</Text>
          <Text style={styles.subtitle}>{t('completeProfile.subtitle')}</Text>
        </View>

        <View style={styles.dots}>
          {steps.map((label, i) => (
            <View key={label} style={styles.dotWrap}>
              <View
                style={[styles.dot, i === step && styles.dotActive]}
              />
              <Text
                style={[
                  styles.dotLabel,
                  i === step && { color: colors.primaryBright },
                ]}>
                {label}
              </Text>
            </View>
          ))}
        </View>

        {step === 0 && (
          <>
            <Text style={styles.sectionTitle}>
              {t('completeProfile.identityTitle')}
            </Text>
            <View style={styles.modeRow}>
              {(['anonymous', 'public'] as IdentityMode[]).map((m) => {
                const active = mode === m;
                return (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setMode(m)}
                    style={[styles.modeCard, active && styles.modeCardActive]}>
                    <Text style={styles.modeIcon}>
                      {m === 'anonymous' ? '🕶' : '🌐'}
                    </Text>
                    <Text
                      style={[
                        styles.modeTitle,
                        active && { color: colors.white },
                      ]}>
                      {m === 'anonymous'
                        ? t('completeProfile.identityAnonymous')
                        : t('completeProfile.identityPublic')}
                    </Text>
                    <Text
                      style={[
                        styles.modeDesc,
                        active && { color: colors.white },
                      ]}>
                      {m === 'anonymous'
                        ? t('completeProfile.identityAnonymousDesc')
                        : t('completeProfile.identityPublicDesc')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <NeonInput
              label={t('completeProfile.displayName')}
              value={displayName}
              onChangeText={(v) => {
                setDisplayName(v);
                setNameErr('');
                setSuggestions([]);
              }}
              maxLength={30}
              error={nameErr}
              placeholder={profile.anonymous_alias}
            />
            {suggestions.length > 0 ? (
              <View style={styles.suggestRow}>
                <Text style={styles.suggestLabel}>اقتراحات متاحة:</Text>
                {suggestions.map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => {
                      setDisplayName(s);
                      setSuggestions([]);
                      setNameErr('');
                    }}
                    style={styles.suggestChip}>
                    <Text style={styles.suggestText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <Text style={styles.hint}>
              {mode === 'public'
                ? t('completeProfile.displayNameHintPublic')
                : t('completeProfile.displayNameHintAnonymous')}
            </Text>
            {mode === 'public' ? (
              <Text style={[styles.hint, { marginTop: spacing.xs }]}>
                الاسم ده بيظهر للناس بس لما يكون حسابك «عام» و«مشاركة معلوماتي»
                مفعّلة — واختيارك «عام» هنا هيشغّلها تلقائيًا.
              </Text>
            ) : null}
          </>
        )}

        {step === 1 && (
          <>
            <Text style={styles.sectionTitle}>
              {t('completeProfile.birthdate')}
            </Text>
            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <NeonInput
                  label={t('completeProfile.day')}
                  value={day}
                  onChangeText={(v) => {
                    setDay(digits(v));
                    setBirthErr('');
                  }}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="15"
                />
              </View>
              <View style={{ flex: 1 }}>
                <NeonInput
                  label={t('completeProfile.month')}
                  value={month}
                  onChangeText={(v) => {
                    setMonth(digits(v));
                    setBirthErr('');
                  }}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="06"
                />
              </View>
              <View style={{ flex: 1.4 }}>
                <NeonInput
                  label={t('completeProfile.year')}
                  value={year}
                  onChangeText={(v) => {
                    setYear(digits(v));
                    setBirthErr('');
                  }}
                  keyboardType="number-pad"
                  maxLength={4}
                  placeholder="1995"
                />
              </View>
            </View>
            {birthErr ? (
              <Text style={styles.errorText}>{birthErr}</Text>
            ) : null}
            <Text style={styles.hint}>{t('completeProfile.birthdateHint')}</Text>

            <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>
              {t('completeProfile.gender')} ({t('common.optional')})
            </Text>
            <View style={styles.chipRow}>
              {(['male', 'female', 'prefer_not_to_say'] as Gender[]).map(
                (g) => {
                  const active = gender === g;
                  return (
                    <TouchableOpacity
                      key={g}
                      onPress={() => setGender(active ? null : g)}
                      style={[styles.chip, active && styles.chipActive]}>
                      <Text
                        style={{
                          color: active ? colors.white : colors.muted,
                          fontWeight: '700',
                        }}>
                        {t(`completeProfile.gender${g === 'male' ? 'Male' : g === 'female' ? 'Female' : 'PreferNot'}`)}
                      </Text>
                    </TouchableOpacity>
                  );
                },
              )}
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
              <TouchableOpacity onPress={pickPhoto}>
                <Avatar
                  uri={avatar}
                  name={displayName.trim() || profile.anonymous_alias}
                  size={96}
                />
                <Text style={styles.changePhoto}>
                  📷 {t('completeProfile.changePhoto')}
                </Text>
              </TouchableOpacity>
            </View>
            <NeonInput
              label={`${t('completeProfile.bio')} (${t('common.optional')})`}
              value={bio}
              onChangeText={setBio}
              multiline
              maxLength={160}
              placeholder={t('completeProfile.bioPlaceholder')}
            />
            <Text style={styles.sectionTitle}>
              {t('completeProfile.interestsTitle')} ({t('common.optional')})
            </Text>
            <View style={styles.chipRow}>
              {INTEREST_KEYS.map((k) => {
                const active = interests.includes(k);
                return (
                  <TouchableOpacity
                    key={k}
                    onPress={() => toggleInterest(k)}
                    style={[styles.chip, active && styles.chipActive]}>
                    <Text
                      style={{
                        color: active ? colors.white : colors.muted,
                        fontWeight: '700',
                      }}>
                      {t(`interests.${k}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.hint}>
              {t('interests.pickUpTo')} {MAX_INTERESTS}
            </Text>
          </>
        )}

        <View style={{ marginTop: spacing.xl }}>
          {step < 2 ? (
            <NeonButton title={t('common.continue')} onPress={next} />
          ) : (
            <NeonButton
              title={t('completeProfile.finish')}
              onPress={save}
              loading={busy}
            />
          )}
          {step > 0 && (
            <TouchableOpacity
              onPress={() => setStep(step - 1)}
              style={styles.backBtn}>
              <Text style={{ color: colors.muted, fontWeight: '700' }}>
                {t('common.back')}
              </Text>
            </TouchableOpacity>
          )}
          {step === 2 && (
            <TouchableOpacity onPress={save} style={styles.backBtn}>
              <Text style={{ color: colors.muted, fontWeight: '700' }}>
                {t('completeProfile.skip')}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={doSignOut} style={styles.backBtn}>
            <Text style={{ color: colors.faint, fontSize: fonts.sizes.sm }}>
              {t('completeProfile.signOut')}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.bold,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.muted,
    fontSize: fonts.sizes.md,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 22,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
    marginBottom: spacing.xl,
  },
  dotWrap: { alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.stroke },
  dotActive: { backgroundColor: colors.accent, width: 22 },
  dotLabel: { color: colors.muted, fontSize: fonts.sizes.xs },
  sectionTitle: {
    color: colors.text,
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    marginBottom: spacing.md,
  },
  modeRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  modeCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.glass,
  },
  modeCardActive: {
    borderColor: colors.accent,
    backgroundColor: colors.card,
  },
  modeIcon: { fontSize: 28 },
  modeTitle: { color: colors.text, fontWeight: '700', fontSize: fonts.sizes.md },
  modeDesc: {
    color: colors.muted,
    fontSize: fonts.sizes.xs,
    textAlign: 'center',
    lineHeight: 16,
  },
  hint: {
    color: colors.faint,
    fontSize: fonts.sizes.sm,
    marginTop: -spacing.sm,
    lineHeight: 20,
    width: '100%',
    flexShrink: 1,
  },
  dateRow: { flexDirection: 'row', gap: spacing.md },
  errorText: { color: colors.danger, fontSize: fonts.sizes.sm, marginTop: -spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.glass,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  changePhoto: {
    color: colors.accent,
    fontSize: fonts.sizes.sm,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  backBtn: { alignItems: 'center', paddingVertical: spacing.md },
  suggestRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  suggestLabel: { color: colors.muted, fontSize: fonts.sizes.sm },
  suggestChip: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.glass,
  },
  suggestText: {
    color: colors.primaryBright,
    fontWeight: '700',
    fontSize: fonts.sizes.sm,
  },
});
