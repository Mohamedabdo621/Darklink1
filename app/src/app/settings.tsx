import React, { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { appAlert, appPrompt } from '../lib/dialog';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GlowCard, NeonButton, Screen, ToggleRow } from '../components/ui';
import { bindReferral } from '../services/economy';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  authenticateBiometric,
  biometricsAvailable,
  hasPin,
  isLockEnabled,
  setLockEnabled,
  setPin,
  verifyPin,
} from '../lib/applock';
import { loadDataSaver, setDataSaver } from '../lib/dataSaver';
import { setLanguage } from '../i18n';
import { supabase } from '../lib/supabase';
import {
  fetchBlockedUsers,
  fetchPublicProfile,
  unblockUser,
} from '../services/social';
import type { Language } from '../lib/types';
import type { ThemeColors, ThemeMode } from '../theme';
import { fonts, spacing } from '../theme';

export default function Settings() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation();
  const { signOut, profile } = useAuth();
  const { mode, setMode } = useTheme();
  const [blockedList, setBlockedList] = React.useState<
    { id: string; name: string }[]
  >([]);
  const [lockOn, setLockOn] = React.useState(false);
  const [saverOn, setSaverOn] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      setLockOn(await isLockEnabled());
      setSaverOn(await loadDataSaver());
    })();
  }, []);

  /** تفعيل/إيقاف قفل التطبيق — التفعيل يحتاج بصمة مسجلة أو PIN،
   *  والإيقاف يحتاج تأكيد بالبصمة أو الـ PIN الأول. */
  const onToggleLock = async (v: boolean) => {
    if (v) {
      const bio = await biometricsAvailable();
      if (bio.hardware && bio.enrolled) {
        await setLockEnabled(true);
        setLockOn(true);
        appAlert(t('settings.appLock'), t('settings.appLockEnabled'));
        return;
      }
      if (await hasPin()) {
        await setLockEnabled(true);
        setLockOn(true);
        appAlert(t('settings.appLock'), t('settings.appLockEnabled'));
        return;
      }
      // مفيش بصمة ولا PIN — لازم يعيّن PIN الأول
      appPrompt(
        t('settings.appLockSetPin'),
        t('settings.appLockPinPrompt'),
        t('common.continue'),
        (pin1) => {
          if (!/^\d{4,8}$/.test(pin1.trim())) return;
          appPrompt(
            t('settings.appLockSetPin'),
            t('settings.appLockPinConfirm'),
            t('common.save'),
            async (pin2) => {
              if (pin1.trim() !== pin2.trim()) {
                appAlert(t('common.error'), t('settings.appLockPinMismatch'));
                return;
              }
              await setPin(pin1.trim());
              await setLockEnabled(true);
              setLockOn(true);
              appAlert(t('settings.appLock'), t('settings.appLockEnabled'));
            },
            { secure: true, numeric: true },
          );
        },
        { secure: true, numeric: true },
      );
      return;
    }
    const bio = await biometricsAvailable();
    if (bio.hardware && bio.enrolled) {
      const ok = await authenticateBiometric(t('chat.unlockBiometrics'));
      if (!ok) return;
      await setLockEnabled(false);
      setLockOn(false);
      appAlert(t('settings.appLock'), t('settings.appLockDisabled'));
      return;
    }
    if (await hasPin()) {
      appPrompt(
        t('settings.appLock'),
        t('chat.unlockPin'),
        t('common.continue'),
        async (pin) => {
          if (await verifyPin(pin.trim())) {
            await setLockEnabled(false);
            setLockOn(false);
            appAlert(t('settings.appLock'), t('settings.appLockDisabled'));
          } else {
            appAlert(t('common.error'), t('chat.unlockFailed'));
          }
        },
        { secure: true, numeric: true },
      );
      return;
    }
    await setLockEnabled(false);
    setLockOn(false);
  };

  const onToggleSaver = async (v: boolean) => {
    setSaverOn(v);
    await setDataSaver(v);
  };

  React.useEffect(() => {
    (async () => {
      if (!profile) return;
      const ids = await fetchBlockedUsers(profile.id);
      const list: { id: string; name: string }[] = [];
      for (const bid of ids) {
        const p = await fetchPublicProfile(bid);
        list.push({ id: bid, name: p?.shown_name ?? bid.slice(0, 8) });
      }
      setBlockedList(list);
    })();
  }, [profile]);

  const [refInput, setRefInput] = React.useState('');
  const onBindReferral = async () => {
    if (!refInput.trim()) return;
    const res = await bindReferral(refInput);
    if (res.ok) {
      setRefInput('');
      appAlert('🎁', t('referral.bound'));
    } else {
      appAlert(t('common.error'), t(`referral.err_${res.reason ?? 'error'}`));
    }
  };

  const unblock = async (otherId: string) => {
    if (!profile) return;
    if (await unblockUser(profile.id, otherId)) {
      setBlockedList((prev) => prev.filter((b) => b.id !== otherId));
    }
  };

  const changeLanguage = async (lang: Language) => {
    if (!profile) return;
    await setLanguage(lang);
    await supabase.from('profiles').update({ language: lang }).eq('id', profile.id);
    appAlert(t('settings.language'), t('settings.restartNeeded'));
  };

  const doLogout = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  const deleteAccount = () => {
    appAlert(t('settings.deleteAccount'), t('settings.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          appAlert(t('settings.deleteAccount'), t('settings.deleteConfirm2'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('common.delete'),
              style: 'destructive',
              onPress: async () => {
                const { error } = await supabase.functions.invoke('delete-account');
                if (error) {
                  appAlert(t('common.error'), t('common.error'));
                  return;
                }
                await signOut();
                router.replace('/(auth)/login');
              },
            },
          ]);
        },
      },
    ]);
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('settings.title')}</Text>

        <Text style={styles.section}>{t('settings.language')}</Text>
        <GlowCard>
          {(['ar', 'en'] as Language[]).map((l) => (
            <TouchableOpacity key={l} onPress={() => changeLanguage(l)} style={styles.row}>
              <Text style={{ color: colors.text, fontSize: fonts.sizes.md }}>
                {l === 'ar' ? 'العربية' : 'English'}
              </Text>
              {i18n.language === l ? <Text style={{ color: colors.accent }}>✓</Text> : null}
            </TouchableOpacity>
          ))}
        </GlowCard>

        <Text style={styles.section}>🎨 {t('settings.appearance')}</Text>
        <GlowCard>
          {(
            [
              ['system', t('settings.themeSystem')],
              ['light', t('settings.themeLight')],
              ['dark', t('settings.themeDark')],
            ] as [ThemeMode, string][]
          ).map(([m, label]) => (
            <TouchableOpacity key={m} onPress={() => void setMode(m)} style={styles.row}>
              <Text style={{ color: colors.text, fontSize: fonts.sizes.md }}>{label}</Text>
              {mode === m ? <Text style={{ color: colors.accent }}>✓</Text> : null}
            </TouchableOpacity>
          ))}
        </GlowCard>

        <Text style={styles.section}>🔒 {t('settings.appLock')}</Text>
        <GlowCard>
          <ToggleRow
            title={t('settings.appLock')}
            desc={t('settings.appLockDesc')}
            value={lockOn}
            onChange={(v) => void onToggleLock(v)}
          />
          <ToggleRow
            title={t('settings.dataSaver')}
            desc={t('settings.dataSaverDesc')}
            value={saverOn}
            onChange={(v) => void onToggleSaver(v)}
          />
        </GlowCard>

        <Text style={styles.section}>🎁 {t('referral.bindTitle')}</Text>
        <GlowCard>
          <Text style={{ color: colors.muted, fontSize: fonts.sizes.sm, lineHeight: 19 }}>
            {t('referral.bindDesc')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TextInput
              style={styles.refInput}
              value={refInput}
              onChangeText={setRefInput}
              placeholder="DLXXXXXX"
              placeholderTextColor={colors.faint}
              autoCapitalize="characters"
            />
            <NeonButton title={t('referral.bind')} onPress={onBindReferral} />
          </View>
        </GlowCard>

        <Text style={styles.section}>{t('settings.account')}</Text>
        <GlowCard>
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push('/(auth)/forgot-password')}>
            <Text style={{ color: colors.text, fontSize: fonts.sizes.md }}>
              🔑 {t('settings.changePassword')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={() => router.push('/legal')}>
            <Text style={{ color: colors.text, fontSize: fonts.sizes.md }}>
              📄 {t('settings.legal')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={doLogout}>
            <Text style={{ color: colors.text, fontSize: fonts.sizes.md }}>
              🚪 {t('auth.logout')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={deleteAccount}>
            <Text style={{ color: colors.danger, fontSize: fonts.sizes.md }}>
              🗑 {t('settings.deleteAccount')}
            </Text>
          </TouchableOpacity>
        </GlowCard>

        <Text style={styles.section}>🚫 {t('settings.blockedUsers')}</Text>
        <GlowCard>
          {blockedList.length === 0 ? (
            <Text style={{ color: colors.muted, paddingVertical: spacing.sm }}>
              {t('settings.noBlocked')}
            </Text>
          ) : (
            blockedList.map((b) => (
              <View key={b.id} style={styles.row}>
                <Text style={{ color: colors.text, fontSize: fonts.sizes.md }}>
                  {b.name}
                </Text>
                <TouchableOpacity onPress={() => unblock(b.id)}>
                  <Text style={{ color: colors.accent, fontWeight: '700' }}>
                    {t('settings.unblock')}
                  </Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </GlowCard>
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  refInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: fonts.sizes.md,
  },
  title: {
    color: colors.text,
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.bold,
    marginVertical: spacing.md,
  },
  section: {
    color: colors.muted,
    fontSize: fonts.sizes.sm,
    fontWeight: fonts.weights.bold,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
});
