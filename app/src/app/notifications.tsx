import React, { useCallback, useEffect } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { AppNotification } from '../lib/types';
import { registerPushToken, requestNotificationPermission } from '../services/push';
import { fetchNotifications, markAllNotificationsRead } from '../services/wallet';
import { colors, fonts, spacing } from '../theme';

const ICONS: Record<AppNotification['type'], string> = {
  new_message: '💬',
  voice_note: '🎤',
  gift_received: '🎁',
  purchase_success: '💎',
  account: '👤',
  security: '🛡',
  app_update: '✨',
};

export default function Notifications() {
  const { t } = useTranslation();
  const { profile: me } = useAuth();
  const [items, setItems] = React.useState<AppNotification[]>([]);

  const load = useCallback(async () => {
    if (!me) return;
    setItems(await fetchNotifications(me.id));
  }, [me]);

  useEffect(() => {
    // تحميل الإشعارات عند الفتح (نمط جلب بيانات قياسي)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    if (!me) return;
    // اسم فريد لكل اشتراك — نفس سبب الإصلاح في شاشة الشات
    const channel = supabase
      .channel(`notifications-live-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${me.id}`,
        },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [me, load]);

  useEffect(() => {
    // عند مغادرة الشاشة تُعلّم الكل كمقروء
    return () => {
      if (me) markAllNotificationsRead(me.id);
    };
  }, [me]);

  const textFor = (n: AppNotification): string => {
    // إشعارات الحساب بأنواع فرعية (دفع/تبادل/دعوات/مسابقة/إدارة)
    if (n.type === 'account' && typeof n.payload.kind === 'string') {
      const kind = n.payload.kind as string;
      if (kind === 'payment_rejected') {
        return t('notifications.paymentRejected', {
          reason: String(n.payload.reason ?? ''),
        });
      }
      if (kind === 'payment_order') return t('notifications.paymentOrder');
      if (kind === 'transfer_received') {
        return t('notifications.transferReceived', {
          amount: Number(n.payload.amount ?? 0),
        });
      }
      if (kind === 'referral_reward') {
        return t('notifications.referralReward', {
          amount: Number(n.payload.amount ?? 0),
        });
      }
      if (kind === 'referral_welcome') {
        return t('notifications.referralWelcome', {
          amount: Number(n.payload.amount ?? 0),
        });
      }
      if (kind === 'post_like') {
        return t('notifications.postLike');
      }
      if (kind === 'post_comment') {
        return t('notifications.postComment');
      }
      if (kind === 'contest_win') {
        return t('notifications.contestWin', {
          amount: Number(n.payload.amount ?? 0),
        });
      }
      if (kind === 'admin_grant') {
        return t('notifications.adminGrant', {
          amount: Number(n.payload.amount ?? 0),
        });
      }
    }
    switch (n.type) {
      case 'gift_received':
        return t('notifications.giftReceived', {
          gift: t(`gifts.${String(n.payload.gift ?? '')}`, { defaultValue: '🎁' }),
        });
      case 'purchase_success':
        return t('notifications.purchaseSuccess', {
          gems: Number(n.payload.gems ?? 0),
        });
      case 'voice_note':
        return t('notifications.voiceNote');
      case 'new_message':
        return t('notifications.newMessage');
      case 'security':
        return t('notifications.security');
      case 'app_update':
        return t('notifications.appUpdate');
      default:
        return t('notifications.account');
    }
  };

  const open = (n: AppNotification) => {
    const cid = n.payload.conversation_id;
    if ((n.type === 'new_message' || n.type === 'voice_note') && typeof cid === 'string') {
      router.push({ pathname: '/chat/[id]', params: { id: cid } });
    }
    const pid = n.payload.post_id;
    if (
      n.type === 'account' &&
      typeof n.payload.kind === 'string' &&
      (n.payload.kind === 'post_like' || n.payload.kind === 'post_comment') &&
      typeof pid === 'string'
    ) {
      router.push({ pathname: '/post/[id]', params: { id: pid } });
    }
  };

  return (
    <Screen>
      <Text style={styles.title}>{t('notifications.title')}</Text>
      <TouchableOpacity
        style={styles.enableBtn}
        onPress={async () => {
          const ok = await requestNotificationPermission();
          if (ok && me) await registerPushToken(me.id);
        }}>
        <Text style={styles.enableBtnText}>🔔 {t('notifications.enablePush')}</Text>
      </TouchableOpacity>
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        ListEmptyComponent={() => (
          <Text style={styles.empty}>{t('notifications.empty')}</Text>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => open(item)}>
            <Text style={{ fontSize: 24 }}>{ICONS[item.type]}</Text>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: fonts.sizes.md,
                  fontWeight: item.is_read ? '400' : '700',
                }}>
                {textFor(item)}
              </Text>
              <Text style={{ color: colors.faint, fontSize: fonts.sizes.xs }}>
                {new Date(item.created_at).toLocaleString()}
              </Text>
            </View>
            {!item.is_read ? <View style={styles.dot} /> : null}
          </TouchableOpacity>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  enableBtn: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  enableBtnText: { color: colors.text, fontWeight: '700', fontSize: fonts.sizes.sm },
  title: {
    color: colors.text,
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.bold,
    marginVertical: spacing.md,
  },
  empty: { color: colors.muted, textAlign: 'center', marginTop: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.stroke,
  },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent },
});
