import React, { forwardRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs, TabList, TabTrigger, TabSlot } from 'expo-router/ui';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { colors, fonts } from '../../theme';

// شريط تبويبات سفلي بستايل التطبيق + التنقل بين التبويبات بالسحب
// (مبني على Tabs المدمج في expo-router/ui — بديل material-top-tabs الذي كان
// يفشل عند التسجيل: Couldn't register the navigator)
const TABS = [
  { name: 'home', href: '/(tabs)/home', icon: '🏠', labelKey: 'tabs.home' },
  { name: 'discover', href: '/(tabs)/discover', icon: '🔮', labelKey: 'tabs.discover' },
  { name: 'chats', href: '/(tabs)/chats', icon: '💬', labelKey: 'tabs.chats' },
  { name: 'wallet', href: '/(tabs)/wallet', icon: '💎', labelKey: 'tabs.wallet' },
  { name: 'profile', href: '/(tabs)/profile', icon: '👤', labelKey: 'tabs.profile' },
] as const;

const TabButton = forwardRef<
  any,
  TabTriggerSlotProps & { icon: string; label: string }
>(function TabButton({ icon, label, isFocused, ...props }, ref) {
  return (
    <Pressable
      ref={ref}
      {...props}
      onPress={(e) => {
        Haptics.selectionAsync().catch(() => {});
        props.onPress?.(e);
      }}
      style={styles.tab}>
      <Text style={{ fontSize: 21, opacity: isFocused ? 1 : 0.45 }}>{icon}</Text>
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
            <TabButton icon={tab.icon} label={t(tab.labelKey)} />
          </TabTrigger>
        ))}
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#0d0218',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.stroke,
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
  },
});
