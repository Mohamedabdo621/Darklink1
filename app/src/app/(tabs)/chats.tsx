import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import Swipeable, { SwipeDirection, type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedReaction, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { Avatar } from '../../components/Avatar';
import { Logo, Screen } from '../../components/ui';
import { TabSwipe } from '../../components/TabSwipe';
import { useAuth } from '../../contexts/AuthContext';
import { appAlert } from '../../lib/dialog';
import { formatTimeAr } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import type { PublicProfile } from '../../lib/types';
import {
  fetchConversations,
  fetchLastMessage,
  fetchUnreadCount,
  hideConversation,
  toggleConversationFlag,
} from '../../services/chat';
import { avatarSignedUrl } from '../../services/profile';
import { blockUser, fetchPublicProfile } from '../../services/social';
import { fonts, gradients, lightShadowGlowSoft, radius, shadowGlowSoft, spacing } from '../../theme';

import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme';
interface ChatRow {
  conversationId: string;
  other: PublicProfile | null;
  avatar: string | null;
  preview: string;
  time: string;
  unread: number;
  mine: boolean;
  pinned: boolean;
  muted: boolean;
}

/** عرض زر إجراء السحب الواحد — لازم يطابق styles.actionBtn */
const ACTION_WIDTH = 84;
/**
 * السحب الكامل = السحب وصل لحوالي عرض الزر كله (85%). أقل من كده سحب
 * قصير: الصف يفضل مفتوح والزرار باين، والتنفيذ بيكون بالدوسة عليه.
 */
const FULL_SWIPE_THRESHOLD = ACTION_WIDTH * 0.85;

type SwipeRowHandle = {
  peakDrag: SharedValue<number>;
  methods: SwipeableMethods;
};

/**
 * زر سحب واحد — ظهوره مربوط بتقدّم السحب (progress): مخفي تمامًا عند
 * الراحة (progress = 0) فلا يبان من خلال الصف ولا على الجنبين، ويظهر
 * بالتدريج مع انزلاق الصف. ويسجّل أقصى مسافة سحب في peakDrag عشان
 * نميّز السحب الكامل عن السحب القصير عند الإفلات. زر الحذف نفسه شفاف
 * شوية (dangerSoft) زي الأصل — الشفافية على الزر مش على الصف.
 *
 * اتجاهات السحب (مطابقة للسلوك الحي + مصدر المكتبة): السحب يمين يكشف
 * أزرار الشمال، والسحب شمال يكشف أزرار اليمين — فزرار الحظر على
 * الشمال (renderLeftActions) وزرار الحذف على اليمين (renderRightActions).
 */
function SwipeAction({
  progress,
  dragX,
  methods,
  kind,
  item,
  styles,
  colors,
  onPress,
  handles,
}: {
  progress: SharedValue<number>;
  dragX: SharedValue<number>;
  methods: SwipeableMethods;
  kind: 'hide' | 'block';
  item: ChatRow;
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
  onPress: (item: ChatRow) => void;
  handles: { current: Map<string, SwipeRowHandle> };
}) {
  const { t } = useTranslation();
  const peakDrag = useSharedValue(0);
  const fade = useAnimatedStyle(() => ({ opacity: progress.value }));
  useAnimatedReaction(
    () => Math.abs(dragX.value),
    (abs) => {
      if (abs > peakDrag.value) peakDrag.value = abs;
    },
  );
  useEffect(() => {
    const map = handles.current;
    map.set(item.conversationId, { peakDrag, methods });
    return () => {
      if (map.get(item.conversationId)?.peakDrag === peakDrag) {
        map.delete(item.conversationId);
      }
    };
  }, [handles, item.conversationId, methods, peakDrag]);
  const isHide = kind === 'hide';
  return (
    <Animated.View style={[styles.actions, fade]}>
      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: isHide ? colors.dangerSoft : colors.primary }]}
        onPress={() => onPress(item)}>
        <Ionicons
          name={isHide ? 'trash-outline' : 'ban-outline'}
          size={22}
          color={colors.white}
        />
        <Text style={styles.actionLabel}>
          {isHide ? t('chats.hide') : t('userProfile.block')}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function Chats() {
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { profile: me } = useAuth();
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // حالة السحب لكل صف: أقصى مسافة سحب + أدوات التحكم في الصف (للإغلاق)
  // وعلامة إن نافذة تأكيد معروضة + إن السحب بدأ من صف مقفول.
  const swipeHandles = useRef(new Map<string, SwipeRowHandle>());
  const confirmShown = useRef(new Map<string, boolean>());
  const openedFromClosed = useRef(new Map<string, boolean>());

  const previewFor = useCallback(
    (m: Awaited<ReturnType<typeof fetchLastMessage>>): string => {
      if (!m) return '';
      if (m.is_deleted) return t('chats.deleted');
      switch (m.type) {
        case 'voice':
          return t('chats.voiceNote');
        case 'image':
          return t('chats.photo');
        case 'video':
          return t('chats.video');
        case 'gift':
          return t('chats.gift');
        default:
          return m.body ?? '';
      }
    },
    [t],
  );

  const load = useCallback(async () => {
    if (!me) return;
    const convs = await fetchConversations(me.id);
    const built: ChatRow[] = [];
    for (const c of convs) {
      const otherId = c.user_a === me.id ? c.user_b : c.user_a;
      const [other, last, unread] = await Promise.all([
        fetchPublicProfile(otherId),
        fetchLastMessage(c.id),
        fetchUnreadCount(c.id, me.id),
      ]);
      built.push({
        conversationId: c.id,
        other,
        avatar: other ? await avatarSignedUrl(other.avatar_url) : null,
        preview: previewFor(last),
        time: last ? formatTimeAr(last.created_at) : '',
        unread,
        mine: last?.sender_id === me.id,
        pinned: (c.pinned_for ?? []).includes(me.id),
        muted: (c.muted_for ?? []).includes(me.id),
      });
    }
    // المثبتة أولًا مع الحفاظ على ترتيب آخر رسالة داخل كل مجموعة
    built.sort((a, b) => Number(b.pinned) - Number(a.pinned));
    setRows(built);
  }, [me, previewFor]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    if (!me) return;
    // اسم فريد لكل اشتراك — نفس سبب الإصلاح في شاشة الشات (قناة بنفس الاسم
    // ولسه مشتركة بتضرب خطأ عند إعادة الاشتراك)
    const channel = supabase
      .channel(`chats-list-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [me, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const removeRow = (conversationId: string) =>
    setRows((prev) => prev.filter((r) => r.conversationId !== conversationId));

  const onHide = (
    item: ChatRow,
    opts?: { onCancel?: () => void; onDone?: () => void },
  ) => {
    appAlert(t('chats.hide'), t('chats.hideConfirm'), [
      {
        text: t('common.cancel'),
        style: 'cancel',
        onPress: () => {
          opts?.onDone?.();
          opts?.onCancel?.();
        },
      },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          opts?.onDone?.();
          if (await hideConversation(item.conversationId)) {
            removeRow(item.conversationId);
          }
        },
      },
    ]);
  };

  const onBlock = (
    item: ChatRow,
    opts?: { onCancel?: () => void; onDone?: () => void },
  ) => {
    if (!me || !item.other) return;
    appAlert(t('userProfile.block'), item.other.shown_name, [
      {
        text: t('common.cancel'),
        style: 'cancel',
        onPress: () => {
          opts?.onDone?.();
          opts?.onCancel?.();
        },
      },
      {
        text: t('userProfile.block'),
        style: 'destructive',
        onPress: async () => {
          opts?.onDone?.();
          if (await blockUser(me.id, item.other!.id)) {
            await hideConversation(item.conversationId);
            removeRow(item.conversationId);
            appAlert(t('chats.blockedUser'));
          }
        },
      },
    ]);
  };

  // بداية سحبة جديدة = حالة جديدة: تصفير أقصى مسافة + إلغاء علامة التأكيد.
  const resetSwipeGesture = (conversationId: string, fromClosed: boolean) => {
    const handle = swipeHandles.current.get(conversationId);
    if (handle) handle.peakDrag.value = 0;
    confirmShown.current.delete(conversationId);
    openedFromClosed.current.set(conversationId, fromClosed);
  };

  const closeRow = (conversationId: string) => {
    swipeHandles.current.get(conversationId)?.methods.close();
  };

  const handleSwipeClose = (item: ChatRow) => {
    confirmShown.current.delete(item.conversationId);
    openedFromClosed.current.set(item.conversationId, false);
    const handle = swipeHandles.current.get(item.conversationId);
    if (handle) handle.peakDrag.value = 0;
  };

  /**
   * عند الإفلات بعد سحب كامل (من صف مقفول) نسأل نافذة التأكيد المعتادة
   * قبل التنفيذ — مفيش تنفيذ من غير تأكيد. السحب القصير بيفتح الصف بس
   * والتنفيذ بيكون بالدوسة على الزرار. اتجاه RIGHT = السحب يمين = الحظر،
   * وLEFT = السحب شمال = الحذف (حسب مصدر المكتبة والسلوك الحي).
   * ملحوظة: السحب من صف مفتوح أصلًا مبيطلعش نافذة — المسافة المقاسة
   * وقتها بتبدأ من وضع الصف المفتوح فمش مقياس للسحبة الجديدة؛ في الحالة
   * دي الدوسة على الزرار هي طريق التنفيذ.
   */
  const handleSwipeWillOpen = (item: ChatRow, direction: SwipeDirection) => {
    if (!openedFromClosed.current.get(item.conversationId)) return;
    if (confirmShown.current.get(item.conversationId)) return;
    const peak = swipeHandles.current.get(item.conversationId)?.peakDrag.value ?? 0;
    if (peak < FULL_SWIPE_THRESHOLD) return;
    confirmShown.current.set(item.conversationId, true);
    const clearFlag = () => confirmShown.current.delete(item.conversationId);
    const cancel = () => closeRow(item.conversationId);
    if (direction === SwipeDirection.RIGHT) {
      onBlock(item, { onCancel: cancel, onDone: clearFlag });
    } else {
      onHide(item, { onCancel: cancel, onDone: clearFlag });
    }
  };

  const onToggleFlag = async (
    item: ChatRow,
    flag: 'pinned_for' | 'muted_for',
  ) => {
    if (await toggleConversationFlag(item.conversationId, flag)) {
      setRows((prev) => {
        const next = prev.map((r) =>
          r.conversationId === item.conversationId
            ? {
                ...r,
                pinned: flag === 'pinned_for' ? !r.pinned : r.pinned,
                muted: flag === 'muted_for' ? !r.muted : r.muted,
              }
            : r,
        );
        next.sort((a, b) => Number(b.pinned) - Number(a.pinned));
        return next;
      });
    }
  };

  const onMenu = () => {
    appAlert('', undefined, [
      { text: t('home.settings'), onPress: () => router.push('/settings') },
      { text: t('tabs.profile'), onPress: () => router.push('/(tabs)/profile') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const onRowLongPress = (item: ChatRow) => {
    appAlert(item.other?.shown_name ?? '', undefined, [
      {
        text: item.pinned ? `📌 ${t('chats.unpin')}` : `📌 ${t('chats.pin')}`,
        onPress: () => onToggleFlag(item, 'pinned_for'),
      },
      {
        text: item.muted ? `🔔 ${t('chats.unmute')}` : `🔇 ${t('chats.mute')}`,
        onPress: () => onToggleFlag(item, 'muted_for'),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  return (
    <TabSwipe current="chats">
      <Screen>
      {/* هيدر زجاجي زي الصورة المرجعية: بيت + DARKLINK + بحث + ⋮ */}
      <View style={styles.headerPill}>
        <BlurView
          intensity={resolved === 'light' ? 20 : 32}
          tint={resolved === 'light' ? 'light' : 'dark'}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <TouchableOpacity onPress={() => router.push('/(tabs)/home')} hitSlop={8}>
          <Ionicons name="home-outline" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Logo size={18} />
        </View>
        <TouchableOpacity onPress={() => router.push('/(tabs)/discover')} hitSlop={8}>
          <Ionicons name="search-outline" size={22} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onMenu} hitSlop={8}>
          <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.conversationId}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={<Text style={styles.empty}>{t('chats.empty')}</Text>}
        renderItem={({ item }) => (
          <Swipeable
            friction={2}
            leftThreshold={40}
            rightThreshold={40}
            overshootLeft={false}
            overshootRight={false}
            onSwipeableOpenStartDrag={() => resetSwipeGesture(item.conversationId, true)}
            onSwipeableCloseStartDrag={() => resetSwipeGesture(item.conversationId, false)}
            onSwipeableWillOpen={(direction) => handleSwipeWillOpen(item, direction)}
            onSwipeableClose={() => handleSwipeClose(item)}
            renderLeftActions={(progress, dragX, methods) => (
              <SwipeAction
                progress={progress}
                dragX={dragX}
                methods={methods}
                kind="block"
                item={item}
                styles={styles}
                colors={colors}
                onPress={onBlock}
                handles={swipeHandles}
              />
            )}
            renderRightActions={(progress, dragX, methods) => (
              <SwipeAction
                progress={progress}
                dragX={dragX}
                methods={methods}
                kind="hide"
                item={item}
                styles={styles}
                colors={colors}
                onPress={onHide}
                handles={swipeHandles}
              />
            )}>
      <TouchableOpacity
        style={[
          styles.row,
          resolved === 'light' ? lightShadowGlowSoft : shadowGlowSoft,
        ]}
        onLongPress={() => onRowLongPress(item)}
        onPress={() =>
          router.push({ pathname: '/chat/[id]', params: { id: item.conversationId } })
        }>
        <View style={{ alignItems: 'flex-end', gap: 5 }}>
          <Text style={styles.time}>{item.time}</Text>
          {item.unread > 0 ? (
            <LinearGradient
              colors={[...gradients.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.badge}>
              <Text style={styles.badgeText}>{item.unread}</Text>
            </LinearGradient>
          ) : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {item.other?.shown_name ?? '—'}
            {item.other?.is_vip ? ' 👑' : ''}
            {item.pinned ? ' 📌' : ''}
            {item.muted ? ' 🔇' : ''}
          </Text>
          <Text
            style={[styles.preview, !item.preview && styles.previewEmpty]}
            numberOfLines={1}>
            {item.mine && item.preview ? t('chats.you') : ''}
            {item.preview || t('chats.noMessages')}
          </Text>
        </View>
        <Avatar uri={item.avatar} name={item.other?.shown_name} size={56} />
        <Ionicons name="chevron-back" size={20} color={colors.muted} />
      </TouchableOpacity>
          </Swipeable>
        )}
      />
    </Screen>
    </TabSwipe>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  /** هيدر زجاجي مستدير زي الصورة المرجعية */
  headerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginVertical: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.glassBorderStrong,
    backgroundColor: colors.tabBar,
    overflow: 'hidden',
  },
  title: {
    color: colors.text,
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.bold,
    marginVertical: spacing.md,
  },
  empty: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.xxl,
    fontSize: fonts.sizes.md,
    lineHeight: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    marginVertical: 6,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glassBorderStrong,
    // معتم تمامًا — لو شفاف زراير السحب الحمراء اللي وراه تبان من خلاله
    backgroundColor: colors.surface,
  },
  actions: {
    flexDirection: 'row',
    marginVertical: 4,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  actionBtn: {
    width: 84,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: spacing.sm,
  },
  actionLabel: {
    color: colors.white,
    fontSize: fonts.sizes.xs,
    fontWeight: fonts.weights.bold,
    textAlign: 'center',
  },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: {
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { color: colors.text, fontSize: fonts.sizes.md, fontWeight: fonts.weights.bold },
  preview: { color: colors.muted, fontSize: fonts.sizes.sm, marginTop: 2 },
  previewEmpty: { color: colors.faint },
  time: { color: colors.muted, fontSize: fonts.sizes.xs },
  badge: {
    borderRadius: radius.full,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: colors.white, fontSize: fonts.sizes.xs, fontWeight: '700' },
});
