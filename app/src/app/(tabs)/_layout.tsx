import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import type { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { withLayoutContext } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { colors, fonts } from '../../theme';

// تبويبات قابلة للسحب جانبيًا (زي واتساب) مع شريط سفلي بستايل التطبيق
const { Navigator } = createMaterialTopTabNavigator();
const SwipeTabs = withLayoutContext(Navigator);

const ICONS: Record<string, string> = {
  home: '🏠',
  discover: '🔮',
  chats: '💬',
  wallet: '💎',
  profile: '👤',
};

function BottomTabBar({ state, navigation, descriptors }: MaterialTopTabBarProps) {
  return (
    <View style={styles.bar}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const label = descriptors[route.key]?.options.title ?? route.name;
        return (
          <Pressable
            key={route.key}
            style={styles.tab}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}>
            <Text style={{ fontSize: 21, opacity: focused ? 1 : 0.45 }}>
              {ICONS[route.name] ?? '•'}
            </Text>
            <Text
              style={[
                styles.label,
                { color: focused ? colors.primaryBright : colors.faint },
              ]}>
              {label}
            </Text>
            {focused ? <View style={styles.dot} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <SwipeTabs
      tabBarPosition="bottom"
      tabBar={(props: MaterialTopTabBarProps) => <BottomTabBar {...props} />}
      screenOptions={{
        swipeEnabled: true,
        lazy: true,
        animationEnabled: true,
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <SwipeTabs.Screen name="home" options={{ title: t('tabs.home') }} />
      <SwipeTabs.Screen name="discover" options={{ title: t('tabs.discover') }} />
      <SwipeTabs.Screen name="chats" options={{ title: t('tabs.chats') }} />
      <SwipeTabs.Screen name="wallet" options={{ title: t('tabs.wallet') }} />
      <SwipeTabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </SwipeTabs>
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
