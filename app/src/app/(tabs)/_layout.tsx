import React, { forwardRef, useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Tabs, TabList, TabTrigger, TabSlot } from 'expo-router/ui';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { fonts, gradients, radius, spacing } from '../../theme';

import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme';
// شريط تبويبات سفلي زجاجي بأيقونات خطية متوهجة (ستايل Muse)
// (مبني على Tabs المدمج في expo-router/ui — بديل material-top-tabs الذي كان
// يفشل عند التسجيل: Couldn't register the navigator)
const TABS = [
  { name: 'home', href: '/(tabs)/home', icon: 'home-outline', iconFocused: 'home', labelKey: 'tabs.home' },
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
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
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

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  /** شريط زجاجي مستدير عايم — زي الصورة المرجعية */
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.tabBar,
    borderWidth: 1,
    borderColor: colors.glassBorderStrong,
    borderRadius: radius.full,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    height: 62,
    paddingBottom: 8,
    paddingTop: 6,
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
