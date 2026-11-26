import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Screen } from '../../components/ui';
import { TabSwipe } from '../../components/TabSwipe';
import { useAuth } from '../../contexts/AuthContext';
import { appAlert } from '../../lib/dialog';
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
import { colors, fonts, radius, spacing } from '../../theme';

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

export default function Chats() {
  const { t } = useTranslation();
  const { profile: me } = useAuth();
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

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
        time: last
          ? new Date(last.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '',
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

  const onHide = (item: ChatRow) => {
    appAlert(t('chats.hide'), t('chats.hideConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          if (await hideConversation(item.conversationId)) {
            removeRow(item.conversationId);
          }
        },
      },
    ]);
  };

  const onBlock = (item: ChatRow) => {
    if (!me || !item.other) return;
    appAlert(t('userProfile.block'), item.other.shown_name, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('userProfile.block'),
        style: 'destructive',
        onPress: async () => {
          if (await blockUser(me.id, item.other!.id)) {
            await hideConversation(item.conversationId);
            removeRow(item.conversationId);
            appAlert('🚫', t('chats.blockedUser'));
          }
        },
      },
    ]);
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

  const renderActions = (item: ChatRow) => (
    <View style={styles.actions}>
      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: colors.danger }]}
        onPress={() => onHide(item)}>
        <Text style={styles.actionIcon}>🗑</Text>
        <Text style={styles.actionLabel}>{t('chats.hide')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: colors.surfaceLight }]}
        onPress={() => onBlock(item)}>
        <Text style={styles.actionIcon}>🚫</Text>
        <Text style={styles.actionLabel}>{t('userProfile.block')}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <TabSwipe current="chats">
      <Screen>
      <Text style={styles.title}>{t('chats.title')}</Text>
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
            renderLeftActions={() => renderActions(item)}
            renderRightActions={() => renderActions(item)}>
          <TouchableOpacity
            style={styles.row}
            onLongPress={() => onRowLongPress(item)}
            onPress={() =>
              router.push({ pathname: '/chat/[id]', params: { id: item.conversationId } })
            }>
            {item.avatar ? (
              <Image source={{ uri: item.avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={{ fontSize: 20 }}>👤</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {item.other?.shown_name ?? '—'}
                {item.other?.is_vip ? ' 👑' : ''}
                {item.pinned ? ' 📌' : ''}
                {item.muted ? ' 🔇' : ''}
              </Text>
              <Text style={styles.preview} numberOfLines={1}>
                {item.mine && item.preview ? t('chats.you') : ''}
                {item.preview}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 5 }}>
              <Text style={styles.time}>{item.time}</Text>
              {item.unread > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.unread}</Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
          </Swipeable>
        )}
      />
    </Screen>
    </TabSwipe>
  );
}

const styles = StyleSheet.create({
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
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.stroke,
    backgroundColor: colors.bg,
  },
  actions: { flexDirection: 'row' },
  actionBtn: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: spacing.sm,
  },
  actionIcon: { fontSize: 19 },
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
  time: { color: colors.faint, fontSize: fonts.sizes.xs },
  badge: {
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: colors.white, fontSize: fonts.sizes.xs, fontWeight: '700' },
});
