import React, { useMemo } from 'react';
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Paths } from 'expo-file-system';
import { appAlert, appPrompt } from '../lib/dialog';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GlowCard, NeonButton, Screen, ToggleRow } from '../components/ui';
import { GlassIconChip } from '../components/GlassIconButton';
import { bindReferral } from '../services/economy';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  loadChatWallpaper,
  saveChatWallpaper,
  type ChatWallpaper,
  type FontSize,
} from '../contexts/ThemeContext';
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
import type { Language, NotificationType } from '../lib/types';
import type { ThemeColors, ThemeMode } from '../theme';
import { fonts, spacing } from '../theme';

/** تفضيلات الإشعارات لكل نوع — محفوظة محليًا (AsyncStorage) من غير
 *  عمود في القاعدة. القايمة هنا هي أنواع الإشعارات في التطبيق
 *  (lib/types.ts: NotificationType). ملحوظة: التخزين هنا هو نصف
 *  الشغل — منع الإرسال نفسه من الخادم / إخفاؤه من المعالج محتاج
 *  تعديل في services/push.ts (برّه نطاق الملف ده). */
const NOTIF_PREFS_KEY = 'darklink:notif-prefs';
const NOTIF_TYPES: { key: NotificationType; label: string; desc: string }[] = [
  { key: 'new_message', label: 'رسائل جديدة', desc: 'لما حد يبعتلك رسالة' },
  { key: 'voice_note', label: 'رسائل صوتية', desc: 'فويس نوت جديد' },
  { key: 'gift_received', label: 'هدايا مستلمة', desc: 'لما حد يبعتلك هدية' },
  { key: 'purchase_success', label: 'نجاح الشراء', desc: 'تأكيد شراء الجواهر' },
  { key: 'account', label: 'الحساب', desc: 'إشعارات تخص حسابك' },
  { key: 'security', label: 'الأمان', desc: 'تنبيهات أمان مهمة' },
  { key: 'app_update', label: 'تحديثات التطبيق', desc: 'لما ينزل تحديث جديد' },
];

const WALLPAPER_OPTIONS: { key: ChatWallpaper; label: string }[] = [
  { key: 'default', label: 'حسب الثيم (افتراضي)' },
  { key: 'light', label: 'الخلفية الفاتحة' },
  { key: 'dark', label: 'الخلفية الغامقة' },
  { key: 'none', label: 'بدون خلفية (لون سادة)' },
];

const FONT_OPTIONS: { key: FontSize; label: string }[] = [
  { key: 'small', label: 'صغير' },
  { key: 'medium', label: 'متوسط' },
  { key: 'large', label: 'كبير' },
];

function fmtBytes(n: number | null): string {
  if (n === null || n === undefined) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function Settings() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation();
  const { signOut, profile } = useAuth();
  const { mode, setMode, fontSize, setFontSize } = useTheme();
  const [blockedList, setBlockedList] = React.useState<
    { id: string; name: string }[]
  >([]);
  const [lockOn, setLockOn] = React.useState(false);
  const [saverOn, setSaverOn] = React.useState(false);
  const [wallpaper, setWallpaper] = React.useState<ChatWallpaper>('default');
  const [notifPrefs, setNotifPrefs] = React.useState<Record<NotificationType, boolean>>(
    () =>
      Object.fromEntries(NOTIF_TYPES.map((n) => [n.key, true])) as Record<
        NotificationType,
        boolean
      >,
  );
  // التخزين: حجم الكاش (ملفات مؤقتة في Paths.cache) + حجم بيانات
  // AsyncStorage المحلية (تقدير: طول النصوص × 2 بايت تقريبًا).
  const [cacheBytes, setCacheBytes] = React.useState<number | null>(null);
  const [localBytes, setLocalBytes] = React.useState<number | null>(null);
  const [clearingCache, setClearingCache] = React.useState(false);
  const [cacheMsg, setCacheMsg] = React.useState('');

  const refreshStorage = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const pairs = await AsyncStorage.multiGet(keys);
      let total = 0;
      for (const [, v] of pairs) total += (v ?? '').length * 2;
      setLocalBytes(total);
    } catch {
      setLocalBytes(null);
    }
    if (Platform.OS === 'web') {
      setCacheBytes(null);
      return;
    }
    try {
      setCacheBytes(Paths.cache.size);
    } catch {
      setCacheBytes(null);
    }
  };

  React.useEffect(() => {
    (async () => {
      setLockOn(await isLockEnabled());
      setSaverOn(await loadDataSaver());
      setWallpaper(await loadChatWallpaper());
      try {
        const raw = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
        if (raw) {
          const disabled = JSON.parse(raw) as string[];
          if (Array.isArray(disabled)) {
            setNotifPrefs((prev) => {
              const next = { ...prev };
              for (const k of disabled) {
                if (k in next) next[k as NotificationType] = false;
              }
              return next;
            });
          }
        }
      } catch {
        // تجاهل — الافتراضي: الكل شغال
      }
      await refreshStorage();
    })();
  }, []);

  /** مسح الكاش: بيمسح بس محتويات مجلد الكاش بتاع expo-file-system
   *  (Paths.cache) — نسخ وسائط منزّلة وملفات مؤقتة. مبيقربش من:
   *  المسودات (darklink:draft:*)، قائمة انتظار الرسايل (outbox)،
   *  جلسة الدخول، أو أي إعداد (ثيم/لغة/حجم خط/خلفية/إشعارات). */
  const onClearCache = async () => {
    if (Platform.OS === 'web') return;
    setClearingCache(true);
    setCacheMsg('');
    let freed = 0;
    try {
      const entries = Paths.cache.list();
      for (const e of entries) {
        try {
          freed += e.size ?? 0;
          e.delete();
        } catch {
          // ملف مشغول/متمسح — كمّل
        }
      }
    } catch {
      // مجلد الكاش نفسه مش متاح
    }
    setClearingCache(false);
    setCacheMsg(`تم مسح الكاش — اتحرر ${fmtBytes(freed)}`);
    await refreshStorage();
  };

  const onToggleNotif = async (key: NotificationType, v: boolean) => {
    const next = { ...notifPrefs, [key]: v };
    setNotifPrefs(next);
    try {
      const disabled = Object.entries(next)
        .filter(([, on]) => !on)
        .map(([k]) => k);
      await AsyncStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(disabled));
    } catch {
      // تجاهل
    }
  };

  const onPickWallpaper = async (w: ChatWallpaper) => {
    setWallpaper(w);
    await saveChatWallpaper(w);
  };

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
      appAlert(t('referral.bindTitle'), t('referral.bound'));
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

        <View style={styles.sectionRow}>
          <GlassIconChip name="color-palette-outline" size={14} />
          <Text style={[styles.section, { marginTop: 0, marginBottom: 0 }]}>
            {t('settings.appearance')}
          </Text>
        </View>
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

        <View style={styles.sectionRow}>
          <GlassIconChip name="text-outline" size={14} />
          <Text style={[styles.section, { marginTop: 0, marginBottom: 0 }]}>
            حجم الخط
          </Text>
        </View>
        <GlowCard>
          {FONT_OPTIONS.map((f) => (
            <TouchableOpacity
              key={f.key}
              onPress={() => void setFontSize(f.key)}
              style={styles.row}>
              <Text style={{ color: colors.text, fontSize: fonts.sizes.md }}>
                {f.label}
              </Text>
              {fontSize === f.key ? <Text style={{ color: colors.accent }}>✓</Text> : null}
            </TouchableOpacity>
          ))}
        </GlowCard>

        <View style={styles.sectionRow}>
          <GlassIconChip name="image-outline" size={14} />
          <Text style={[styles.section, { marginTop: 0, marginBottom: 0 }]}>
            خلفية الشات
          </Text>
        </View>
        <GlowCard>
          {WALLPAPER_OPTIONS.map((w) => (
            <TouchableOpacity
              key={w.key}
              onPress={() => void onPickWallpaper(w.key)}
              style={styles.row}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                {w.key === 'light' ? (
                  <Image
                    source={require('../assets/chat-bg-light.jpg')}
                    style={styles.wpThumb}
                  />
                ) : w.key === 'dark' ? (
                  <Image
                    source={require('../assets/chat-bg-dark.jpg')}
                    style={styles.wpThumb}
                  />
                ) : w.key === 'none' ? (
                  <View style={[styles.wpThumb, { backgroundColor: colors.surface }]} />
                ) : (
                  <View
                    style={[
                      styles.wpThumb,
                      {
                        backgroundColor:
                          w.key === 'default'
                            ? colors.primary
                            : colors.surface,
                      },
                    ]}
                  />
                )}
                <Text style={{ color: colors.text, fontSize: fonts.sizes.md }}>
                  {w.label}
                </Text>
              </View>
              {wallpaper === w.key ? (
                <Text style={{ color: colors.accent }}>✓</Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </GlowCard>

        <View style={styles.sectionRow}>
          <GlassIconChip name="lock-closed-outline" size={14} />
          <Text style={[styles.section, { marginTop: 0, marginBottom: 0 }]}>
            {t('settings.appLock')}
          </Text>
        </View>
        {/* حشوة أفقية حوالين المفاتيح: المفتاح كان لازق في طرف الكارت
            وبيتقصّ جزئيًا في الثيمين — الحشوة دي بتسيب مسافة أمان. */}
        <GlowCard>
          <View style={styles.toggleWrap}>
            <ToggleRow
              title={t('settings.appLock')}
              desc={t('settings.appLockDesc')}
              value={lockOn}
              onChange={(v) => void onToggleLock(v)}
            />
          </View>
          <View style={styles.toggleWrap}>
            <ToggleRow
              title={t('settings.dataSaver')}
              desc={t('settings.dataSaverDesc')}
              value={saverOn}
              onChange={(v) => void onToggleSaver(v)}
            />
          </View>
        </GlowCard>

        <View style={styles.sectionRow}>
          <GlassIconChip name="notifications-outline" size={14} />
          <Text style={[styles.section, { marginTop: 0, marginBottom: 0 }]}>
            تفضيلات الإشعارات
          </Text>
        </View>
        <GlowCard>
          {NOTIF_TYPES.map((n) => (
            <View key={n.key} style={styles.toggleWrap}>
              <ToggleRow
                title={n.label}
                desc={n.desc}
                value={notifPrefs[n.key]}
                onChange={(v) => void onToggleNotif(n.key, v)}
              />
            </View>
          ))}
        </GlowCard>

        <View style={styles.sectionRow}>
          <GlassIconChip name="folder-outline" size={14} />
          <Text style={[styles.section, { marginTop: 0, marginBottom: 0 }]}>
            التخزين
          </Text>
        </View>
        <GlowCard>
          <View style={styles.row}>
            <Text style={{ color: colors.text, fontSize: fonts.sizes.md }}>
              ملفات مؤقتة (كاش)
            </Text>
            <Text style={{ color: colors.muted, fontSize: fonts.sizes.md }}>
              {Platform.OS === 'web' ? 'المتصفح بيديره' : fmtBytes(cacheBytes)}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={{ color: colors.text, fontSize: fonts.sizes.md }}>
              بيانات محلية (إعدادات + جلسة)
            </Text>
            <Text style={{ color: colors.muted, fontSize: fonts.sizes.md }}>
              {fmtBytes(localBytes)}
            </Text>
          </View>
          <Text style={{ color: colors.muted, fontSize: fonts.sizes.sm, lineHeight: 19 }}>
            مسح الكاش بيمسح بس الملفات المؤقتة (وسائط منزّلة وملفات شغل
            مؤقتة) — مش بيمسح المسودات ولا الرسايل اللي مستنية النت ولا
            جلسة الدخول ولا أي إعداد.
          </Text>
          <View style={{ height: spacing.md }} />
          <NeonButton
            title={clearingCache ? '...' : 'مسح الكاش'}
            variant="ghost"
            disabled={Platform.OS === 'web' || clearingCache}
            onPress={() => void onClearCache()}
          />
          {cacheMsg ? (
            <Text style={{ color: colors.success, fontSize: fonts.sizes.sm, marginTop: spacing.sm }}>
              {cacheMsg}
            </Text>
          ) : null}
        </GlowCard>

        <View style={styles.sectionRow}>
          <GlassIconChip name="gift-outline" size={14} />
          <Text style={[styles.section, { marginTop: 0, marginBottom: 0 }]}>
            {t('referral.bindTitle')}
          </Text>
        </View>
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <GlassIconChip name="key-outline" size={14} />
              <Text style={{ color: colors.text, fontSize: fonts.sizes.md }}>
                {t('settings.changePassword')}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={() => router.push('/legal')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <GlassIconChip name="document-text-outline" size={14} />
              <Text style={{ color: colors.text, fontSize: fonts.sizes.md }}>
                {t('settings.legal')}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={doLogout}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <GlassIconChip name="log-out-outline" size={14} />
              <Text style={{ color: colors.text, fontSize: fonts.sizes.md }}>
                {t('auth.logout')}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={deleteAccount}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <GlassIconChip name="trash-outline" size={14} danger />
              <Text style={{ color: colors.danger, fontSize: fonts.sizes.md }}>
                {t('settings.deleteAccount')}
              </Text>
            </View>
          </TouchableOpacity>
        </GlowCard>

        <View style={styles.sectionRow}>
          <GlassIconChip name="ban-outline" size={14} danger />
          <Text style={[styles.section, { marginTop: 0, marginBottom: 0 }]}>
            {t('settings.blockedUsers')}
          </Text>
        </View>
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
  /** صف عنوان قسم: شريحة أيقونة زجاجية + العنوان */
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  /** حشوة أفقية حوالين صفوف المفاتيح (ToggleRow) — بتمنع المفتاح
   *  من اللزوق في طرف الكارت والقصّ من اليمين في الثيمين. */
  toggleWrap: { paddingHorizontal: spacing.sm },
  wpThumb: { width: 34, height: 52, borderRadius: 6 },
});
