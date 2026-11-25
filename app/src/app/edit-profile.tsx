import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { appAlert } from '../lib/dialog';
import { INTEREST_KEYS, MAX_INTERESTS } from '../lib/interests';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GlowCard, NeonButton, NeonInput, Screen, ToggleRow } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import type { IdentityMode, Profile } from '../lib/types';
import {
  avatarSignedUrl,
  updateMyProfile,
  updatePrivacySetting,
  uploadAvatar,
} from '../services/profile';
import { colors, fonts, radius, spacing } from '../theme';

const USERNAME_RE = /^[a-z0-9_.]{3,24}$/;

export default function EditProfile() {
  const { profile } = useAuth();
  if (!profile) return <Screen>{null}</Screen>;
  return <EditProfileForm key={profile.id} profile={profile} />;
}

function EditProfileForm({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const { refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [username, setUsername] = useState(profile.username ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>(profile.interests ?? []);
  const [busy, setBusy] = useState(false);
  const [usernameErr, setUsernameErr] = useState('');

  useEffect(() => {
    let live = true;
    avatarSignedUrl(profile.avatar_url).then((u) => {
      if (live) setAvatar(u);
    });
    return () => {
      live = false;
    };
  }, [profile.avatar_url]);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (res.canceled || !res.assets[0]) return;
    setBusy(true);
    const path = await uploadAvatar(profile.id, res.assets[0].uri);
    setBusy(false);
    if (path) {
      setAvatar(res.assets[0].uri);
      await refreshProfile();
    } else {
      appAlert(t('common.error'), t('common.error'));
    }
  };

  const save = async () => {
    const uname = username.trim().toLowerCase();
    if (uname && !USERNAME_RE.test(uname)) {
      setUsernameErr(t('editProfile.usernameInvalid'));
      return;
    }
    setUsernameErr('');
    setBusy(true);
    const res = await updateMyProfile(profile.id, {
      display_name: displayName.trim() || null,
      username: uname || null,
      bio: bio.trim() || null,
      interests,
    });
    setBusy(false);
    if (!res.ok) {
      if (res.taken) setUsernameErr(t('editProfile.usernameTaken'));
      else appAlert(t('common.error'), t('common.error'));
      return;
    }
    await refreshProfile();
    appAlert(t('common.success'), t('editProfile.saved'));
    router.back();
  };

  const setPrivacy = async (
    field:
      | 'identity_mode'
      | 'discoverable'
      | 'share_photo'
      | 'share_info'
      | 'show_last_seen',
    value: string | boolean,
  ) => {
    const ok = await updatePrivacySetting(profile.id, field, value);
    if (ok) await refreshProfile();
    else appAlert(t('common.error'), t('common.error'));
  };

  return (
    <Screen>
      <KeyboardAwareScrollView bottomOffset={24} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('editProfile.title')}</Text>

        <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
          <TouchableOpacity onPress={pickPhoto}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={{ fontSize: 36 }}>👤</Text>
              </View>
            )}
            <Text style={styles.changePhoto}>📷 {t('editProfile.changePhoto')}</Text>
          </TouchableOpacity>
        </View>

        <NeonInput
          label={t('editProfile.displayName')}
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={40}
        />
        <NeonInput
          label={t('editProfile.username')}
          value={username}
          onChangeText={(v) => setUsername(v.toLowerCase())}
          autoCapitalize="none"
          error={usernameErr}
          placeholder="shadow_fox"
        />
        <Text style={styles.hint}>{t('editProfile.usernameHint')}</Text>
        <NeonInput
          label={t('editProfile.bio')}
          value={bio}
          onChangeText={setBio}
          multiline
          maxLength={160}
          placeholder="..."
        />

        <NeonButton title={t('common.save')} onPress={save} loading={busy} />

        <Text style={[styles.title, { marginTop: spacing.xl }]}>{t('editProfile.privacy')}</Text>
        <GlowCard>
          <Text style={styles.privacyLabel}>{t('editProfile.identityMode')}</Text>
          <View style={styles.modeRow}>
            {(['anonymous', 'public'] as IdentityMode[]).map((m) => {
              const active = profile.identity_mode === m;
              return (
                <TouchableOpacity
                  key={m}
                  onPress={() => setPrivacy('identity_mode', m)}
                  style={[styles.modeChip, active && styles.modeChipActive]}>
                  <Text style={{ color: active ? colors.white : colors.muted, fontWeight: '700' }}>
                    {m === 'anonymous' ? `🕶 ${t('common.anonymous')}` : `🌐 ${t('common.public')}`}
                  </Text>
                  <Text
                    style={{
                      color: active ? colors.white : colors.faint,
                      fontSize: fonts.sizes.xs,
                      textAlign: 'center',
                    }}>
                    {m === 'anonymous'
                      ? t('editProfile.identityAnonymousDesc')
                      : t('editProfile.identityPublicDesc')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <ToggleRow
            title={t('editProfile.discoverable')}
            desc={t('editProfile.discoverableDesc')}
            value={profile.discoverable}
            onChange={(v) => setPrivacy('discoverable', v)}
          />
          <ToggleRow
            title={t('editProfile.sharePhoto')}
            desc={t('editProfile.sharePhotoDesc')}
            value={profile.share_photo}
            onChange={(v) => setPrivacy('share_photo', v)}
          />
          <ToggleRow
            title={t('editProfile.shareInfo')}
            desc={t('editProfile.shareInfoDesc')}
            value={profile.share_info}
            onChange={(v) => setPrivacy('share_info', v)}
          />
          <ToggleRow
            title={t('editProfile.showLastSeen')}
            desc={t('editProfile.showLastSeenDesc')}
            value={profile.show_last_seen}
            onChange={(v) => setPrivacy('show_last_seen', v)}
          />
        </GlowCard>

        <GlowCard style={{ marginTop: spacing.md }}>
          <Text style={styles.sectionTitle}>
            🎯 {t('interests.title')} — {t('interests.pickUpTo')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {INTEREST_KEYS.map((k) => {
              const active = interests.includes(k);
              return (
                <TouchableOpacity
                  key={k}
                  onPress={() =>
                    setInterests((prev) =>
                      active
                        ? prev.filter((x) => x !== k)
                        : prev.length >= MAX_INTERESTS
                          ? prev
                          : [...prev, k],
                    )
                  }
                  style={[
                    styles.interestChip,
                    active && styles.interestChipActive,
                  ]}>
                  <Text
                    style={{
                      color: active ? colors.white : colors.muted,
                      fontSize: fonts.sizes.sm,
                      fontWeight: fonts.weights.medium,
                    }}>
                    {t(`interests.${k}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </GlowCard>
        <View style={{ height: spacing.xxl }} />
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.bold,
    marginVertical: spacing.md,
  },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarFallback: {
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.stroke,
  },
  changePhoto: { color: colors.primaryBright, textAlign: 'center', marginTop: spacing.sm },
  hint: { color: colors.faint, fontSize: fonts.sizes.xs, marginTop: -6, marginBottom: spacing.md },
  privacyLabel: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: fonts.weights.bold,
    marginBottom: spacing.md,
  },
  modeRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  modeChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
  },
  modeChipActive: { backgroundColor: colors.primary, borderColor: colors.primaryBright },
  sectionTitle: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: fonts.weights.bold,
    marginBottom: spacing.md,
  },
  interestChip: {
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  interestChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
});
