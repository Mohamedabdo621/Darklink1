import React from 'react';
import {
  Directions,
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import { router } from 'expo-router';

// التنقل بين التبويبات الرئيسية بالسحب يمين/شمال (بديل السحب المدمج
// في material-top-tabs — يعمل مع Tabs المدمج في expo-router)
const ORDER = ['home', 'discover', 'chats', 'wallet', 'profile'] as const;

export function TabSwipe({
  current,
  children,
}: {
  current: (typeof ORDER)[number];
  children: React.ReactNode;
}) {
  const idx = ORDER.indexOf(current);
  const go = (dir: 1 | -1) => {
    const next = ORDER[idx + dir];
    if (next) router.push(`/(tabs)/${next}`);
  };
  const flingLeft = Gesture.Fling()
    .direction(Directions.LEFT)
    .runOnJS(true)
    .onEnd(() => go(1));
  const flingRight = Gesture.Fling()
    .direction(Directions.RIGHT)
    .runOnJS(true)
    .onEnd(() => go(-1));
  return (
    <GestureDetector gesture={Gesture.Exclusive(flingLeft, flingRight)}>
      {children}
    </GestureDetector>
  );
}
