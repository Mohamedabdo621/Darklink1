import React, { forwardRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs, TabList, TabTrigger, TabSlot } from 'expo-router/ui';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { colors, fonts } from '../../theme';

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
  return (
    <Pressable
      ref={ref}
      {...props}
      onPress={(e) => {
        Haptics.selectionAsync().catch(() => {});
        props.onPress?.(e);
      }}
      style={styles.tab}>
      <Ionicons
        name={(isFocused ? iconFocused : icon) as never}
        size={24}
        color={isFocused ? colors.accent : colors.faint}
        style={
          isFocused
            ? { textShadowColor: 'rgba(232,121,249,0.8)', textShadowRadius: 10 }
            : undefined
        }
      />
      <Text
        style={[
          styles.label,
          { color: isFocused ? colors.primaryBright : colors.faint },
        ]}>
        {label}
      </Text>
      {isFocused ? <View style={styles.dot} /> : null}
    </Pressable>
  );
});

export default function TabsLayout() {
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

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(13, 2, 24, 0.88)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.glassBorder,
    height: 62,
    paddingBottom: 8,
    paddingTop: 6,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: fonts.sizes.xs, fontWeight: fonts.weights.medium },
  dot: {
    position: 'absolute',
    top: -6,
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
});
