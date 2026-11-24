import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GlowCard, Screen } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { setLanguage } from '../i18n';
import { supabase } from '../lib/supabase';
import {
  fetchBlockedUsers,
  fetchPublicProfile,
  unblockUser,
} from '../services/social';
import type { Language } from '../lib/types';
import { colors, fonts, spacing } from '../theme';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { signOut, profile } = useAuth();
  const [blockedList, setBlockedList] = React.useState<
    { id: string; name: string }[]
  >([]);

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
    Alert.alert(t('settings.language'), t('settings.restartNeeded'));
  };

  const doLogout = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  const deleteAccount = () => {
    Alert.alert(t('settings.deleteAccount'), t('settings.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          Alert.alert(t('settings.deleteAccount'), t('settings.deleteConfirm2'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('common.delete'),
              style: 'destructive',
              onPress: async () => {
                const { error } = await supabase.functions.invoke('delete-account');
                if (error) {
                  Alert.alert(t('common.error'), t('common.error'));
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

const styles = StyleSheet.create({
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
