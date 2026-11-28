import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { GlowCard, NeonButton, Screen } from '../components/ui';
import { GlassIconChip, type GlassIconName } from '../components/GlassIconButton';
import { useAuth } from '../contexts/AuthContext';
import { appAlert, appPrompt } from '../lib/dialog';
import {
  awardContest,
  createPromo,
  deleteAdminAiKb,
  fetchAdminAiKb,
  fetchAdminAiStats,
  fetchAdminConfig,
  fetchAdminOrders,
  fetchAdminPostReports,
  fetchAdminPromos,
  fetchAdminReferrals,
  fetchAdminReports,
  fetchAdminStats,
  grantGems,
  proofSignedUrl,
  reviewPayment,
  searchAdminUsers,
  setAdminConfig,
  setPromoActive,
  setReportStatus,
  setSuspended,
  upsertAdminAiKb,
  type AdminAiStats,
  type AdminReport,
  type AdminStats,
  type AdminUser,
  type AiKbRow,
  type PaymentOrder,
  type PromoCode,
} from '../services/admin';
import { deletePost } from '../services/timeline';
import { fetchRecentErrors, type ErrorLogRow } from '../services/errorLog';
import type { PostReportRow, ReferralRow } from '../lib/types';
import { fonts, radius, spacing } from '../theme';

import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme';
type Section = 'overview' | 'orders' | 'users' | 'reports' | 'referrals' | 'postReports' | 'promos' | 'settings' | 'errors' | 'ai';

const CONFIG_FIELDS: { key: string; labelKey: string; numeric?: boolean }[] = [
  { key: 'vodafone_cash_number', labelKey: 'admin.cfgVodafone' },
  { key: 'etisalat_cash_number', labelKey: 'admin.cfgEtisalat' },
  { key: 'manual_bonus_pct', labelKey: 'admin.cfgBonusPct', numeric: true },
  { key: 'transfer_daily_cap', labelKey: 'admin.cfgTransferCap', numeric: true },
  { key: 'referral_inviter_reward', labelKey: 'admin.cfgReferralInviter', numeric: true },
  { key: 'referral_welcome_reward', labelKey: 'admin.cfgReferralWelcome', numeric: true },
  { key: 'referral_daily_cap', labelKey: 'admin.cfgReferralCap', numeric: true },
  { key: 'contest_prize_gems', labelKey: 'admin.cfgContestPrize', numeric: true },
  { key: 'vip_silver_price', labelKey: 'admin.cfgVipSilver', numeric: true },
  { key: 'vip_price_gems', labelKey: 'admin.cfgVipGold', numeric: true },
  { key: 'vip_days', labelKey: 'admin.cfgVipDays', numeric: true },
];

export default function Admin() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { profile: me } = useAuth();
  const [section, setSection] = useState<Section>('overview');

  // overview
  const [stats, setStats] = useState<AdminStats | null>(null);
  // orders
  const [orderStatus, setOrderStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [proofUrls, setProofUrls] = useState<Record<string, string>>({});
  // users
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  // reports
  const [reports, setReports] = useState<AdminReport[]>([]);
  // referrals
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  // post reports
  const [postReports, setPostReports] = useState<PostReportRow[]>([]);
  // promos
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [pCode, setPCode] = useState('');
  const [pKind, setPKind] = useState<'gems' | 'vip_days'>('gems');
  const [pValue, setPValue] = useState('');
  const [pUses, setPUses] = useState('100');
  // settings
  const [config, setConfig] = useState<Record<string, string>>({});
  // errors (سجل الأخطاء — قراءة فقط)
  const [errors, setErrors] = useState<ErrorLogRow[]>([]);
  const [errorsLoaded, setErrorsLoaded] = useState(false);
  // Darklink AI
  const [aiStats, setAiStats] = useState<AdminAiStats | null>(null);
  const [aiKb, setAiKb] = useState<AiKbRow[]>([]);
  const [aiKbForm, setAiKbForm] = useState({
    id: '',
    topic: '',
    question: '',
    answer: '',
    keywords: '',
    lang: 'ar',
    is_active: true,
  });

  const loadSection = useCallback(
    async (s: Section) => {
      if (s === 'overview') setStats(await fetchAdminStats());
      if (s === 'orders') {
        const rows = await fetchAdminOrders(orderStatus);
        setOrders(rows);
        const urls: Record<string, string> = {};
        for (const o of rows) {
          if (o.proof_path) {
            const u = await proofSignedUrl(o.proof_path);
            if (u) urls[o.id] = u;
          }
        }
        setProofUrls(urls);
      }
      if (s === 'users') setUsers(await searchAdminUsers(query));
      if (s === 'reports') setReports(await fetchAdminReports());
      if (s === 'referrals') setReferrals(await fetchAdminReferrals());
      if (s === 'postReports') setPostReports(await fetchAdminPostReports());
      if (s === 'promos') setPromos(await fetchAdminPromos());
      if (s === 'settings') setConfig(await fetchAdminConfig());
      if (s === 'errors') {
        setErrors(await fetchRecentErrors(50));
        setErrorsLoaded(true);
      }
      if (s === 'ai') {
        setAiStats(await fetchAdminAiStats());
        setAiKb(await fetchAdminAiKb());
        setConfig(await fetchAdminConfig());
      }
    },
    [orderStatus, query],
  );

  useEffect(() => {
    // تحميل قسم الداشبورد عند التبديل (نمط جلب بيانات قياسي)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSection(section);
  }, [section, loadSection]);

  if (!me) return <Screen>{null}</Screen>;
  if (!me.is_admin) {
    return (
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <GlassIconChip name="ban-outline" size={16} danger />
          <Text style={styles.title}>{t('admin.forbidden')}</Text>
        </View>
      </Screen>
    );
  }

  const SECTIONS: { key: Section; label: string; icon: GlassIconName }[] = [
    { key: 'overview', label: t('admin.overview'), icon: 'stats-chart-outline' },
    { key: 'orders', label: t('admin.orders'), icon: 'card-outline' },
    { key: 'users', label: t('admin.users'), icon: 'people-outline' },
    { key: 'reports', label: t('admin.reports'), icon: 'warning-outline' },
    { key: 'referrals', label: t('admin.referrals'), icon: 'gift-outline' },
    { key: 'postReports', label: t('admin.postReports'), icon: 'document-text-outline' },
    { key: 'promos', label: t('admin.promos'), icon: 'ticket-outline' },
    { key: 'settings', label: t('admin.settings'), icon: 'settings-outline' },
    { key: 'ai', label: 'Darklink AI', icon: 'sparkles-outline' },
    { key: 'errors', label: 'سجل الأخطاء', icon: 'bug-outline' },
  ];

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <GlassIconChip name="construct-outline" size={16} />
        <Text style={styles.title}>{t('admin.title')}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: spacing.md }}
        contentContainerStyle={{ gap: spacing.sm }}>
        {SECTIONS.map((s) => (
          <TouchableOpacity
            key={s.key}
            onPress={() => setSection(s.key)}
            style={[styles.chip, section === s.key && styles.chipActive]}>
            <View style={styles.chipContent}>
              <Ionicons
                name={s.icon}
                size={15}
                color={section === s.key ? colors.white : colors.primaryBright}
              />
              <Text
                style={{
                  color: section === s.key ? colors.white : colors.text,
                  fontWeight: '700',
                  fontSize: fonts.sizes.sm,
                }}>
                {s.label}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false}>
        {section === 'overview' && stats ? (
          <View style={{ gap: spacing.md }}>
            <View style={styles.statGrid}>
              <GlowCard style={styles.stat}>
                <Text style={styles.statNum}>{stats.users_total}</Text>
                <Text style={styles.statLabel}>{t('admin.usersTotal')}</Text>
              </GlowCard>
              <GlowCard style={styles.stat}>
                <Text style={styles.statNum}>{stats.users_today}</Text>
                <Text style={styles.statLabel}>{t('admin.usersToday')}</Text>
              </GlowCard>
              <GlowCard style={styles.stat}>
                <Text style={styles.statNum}>{stats.pending_orders}</Text>
                <Text style={styles.statLabel}>{t('admin.pendingOrders')}</Text>
              </GlowCard>
              <GlowCard style={styles.stat}>
                <Text style={styles.statNum}>{stats.gems_sold_today}</Text>
                <Text style={styles.statLabel}>{t('admin.gemsSoldToday')}</Text>
              </GlowCard>
              <GlowCard style={styles.stat}>
                <Text style={styles.statNum}>{stats.gifts_today}</Text>
                <Text style={styles.statLabel}>{t('admin.giftsToday')}</Text>
              </GlowCard>
              <GlowCard style={styles.stat}>
                <Text style={styles.statNum}>{stats.open_reports}</Text>
                <Text style={styles.statLabel}>{t('admin.openReports')}</Text>
              </GlowCard>
            </View>
            <NeonButton
              title={t('admin.awardContest')}
              icon="trophy-outline"
              variant="gold"
              onPress={async () => {
                const res = await awardContest();
                if (res.ok) {
                  appAlert(t('admin.awardDone', { prize: res.prize }));
                } else {
                  appAlert(t('common.error'), t(`admin.awardErr_${res.reason ?? 'error'}`));
                }
              }}
            />
          </View>
        ) : null}

        {section === 'orders' ? (
          <View>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
              {(['pending', 'approved', 'rejected'] as const).map((st) => (
                <TouchableOpacity
                  key={st}
                  onPress={() => setOrderStatus(st)}
                  style={[styles.chip, orderStatus === st && styles.chipActive]}>
                  <Text
                    style={{
                      color: orderStatus === st ? colors.white : colors.text,
                      fontSize: fonts.sizes.sm,
                      fontWeight: '700',
                    }}>
                    {t(`orders.${st}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {orders.length === 0 ? (
              <Text style={styles.empty}>{t('admin.noOrders')}</Text>
            ) : null}
            {orders.map((o) => (
              <View key={o.id} style={styles.card}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>
                  {o.user_name} • {o.gems + o.bonus_gems} 💎 • {o.amount_egp}{' '}
                  {t('common.egp')}
                </Text>
                <Text style={styles.meta}>
                  {o.method === 'vodafone' ? t('store.vodafone') : t('store.etisalat')}{' '}
                  • {t('admin.fromPhone')}: {o.sender_phone} • {o.code}
                </Text>
                <Text style={styles.meta}>
                  {new Date(o.created_at).toLocaleString()}
                </Text>
                {proofUrls[o.id] ? (
                  <Image source={{ uri: proofUrls[o.id] }} style={styles.proof} />
                ) : null}
                {o.status === 'pending' ? (
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: colors.success }]}
                      onPress={async () => {
                        const ok = await reviewPayment(o.id, true);
                        if (ok) loadSection('orders');
                      }}>
                      <Text style={styles.smallBtnText}>✓ {t('admin.approve')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: colors.danger }]}
                      onPress={() =>
                        appPrompt(
                          t('admin.reject'),
                          t('admin.rejectReason'),
                          t('admin.reject'),
                          async (reason) => {
                            const ok = await reviewPayment(o.id, false, reason);
                            if (ok) loadSection('orders');
                          },
                        )
                      }>
                      <View style={styles.smallBtnContent}>
                        <Ionicons name="close" size={15} color={colors.white} />
                        <Text style={styles.smallBtnText}>{t('admin.reject')}</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {o.status === 'rejected' && o.reject_reason ? (
                  <Text style={{ color: colors.danger, fontSize: fonts.sizes.xs }}>
                    {o.reject_reason}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {section === 'users' ? (
          <View>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={query}
                onChangeText={setQuery}
                placeholder={t('admin.searchUsers')}
                placeholderTextColor={colors.faint}
              />
              <NeonButton title={t('common.search')} onPress={() => loadSection('users')} />
            </View>
            {users.map((u) => (
              <View key={u.id} style={styles.card}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>
                  {u.shown_name} {u.is_vip ? '👑' : ''}{' '}
                  {u.is_suspended ? '⛔' : ''}
                </Text>
                <Text style={styles.meta}>
                  {u.email} • 💎 {u.balance}
                </Text>
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: colors.primary }]}
                    onPress={() =>
                      appPrompt(
                        t('admin.grant'),
                        t('admin.grantNote'),
                        t('admin.grant'),
                        async (txt) => {
                          const amt = parseInt(txt, 10);
                          if (!amt) return;
                          const ok = await grantGems(u.id, amt);
                          if (ok) loadSection('users');
                        },
                      )
                    }>
                    <View style={styles.smallBtnContent}>
                      <Ionicons name="diamond-outline" size={15} color={colors.white} />
                      <Text style={styles.smallBtnText}>{t('admin.grant')}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.smallBtn,
                      { backgroundColor: u.is_suspended ? colors.success : colors.danger },
                    ]}
                    onPress={async () => {
                      const ok = await setSuspended(u.id, !u.is_suspended);
                      if (ok) loadSection('users');
                    }}>
                    <Text style={styles.smallBtnText}>
                      {u.is_suspended ? t('admin.unsuspend') : t('admin.suspend')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {section === 'reports' ? (
          <View>
            {reports.length === 0 ? (
              <Text style={styles.empty}>{t('admin.noReports')}</Text>
            ) : null}
            {reports.map((r) => (
              <View key={r.id} style={styles.card}>
                <Text style={{ color: colors.text }}>{r.reason}</Text>
                <Text style={styles.meta}>
                  {new Date(r.created_at).toLocaleString()}
                </Text>
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: colors.primary }]}
                    onPress={async () => {
                      await setReportStatus(r.id, 'reviewed');
                      loadSection('reports');
                    }}>
                    <Text style={styles.smallBtnText}>{t('admin.markReviewed')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: colors.danger }]}
                    onPress={async () => {
                      await setReportStatus(r.id, 'actioned');
                      loadSection('reports');
                    }}>
                    <Text style={styles.smallBtnText}>{t('admin.markActioned')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {section === 'referrals' ? (
          <View>
            {referrals.length === 0 ? (
              <Text style={styles.empty}>{t('admin.noReferrals')}</Text>
            ) : null}
            {referrals.map((r) => (
              <View key={`${r.referrer_id}-${r.referred_id}`} style={styles.card}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>
                  {t('admin.referrer')}: {r.referrer_name}
                </Text>
                <Text style={{ color: colors.text }}>
                  {t('admin.referred')}: {r.referred_name}
                </Text>
                <Text style={styles.meta}>
                  {new Date(r.created_at).toLocaleString()} •{' '}
                  {r.rewarded ? t('admin.rewarded') : t('admin.notRewarded')}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {section === 'postReports' ? (
          <View>
            {postReports.length === 0 ? (
              <Text style={styles.empty}>{t('admin.noPostReports')}</Text>
            ) : null}
            {postReports.map((r) => (
              <View key={`${r.post_id}-${r.reporter_id}`} style={styles.card}>
                <Text style={{ color: colors.text }}>{r.post_body ?? '—'}</Text>
                <Text style={styles.meta}>
                  {t('admin.reportsCount', { count: r.reports_count })}
                  {r.post_hidden ? ` • ${t('admin.postHidden')}` : ''} •{' '}
                  {r.reporter_name} • {new Date(r.created_at).toLocaleString()}
                </Text>
                {r.reason ? (
                  <Text style={{ color: colors.muted, fontSize: fonts.sizes.sm }}>
                    {r.reason}
                  </Text>
                ) : null}
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: colors.danger }]}
                    onPress={async () => {
                      await deletePost(r.post_id);
                      loadSection('postReports');
                    }}>
                    <Text style={styles.smallBtnText}>{t('admin.deletePost')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {section === 'promos' ? (
          <View>
            <TextInput
              style={styles.input}
              value={pCode}
              onChangeText={setPCode}
              placeholder={t('admin.promoCode')}
              placeholderTextColor={colors.faint}
              autoCapitalize="characters"
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.sm }}>
              {(['gems', 'vip_days'] as const).map((k) => (
                <TouchableOpacity
                  key={k}
                  onPress={() => setPKind(k)}
                  style={[styles.chip, pKind === k && styles.chipActive]}>
                  <View style={styles.chipContent}>
                    {k === 'gems' ? (
                      <Ionicons
                        name="diamond-outline"
                        size={15}
                        color={pKind === k ? colors.white : colors.primaryBright}
                      />
                    ) : (
                      <Text style={{ fontSize: 14 }}>👑</Text>
                    )}
                    <Text
                      style={{
                        color: pKind === k ? colors.white : colors.text,
                        fontWeight: '700',
                        fontSize: fonts.sizes.sm,
                      }}>
                      {k === 'gems' ? t('admin.promoGems') : t('admin.promoVip')}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={pValue}
                onChangeText={setPValue}
                placeholder={t('admin.promoValue')}
                placeholderTextColor={colors.faint}
                keyboardType="number-pad"
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={pUses}
                onChangeText={setPUses}
                placeholder={t('admin.promoUses')}
                placeholderTextColor={colors.faint}
                keyboardType="number-pad"
              />
            </View>
            <View style={{ height: spacing.sm }} />
            <NeonButton
              title={t('admin.createPromo')}
              onPress={async () => {
                const v = parseInt(pValue, 10);
                const u = parseInt(pUses, 10);
                if (!pCode.trim() || !v || !u) return;
                const ok = await createPromo(pCode, pKind, v, u);
                if (ok) {
                  setPCode('');
                  setPValue('');
                  loadSection('promos');
                } else {
                  appAlert(t('common.error'), t('common.error'));
                }
              }}
            />
            <View style={{ height: spacing.md }} />
            {promos.map((p) => (
              <View key={p.code} style={styles.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>
                      {p.code} —{' '}
                      {p.kind === 'gems'
                        ? `${p.value} 💎`
                        : `${p.value} ${t('admin.days')}`}
                    </Text>
                    <Text style={styles.meta}>
                      {p.used_count}/{p.max_uses} {t('admin.uses')}
                    </Text>
                  </View>
                  <Switch
                    value={p.active}
                    onValueChange={async (v) => {
                      await setPromoActive(p.code, v);
                      loadSection('promos');
                    }}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {section === 'settings' ? (
          <View>
            {CONFIG_FIELDS.map((f) => (
              <View key={f.key} style={{ marginBottom: spacing.md }}>
                <Text style={styles.cfgLabel}>{t(f.labelKey)}</Text>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={config[f.key] ?? ''}
                    onChangeText={(v) =>
                      setConfig((c) => ({ ...c, [f.key]: v }))
                    }
                    placeholderTextColor={colors.faint}
                    keyboardType={f.numeric ? 'number-pad' : 'default'}
                  />
                  <NeonButton
                    title={t('common.save')}
                    onPress={async () => {
                      const ok = await setAdminConfig(f.key, config[f.key] ?? '');
                      appAlert(
                        ok ? '✓' : t('common.error'),
                        ok ? t('admin.saved') : t('common.error'),
                      );
                    }}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : null}
        {section === 'ai' ? (
          <View>
            {/* إحصاءات */}
            {aiStats ? (
              <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
                <View style={styles.statGrid}>
                  <GlowCard style={styles.stat}>
                    <Text style={styles.statNum}>{aiStats.total_messages}</Text>
                    <Text style={styles.statLabel}>إجمالي الردود</Text>
                  </GlowCard>
                  <GlowCard style={styles.stat}>
                    <Text style={styles.statNum}>{aiStats.today_messages}</Text>
                    <Text style={styles.statLabel}>ردود النهاردة</Text>
                  </GlowCard>
                  <GlowCard style={styles.stat}>
                    <Text style={styles.statNum}>{aiStats.users_count}</Text>
                    <Text style={styles.statLabel}>مستخدمين</Text>
                  </GlowCard>
                  <GlowCard style={styles.stat}>
                    <Text style={styles.statNum}>{aiStats.conversations_count}</Text>
                    <Text style={styles.statLabel}>محادثات</Text>
                  </GlowCard>
                  <GlowCard style={styles.stat}>
                    <Text style={styles.statNum}>{aiStats.errors_today}</Text>
                    <Text style={styles.statLabel}>أخطاء النهاردة</Text>
                  </GlowCard>
                </View>
                {aiStats.providers_today.map((p) => (
                  <View key={p.provider} style={styles.card}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{p.provider}</Text>
                    <Text style={styles.meta}>
                      {p.requests} طلب • {p.tokens} توكن (النهاردة)
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.empty}>…</Text>
            )}

            {/* إعدادات — أسماء المزودات والنماذج تظهر هنا فقط (للأدمن) */}
            <Text style={styles.sectionSubTitle}>الإعدادات</Text>
            <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>تفعيل Darklink AI</Text>
              <Switch
                value={config.ai_enabled === 'true'}
                onValueChange={async (v) => {
                  const val = v ? 'true' : 'false';
                  const ok = await setAdminConfig('ai_enabled', val);
                  if (ok) setConfig((c) => ({ ...c, ai_enabled: val }));
                  else appAlert(t('common.error'), t('common.error'));
                }}
              />
            </View>
            {[
              { key: 'ai_provider_order', label: 'ترتيب المزودات (مفصولة بفاصلة)' },
              { key: 'ai_daily_limit_per_user', label: 'الحد اليومي لكل مستخدم (رسالة)', numeric: true },
              { key: 'ai_model_gemini', label: 'نموذج Gemini' },
              { key: 'ai_model_groq', label: 'نموذج Groq' },
              { key: 'ai_max_input_chars', label: 'أقصى طول للرسالة (حرف)', numeric: true },
              { key: 'ai_max_output_tokens', label: 'أقصى طول للرد (توكن)', numeric: true },
            ].map((f) => (
              <View key={f.key} style={{ marginBottom: spacing.md }}>
                <Text style={styles.cfgLabel}>{f.label}</Text>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={config[f.key] ?? ''}
                    onChangeText={(v) => setConfig((c) => ({ ...c, [f.key]: v }))}
                    placeholderTextColor={colors.faint}
                    keyboardType={f.numeric ? 'number-pad' : 'default'}
                  />
                  <NeonButton
                    title={t('common.save')}
                    onPress={async () => {
                      const ok = await setAdminConfig(f.key, config[f.key] ?? '');
                      appAlert(ok ? '✓' : t('common.error'), ok ? t('admin.saved') : t('common.error'));
                    }}
                  />
                </View>
              </View>
            ))}
            <View style={{ marginBottom: spacing.md }}>
              <Text style={styles.cfgLabel}>تعليمات الشخصية (System Prompt)</Text>
              <TextInput
                style={[styles.input, { minHeight: 110, textAlignVertical: 'top' }]}
                value={config.ai_system_prompt ?? ''}
                onChangeText={(v) => setConfig((c) => ({ ...c, ai_system_prompt: v }))}
                placeholderTextColor={colors.faint}
                multiline
              />
              <View style={{ marginTop: spacing.sm }}>
                <NeonButton
                  title={t('common.save')}
                  onPress={async () => {
                    const ok = await setAdminConfig('ai_system_prompt', config.ai_system_prompt ?? '');
                    appAlert(ok ? '✓' : t('common.error'), ok ? t('admin.saved') : t('common.error'));
                  }}
                />
              </View>
            </View>

            {/* قاعدة المعرفة */}
            <Text style={styles.sectionSubTitle}>قاعدة المعرفة ({aiKb.length} موضوع)</Text>
            <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
              <TextInput
                style={styles.input}
                placeholder="الموضوع (مثال: gems)"
                placeholderTextColor={colors.faint}
                value={aiKbForm.topic}
                onChangeText={(v) => setAiKbForm((f) => ({ ...f, topic: v }))}
              />
              <TextInput
                style={styles.input}
                placeholder="السؤال"
                placeholderTextColor={colors.faint}
                value={aiKbForm.question}
                onChangeText={(v) => setAiKbForm((f) => ({ ...f, question: v }))}
              />
              <TextInput
                style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
                placeholder="الإجابة"
                placeholderTextColor={colors.faint}
                value={aiKbForm.answer}
                onChangeText={(v) => setAiKbForm((f) => ({ ...f, answer: v }))}
                multiline
              />
              <TextInput
                style={styles.input}
                placeholder="كلمات مفتاحية (مفصولة بمسافات)"
                placeholderTextColor={colors.faint}
                value={aiKbForm.keywords}
                onChangeText={(v) => setAiKbForm((f) => ({ ...f, keywords: v }))}
              />
              <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                <TouchableOpacity
                  onPress={() => setAiKbForm((f) => ({ ...f, lang: 'ar' }))}
                  style={[styles.chip, aiKbForm.lang === 'ar' && styles.chipActive]}>
                  <Text style={{ color: aiKbForm.lang === 'ar' ? colors.white : colors.text, fontWeight: '700' }}>عربي</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setAiKbForm((f) => ({ ...f, lang: 'en' }))}
                  style={[styles.chip, aiKbForm.lang === 'en' && styles.chipActive]}>
                  <Text style={{ color: aiKbForm.lang === 'en' ? colors.white : colors.text, fontWeight: '700' }}>English</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <Text style={{ color: colors.text }}>مفعّل</Text>
                <Switch
                  value={aiKbForm.is_active}
                  onValueChange={(v) => setAiKbForm((f) => ({ ...f, is_active: v }))}
                />
              </View>
              <NeonButton
                title={aiKbForm.id ? 'حفظ التعديل' : 'إضافة موضوع'}
                onPress={async () => {
                  if (!aiKbForm.topic.trim() || !aiKbForm.answer.trim()) {
                    appAlert(t('common.error'), 'الموضوع والإجابة مطلوبين');
                    return;
                  }
                  const ok = await upsertAdminAiKb({
                    id: aiKbForm.id,
                    topic: aiKbForm.topic.trim(),
                    question: aiKbForm.question.trim(),
                    answer: aiKbForm.answer.trim(),
                    keywords: aiKbForm.keywords.trim(),
                    lang: aiKbForm.lang,
                    is_active: aiKbForm.is_active,
                  });
                  appAlert(ok ? '✓' : t('common.error'), ok ? t('admin.saved') : t('common.error'));
                  if (ok) {
                    setAiKbForm({ id: '', topic: '', question: '', answer: '', keywords: '', lang: 'ar', is_active: true });
                    setAiKb(await fetchAdminAiKb());
                  }
                }}
              />
              {aiKbForm.id ? (
                <NeonButton
                  title={t('common.cancel')}
                  onPress={() =>
                    setAiKbForm({ id: '', topic: '', question: '', answer: '', keywords: '', lang: 'ar', is_active: true })
                  }
                />
              ) : null}
            </View>
            {aiKb.map((row) => (
              <View key={row.id} style={styles.card}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>
                  {row.topic} • {row.lang} {row.is_active ? '' : '(متوقف)'}
                </Text>
                <Text style={styles.meta} numberOfLines={2}>
                  {row.question}
                </Text>
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: colors.primary }]}
                    onPress={() =>
                      setAiKbForm({
                        id: row.id,
                        topic: row.topic,
                        question: row.question,
                        answer: row.answer,
                        keywords: row.keywords,
                        lang: row.lang,
                        is_active: row.is_active,
                      })
                    }>
                    <Text style={styles.smallBtnText}>{t('common.edit')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: colors.danger }]}
                    onPress={() =>
                      appAlert('حذف الموضوع؟', row.topic, [
                        { text: t('common.cancel'), style: 'cancel' },
                        {
                          text: t('common.delete'),
                          style: 'destructive',
                          onPress: async () => {
                            await deleteAdminAiKb(row.id);
                            setAiKb(await fetchAdminAiKb());
                          },
                        },
                      ])
                    }>
                    <Text style={styles.smallBtnText}>{t('common.delete')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : null}
        {section === 'errors' ? (
          <View>
            {!errorsLoaded ? (
              <Text style={styles.empty}>…</Text>
            ) : errors.length === 0 ? (
              <Text style={styles.empty}>
                لا توجد أخطاء مسجلة — أو جدول error_logs لسه متعملش
              </Text>
            ) : null}
            {errors.map((e) => (
              <View key={e.id} style={styles.card}>
                <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={3}>
                  {e.message}
                </Text>
                <Text style={styles.meta}>
                  {e.route ?? '—'} • {new Date(e.created_at).toLocaleString()}
                </Text>
                {e.user_id ? (
                  <Text style={styles.meta}>user: {e.user_id.slice(0, 8)}…</Text>
                ) : null}
                {e.stack ? (
                  <Text style={styles.meta} numberOfLines={4}>
                    {e.stack}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.bold,
    marginVertical: spacing.md,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  /** صف محتوى الشريحة: أيقونة + نص */
  chipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  stat: { width: '47%', alignItems: 'center' },
  statNum: {
    color: colors.text,
    fontSize: fonts.sizes.xxl,
    fontWeight: fonts.weights.black,
  },
  statLabel: { color: colors.muted, fontSize: fonts.sizes.xs, marginTop: 2 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: 4,
  },
  meta: { color: colors.muted, fontSize: fonts.sizes.xs },
  empty: { color: colors.muted, textAlign: 'center', marginTop: spacing.lg },
  proof: { width: '100%', height: 160, borderRadius: radius.md, marginTop: spacing.sm },
  smallBtn: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 9,
    alignItems: 'center',
  },
  /** صف محتوى الزر الصغير: أيقونة + نص */
  smallBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  smallBtnText: { color: colors.white, fontWeight: '700', fontSize: fonts.sizes.sm },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    color: colors.text,
    fontSize: fonts.sizes.md,
  },
  cfgLabel: { color: colors.text, fontWeight: '700', marginBottom: spacing.xs },
  sectionSubTitle: {
    color: colors.text,
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    marginVertical: spacing.md,
  },
});
