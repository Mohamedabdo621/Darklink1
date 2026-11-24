import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Chip, NeonInput, Screen } from '../../components/ui';
import type { PublicProfile } from '../../lib/types';
import { avatarSignedUrl } from '../../services/profile';
import { fetchDiscover, fetchPublicProfile } from '../../services/social';
import { colors, fonts, radius, spacing } from '../../theme';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function Discover() {
  const { t } = useTranslation();
  const [items, setItems] = useState<PublicProfile[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [ended, setEnded] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (p: number, s: string, replace: boolean) => {
    setLoading(true);
    const rows = await fetchDiscover(p, s);
    setLoading(false);
    setEnded(rows.length < 20);
    setItems((prev) => (replace ? rows : [...prev, ...rows]));
    setPage(p);
  }, []);

  useEffect(() => {
    // تحميل أول صفحة عند فتح الشاشة (نمط جلب بيانات قياسي)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(0, '', true);
  }, [load]);

  const onSearch = (v: string) => {
    setSearch(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      const term = v.trim();
      if (UUID_RE.test(term)) {
        // بحث بالمعرف الدقيق: يعمل حتى لمن أوقف الظهور في الاكتشاف
        const one = await fetchPublicProfile(term);
        setItems(one ? [one] : []);
        setEnded(true);
        return;
      }
      load(0, term, true);
    }, 400);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load(0, search, true);
    setRefreshing(false);
  };

  return (
    <Screen>
      <Text style={styles.title}>{t('discover.title')}</Text>
      <NeonInput
        value={search}
        onChangeText={onSearch}
        placeholder={t('discover.searchPlaceholder')}
        autoCapitalize="none"
      />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: spacing.md }}
        contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={() => {
          if (!loading && !ended) load(page + 1, search, false);
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={() =>
          !loading ? <Text style={styles.empty}>{t('discover.noResults')}</Text> : null
        }
        ListFooterComponent={() =>
          loading ? (
            <ActivityIndicator color={colors.primary} style={{ margin: spacing.md }} />
          ) : ended && items.length > 0 ? (
            <Text style={styles.empty}>{t('discover.endOfResults')}</Text>
          ) : null
        }
        renderItem={({ item }) => <DiscoverCard item={item} />}
      />
    </Screen>
  );
}

function DiscoverCard({ item }: { item: PublicProfile }) {
  const { t } = useTranslation();
  const [avatar, setAvatar] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    avatarSignedUrl(item.avatar_url).then((u) => {
      if (live) setAvatar(u);
    });
    return () => {
      live = false;
    };
  }, [item.avatar_url]);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.id } })}>
      {avatar ? (
        <Image source={{ uri: avatar }} style={styles.cardAvatar} />
      ) : (
        <View style={[styles.cardAvatar, styles.avatarFallback]}>
          <Text style={{ fontSize: 30 }}>👤</Text>
        </View>
      )}
      <Text style={styles.cardName} numberOfLines={1}>
        {item.shown_name}
      </Text>
      <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Chip
          label={
            item.identity_mode === 'anonymous'
              ? `🕶 ${t('common.anonymous')}`
              : `🌐 ${t('common.public')}`
          }
        />
        {item.is_vip ? <Chip label="👑 VIP" gold /> : null}
      </View>
      {item.bio ? (
        <Text style={styles.cardBio} numberOfLines={2}>
          {item.bio}
        </Text>
      ) : null}
    </TouchableOpacity>
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
    marginTop: spacing.xl,
    fontSize: fonts.sizes.md,
  },
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: 6,
  },
  cardAvatar: { width: 72, height: 72, borderRadius: 36 },
  avatarFallback: {
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: fonts.weights.bold,
    textAlign: 'center',
  },
  cardBio: { color: colors.muted, fontSize: fonts.sizes.xs, textAlign: 'center' },
});
