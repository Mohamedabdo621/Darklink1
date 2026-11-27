import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { NeonButton } from '../components/ui';
import { GlassIconButton } from '../components/GlassIconButton';
import { appAlert } from '../lib/dialog';
import { sendMediaMessage, uploadChatFile } from '../services/chat';
import { fonts, spacing } from '../theme';

import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme';

/** كاميرا جوّه التطبيق — بتفتح كاميرا الهاتف نفسها (مش معرض الصور)،
 *  والصورة بتتاخد لملف مؤقت في التطبيق بس وبتتمسح بعد الإرسال —
 *  مبتتحفظش في الاستوديو/المعرض خالص. شغالة على الويب (getUserMedia)
 *  وعلى التطبيق الأصلي. */
export default function CameraScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    conversationId?: string;
    senderId?: string;
    replyToId?: string;
  }>();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [ready, setReady] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const conversationId = params.conversationId ?? '';
  const senderId = params.senderId ?? '';
  const replyToId = params.replyToId ? params.replyToId : null;

  const takePhoto = useCallback(async () => {
    if (!cameraRef.current || !ready) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: true,
      });
      if (photo?.uri) setPhotoUri(photo.uri);
    } catch {
      appAlert(t('common.error'), t('camera.captureFailed'));
    }
  }, [ready, t]);

  const sendPhoto = useCallback(async () => {
    if (!photoUri || !conversationId || !senderId || busy) return;
    setBusy(true);
    const path = await uploadChatFile(
      'chat-media',
      conversationId,
      senderId,
      photoUri,
      'jpg',
      'image/jpeg',
    );
    if (path) {
      await sendMediaMessage(conversationId, senderId, 'image', path, replyToId);
      // امسح الملف المؤقت من الهاتف بعد ما اترفع — ميفضلش أي أثر
      if (photoUri.startsWith('file://')) {
        try {
          new File(photoUri).delete();
        } catch {
          // الملف مش موجود أصلًا — تمام
        }
      }
      router.back();
    } else {
      appAlert(t('common.error'), t('common.error'));
    }
    setBusy(false);
  }, [photoUri, conversationId, senderId, replyToId, busy, t]);

  // ---- الإذن ----
  if (!permission) {
    return <View style={styles.black} />;
  }
  if (!permission.granted) {
    return (
      <View style={styles.permission}>
        <Ionicons name="camera-outline" size={64} color={colors.muted} />
        <Text style={styles.permissionTitle}>{t('camera.needPermission')}</Text>
        <Text style={styles.permissionText}>{t('camera.permissionHint')}</Text>
        {permission.canAskAgain ? (
          <NeonButton title={t('camera.allow')} onPress={() => void requestPermission()} />
        ) : (
          <NeonButton
            title={t('camera.openSettings')}
            onPress={() => void Linking.openSettings()}
          />
        )}
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: spacing.lg }}>
          <Text style={{ color: colors.muted }}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ---- معاينة الصورة بعد الالتقاط ----
  if (photoUri) {
    return (
      <View style={styles.black}>
        <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="contain" />
        <View style={styles.previewBar}>
          <TouchableOpacity
            onPress={() => setPhotoUri(null)}
            style={styles.previewBtn}
            disabled={busy}>
            <Ionicons name="refresh-outline" size={22} color={colors.white} />
            <Text style={styles.previewBtnText}>{t('camera.retake')}</Text>
          </TouchableOpacity>
          <NeonButton title={t('camera.send')} onPress={() => void sendPhoto()} loading={busy} />
        </View>
      </View>
    );
  }

  // ---- المعاينة الحية ----
  return (
    <View style={styles.black}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        onCameraReady={() => setReady(true)}
      />
      <View style={styles.topBar}>
        <GlassIconButton name="close" size={24} circular onPress={() => router.back()} />
        <GlassIconButton
          name="camera-reverse-outline"
          size={24}
          circular
          onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
        />
      </View>
      <View style={styles.bottomBar}>
        <TouchableOpacity
          onPress={() => void takePhoto()}
          disabled={!ready}
          style={[styles.shutter, !ready && { opacity: 0.5 }]}
          hitSlop={12}>
          <View style={styles.shutterInner} />
        </TouchableOpacity>
        <Text style={styles.hint}>{t('camera.tapToCapture')}</Text>
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    black: { flex: 1, backgroundColor: '#000000' },
    camera: { flex: 1 },
    topBar: {
      position: 'absolute',
      top: spacing.xl,
      left: spacing.lg,
      right: spacing.lg,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    bottomBar: {
      position: 'absolute',
      bottom: spacing.xxl,
      left: 0,
      right: 0,
      alignItems: 'center',
      gap: spacing.sm,
    },
    shutter: {
      width: 76,
      height: 76,
      borderRadius: 38,
      borderWidth: 4,
      borderColor: colors.white,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.15)',
    },
    shutterInner: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: colors.white,
    },
    hint: { color: 'rgba(255,255,255,0.75)', fontSize: fonts.sizes.sm },
    preview: { flex: 1, backgroundColor: '#000000' },
    previewBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.lg,
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
    },
    previewBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    previewBtnText: { color: colors.white, fontWeight: '700' },
    permission: {
      flex: 1,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      padding: spacing.xl,
    },
    permissionTitle: {
      color: colors.text,
      fontSize: fonts.sizes.lg,
      fontWeight: fonts.weights.bold,
      textAlign: 'center',
    },
    permissionText: {
      color: colors.muted,
      fontSize: fonts.sizes.md,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
  });
