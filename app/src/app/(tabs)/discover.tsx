import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Chip, NeonInput, Screen } from '../../components/ui';
import { Avatar } from '../../components/Avatar';
import { TabSwipe } from '../../components/TabSwipe';
import { INTEREST_KEYS } from '../../lib/interests';
import type { PublicProfile } from '../../lib/types';
import { avatarSignedUrl } from '../../services/profile';
import { fetchDiscover, fetchPublicProfile } from '../../services/social';
import { fonts, radius, spacing } from '../../theme';

import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function Discover() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const [items, setItems] = useState<PublicProfile[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [ended, setEnded] = useState(false);
  const [interest, setInterest] = useState<string | null>(null);
  const interestRef = useRef<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (p: number, s: string, replace: boolean) => {
    setLoading(true);
    const rows = await fetchDiscover(p, s, interestRef.current);
    setLoading(false);
    setEnded(rows.length < 20);
    setItems((prev) => (replace ? rows : [...prev, ...rows]));
    setPage(p);
  }, []);

  const pickInterest = (k: string | null) => {
    setInterest(k);
    interestRef.current = k;
    load(0, search, true);
  };

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
    <TabSwipe current="discover">
      <Screen>
      <Text style={styles.title}>{t('discover.title')}</Text>
      <NeonInput
        value={search}
        onChangeText={onSearch}
        placeholder={t('discover.searchPlaceholder')}
        autoCapitalize="none"
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: spacing.md, flexGrow: 0 }}
        contentContainerStyle={{ gap: spacing.sm }}>
        <TouchableOpacity
          onPress={() => pickInterest(null)}
          style={[styles.filterChip, !interest && styles.filterChipActive]}>
          <Text style={[styles.filterText, !interest && { color: colors.white }]}>
            {t('interests.all')}
          </Text>
        </TouchableOpacity>
        {INTEREST_KEYS.map((k) => (
          <TouchableOpacity
            key={k}
            onPress={() => pickInterest(interest === k ? null : k)}
            style={[styles.filterChip, interest === k && styles.filterChipActive]}>
            <Text
              style={[
                styles.filterText,
                interest === k && { color: colors.white },
              ]}>
              {t(`interests.${k}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
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
    </TabSwipe>
  );
}

function DiscoverCard({ item }: { item: PublicProfile }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
      <Avatar uri={avatar} name={item.shown_name} size={72} />
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

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  filterChip: {
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.muted, fontSize: fonts.sizes.sm, fontWeight: fonts.weights.medium },
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
