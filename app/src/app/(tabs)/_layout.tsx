import React, { forwardRef, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { Tabs, TabList, TabTrigger, TabSlot } from 'expo-router/ui';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useAuth, getCachedProfile } from '../../contexts/AuthContext';
import { NeonButton } from '../../components/ui';
import { fonts, gradients, radius, spacing } from '../../theme';

import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme';
// شريط تبويبات سفلي زجاجي بأيقونات خطية متوهجة (ستايل Muse)
// (مبني على Tabs المدمج في expo-router/ui — بديل material-top-tabs الذي كان
// يفشل عند التسجيل: Couldn't register the navigator)
const TABS = [
  { name: 'home', href: '/(tabs)/home', icon: 'home-outline', iconFocused: 'home', labelKey: 'tabs.home' },
  { name: 'timeline', href: '/(tabs)/timeline', icon: 'newspaper-outline', iconFocused: 'newspaper', labelKey: 'tabs.timeline' },
  { name: 'discover', href: '/(tabs)/discover', icon: 'compass-outline', iconFocused: 'compass', labelKey: 'tabs.discover' },
  { name: 'chats', href: '/(tabs)/chats', icon: 'chatbubbles-outline', iconFocused: 'chatbubbles', labelKey: 'tabs.chats' },
  { name: 'wallet', href: '/(tabs)/wallet', icon: 'diamond-outline', iconFocused: 'diamond', labelKey: 'tabs.wallet' },
  { name: 'profile', href: '/(tabs)/profile', icon: 'person-outline', iconFocused: 'person', labelKey: 'tabs.profile' },
] as const;

const TabButton = forwardRef<
  any,
  TabTriggerSlotProps & { icon: string; iconFocused: string; label: string }
>(function TabButton({ icon, iconFocused, label, isFocused, ...props }, ref) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      ref={ref}
      {...props}
      onPress={(e) => {
        Haptics.selectionAsync().catch(() => {});
        props.onPress?.(e);
      }}
      style={styles.tab}>
      {isFocused ? (
        <LinearGradient
          colors={[...gradients.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.activeIcon}>
          <Ionicons name={iconFocused as never} size={22} color="#ffffff" />
        </LinearGradient>
      ) : (
        <Ionicons name={icon as never} size={24} color={colors.muted} />
      )}
      <Text
        style={[
          styles.label,
          { color: isFocused ? colors.primaryBright : colors.muted },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
});

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { session, profile, loading, profileError, refreshProfile, signOut } =
    useAuth();
  // مسافة أمان سفلية على الموبايل — الشريط كان قاعد على حافة الشاشة
  // وبيتداخل مع شريط إيماءات أندرويد.
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => makeStyles(colors, Platform.OS === 'web' ? 0 : insets.bottom),
    [colors, insets.bottom],
  );
  // تاريخ الميلاد المحفوظ محليًا من آخر جلب ناجح — احتياطي للبوابة
  // (نفس المنطق في src/app/index.tsx): لو الجلب الحالي فشل/اتأخر
  // والنسخة المحفوظة فيها تاريخ ميلاد، مفيش تحويل لصفحة إكمال البيانات.
  const [cachedBirthdate, setCachedBirthdate] = useState<string | null>(null);
  const [cacheReady, setCacheReady] = useState(false);

  useEffect(() => {
    let live = true;
    getCachedProfile().then((p) => {
      if (!live) return;
      setCachedBirthdate(p?.birthdate ?? null);
      setCacheReady(true);
    });
    return () => {
      live = false;
    };
  }, []);
  // الجلب فشل (شبكة/قاعدة) — شاشة إعادة محاولة بدل التحويل لصفحة
  // إكمال البيانات (بتغطي كمان الدخول من لينك تأكيد الإيميل).
  if (!loading && session && profileError) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          paddingHorizontal: 24,
        }}>
        <Text
          style={{ color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>
          تعذّر تحميل ملفك
        </Text>
        <Text style={{ color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
          اتأكد من النت وحاول تاني
        </Text>
        <NeonButton title="حاول تاني" onPress={() => void refreshProfile()} />
        <Pressable onPress={() => void signOut()} style={{ paddingVertical: 12 }}>
          <Text style={{ color: colors.faint, fontSize: 14 }}>تسجيل خروج</Text>
        </Pressable>
      </View>
    );
  }
  // ملفه ناقص تاريخ الميلاد → صفحة إكمال البيانات (بتغطي كمان الدخول من لينك تأكيد الإيميل)
  // — بس لما الجلب يكون نجح (profile موجود من غير birthdate، أو مفيش صف من غير خطأ)،
  // ولو النسخة المحفوظة محليًا فيها تاريخ ميلاد، مفيش تحويل أصلًا.
  if (!loading && cacheReady && session && !profile?.birthdate && !cachedBirthdate) {
    return <Redirect href="/complete-profile" />;
  }
  return (
    <Tabs>
      <TabSlot />
      <TabList style={styles.bar}>
        {TABS.map((tab) => (
          <TabTrigger
            key={tab.name}
            name={tab.name}
            href={tab.href}
            asChild>
            <TabButton
              icon={tab.icon}
              iconFocused={tab.iconFocused}
              label={t(tab.labelKey)}
            />
          </TabTrigger>
        ))}
      </TabList>
    </Tabs>
  );
}

const makeStyles = (colors: ThemeColors, bottomInset = 0) => StyleSheet.create({
  /** شريط زجاجي مستدير عايم — زي الصورة المرجعية */
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.tabBar,
    borderWidth: 1,
    borderColor: colors.glassBorderStrong,
    borderRadius: radius.full,
    marginHorizontal: spacing.md,
    // على الموبايل: الشريط بيعوم فوق شريط إيماءات أندرويد بمسافة
    // الأمان السفلية؛ على الويب الـ inset صفر وبيفضل زي ما هو.
    marginBottom: spacing.sm + bottomInset,
    height: 62,
    paddingBottom: 8,
    paddingTop: 6,
    // على الويب: الشريط لازم يبقى مثبّت في أسفل الشاشة — من غيره
    // بيتقص تحت في المحفظة وبيختفي مع السكرول في المتجر (الصفحة
    // نفسها هي اللي بتسكرول، مش الـ TabSlot). على الموبايل بيفضل
    // في التدفق الطبيعي زي ما هو.
    ...(Platform.OS === 'web'
      ? ({
          position: 'fixed',
          left: spacing.md,
          right: spacing.md,
          bottom: spacing.sm,
          marginHorizontal: 0,
          marginBottom: 0,
          zIndex: 10,
        } as unknown as ViewStyle)
      : {}),
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: fonts.sizes.xs, fontWeight: fonts.weights.medium },
  // الأيقونة النشطة: كبسولة بتدرج السلسلة البنفسجي + توهج — هوية التطبيق
  activeIcon: {
    borderRadius: 999,
    padding: 7,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 5,
  },
});
