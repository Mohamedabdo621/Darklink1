import React, { useEffect, useState, useSyncExternalStore, useMemo } from 'react';
import {
  I18nManager,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, { FadeIn, SlideInDown, ZoomIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import {
  closeDialog,
  getDialog,
  setDialogOkLabel,
  subscribeDialog,
  type AppDialogButton,
} from '../lib/dialog';
import { fonts, radius, shadowGlow, spacing } from '../theme';

import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme';
/**
 * عارض النوافذ المنبثقة بستايل DARKLINK — يُركَّب مرة واحدة في جذر التطبيق.
 * الاستخدام من أي مكان: appAlert / appPrompt من lib/dialog.
 */
export default function AppDialog() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const dialog = useSyncExternalStore(subscribeDialog, getDialog);
  const [pv, setPv] = useState<{ id: number; v: string }>({ id: 0, v: '' });

  useEffect(() => {
    setDialogOkLabel(t('common.ok'));
  }, [t]);

  if (!dialog) return null;

  // قيمة حقل الإدخال مرتبطة بهوية النافذة — نافذة جديدة تعني قيمة فارغة
  const promptValue = pv.id === dialog.id ? pv.v : '';
  const setPromptValue = (v: string) => setPv({ id: dialog.id, v });

  const press = (b: AppDialogButton) => {
    if (b.style === 'destructive') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } else {
      Haptics.selectionAsync().catch(() => {});
    }
    closeDialog();
    b.onPress?.();
  };

  const buttons = dialog.buttons;
  const isSheet = buttons.length > 2;
  const hasCancel = buttons.some((b) => b.style === 'cancel');
  const dismiss = () => {
    if (hasCancel || !buttons.length) closeDialog();
  };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={dismiss}>
      <Pressable
        style={[styles.backdrop, isSheet && styles.backdropSheet]}
        onPress={dismiss}>
        <Animated.View entering={FadeIn.duration(140)} style={styles.center}>
          <Pressable onPress={() => {}}>
            <Animated.View
              entering={isSheet ? SlideInDown.duration(220) : ZoomIn.duration(180)}
              style={[styles.card, shadowGlow]}>
              {dialog.title ? <Text style={styles.title}>{dialog.title}</Text> : null}
              {dialog.message ? (
                <Text style={styles.message}>{dialog.message}</Text>
              ) : null}

              {dialog.prompt ? (
                <View style={{ width: '100%' }}>
                  <TextInput
                    value={promptValue}
                    onChangeText={setPromptValue}
                    placeholder={dialog.message ? undefined : dialog.title}
                    placeholderTextColor={colors.faint}
                    style={styles.promptInput}
                    autoFocus
                    secureTextEntry={dialog.prompt.secure}
                    keyboardType={dialog.prompt.numeric ? 'number-pad' : 'default'}
                  />
                  <View style={styles.rowBtns}>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnGhost]}
                      onPress={() => closeDialog()}>
                      <Text style={styles.btnGhostText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnPrimary]}
                      onPress={() => {
                        const v = promptValue;
                        closeDialog();
                        if (v.trim()) dialog.prompt?.onSubmit(v);
                      }}>
                      <Text style={styles.btnPrimaryText}>
                        {dialog.prompt.submitText}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : isSheet ? (
                <View style={{ width: '100%', marginTop: spacing.sm }}>
                  {buttons.map((b, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[
                        styles.sheetBtn,
                        i > 0 && styles.sheetDivider,
                        b.style === 'cancel' && styles.sheetCancel,
                      ]}
                      onPress={() => press(b)}>
                      <Text
                        style={[
                          styles.sheetBtnText,
                          b.style === 'destructive' && { color: colors.danger },
                          b.style === 'cancel' && { color: colors.muted },
                        ]}>
                        {b.text}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : buttons.length === 2 ? (
                <View style={styles.rowBtns}>
                  {buttons.map((b, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[
                        styles.btn,
                        b.style === 'cancel'
                          ? styles.btnGhost
                          : b.style === 'destructive'
                            ? styles.btnDanger
                            : styles.btnPrimary,
                      ]}
                      onPress={() => press(b)}>
                      <Text
                        style={
                          b.style === 'cancel'
                            ? styles.btnGhostText
                            : styles.btnPrimaryText
                        }>
                        {b.text}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                buttons.map((b, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.singleBtn,
                      b.style === 'destructive' ? styles.btnDanger : styles.btnPrimary,
                    ]}
                    onPress={() => press(b)}>
                    <Text style={styles.btnPrimaryText}>{b.text}</Text>
                  </TouchableOpacity>
                ))
              )}
            </Animated.View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(3,0,8,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    // على الويب: ثبّت الخلفية على الشاشة نفسها — من غيره حاوية الـ Modal
    // بتتمدد بطول الصفحة والكارت بينزل تحت (كان بيظهر خارج الشاشة)
    // 'fixed' مش في أنواع RN فبتتكتب بتحويل — شغالة على الويب بس
    ...(Platform.OS === 'web'
      ? ({
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        } as unknown as ViewStyle)
      : null),
  },
  /** قايمة الأكشنات (>2 زرار) بتنزل شيت من تحت — ثابتة على حافة الشاشة
   *  فمستحيل تظهر برّه، وده النمط الطبيعي للقوايم على الموبايل */
  backdropSheet: {
    justifyContent: 'flex-end',
  },
  center: { width: '100%', maxWidth: 420 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 22,
    padding: spacing.lg,
    alignItems: 'center',
  },
  title: {
    color: colors.text,
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    textAlign: 'center',
  },
  message: {
    color: colors.muted,
    fontSize: fonts.sizes.md,
    lineHeight: 23,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  promptInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: fonts.sizes.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    marginTop: spacing.md,
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  rowBtns: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    width: '100%',
  },
  btn: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnDanger: { backgroundColor: colors.danger },
  btnGhost: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.stroke,
  },
  btnPrimaryText: {
    color: colors.white,
    fontSize: fonts.sizes.md,
    fontWeight: fonts.weights.bold,
  },
  btnGhostText: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: fonts.weights.medium,
  },
  singleBtn: {
    width: '100%',
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  sheetBtn: { paddingVertical: 14, alignItems: 'center', width: '100%' },
  sheetDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.stroke,
  },
  sheetCancel: { marginTop: spacing.xs },
  sheetBtnText: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: fonts.weights.medium,
  },
});
