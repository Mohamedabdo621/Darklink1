import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { fonts, spacing, type ThemeColors } from '../theme';

// فشل تحميل chunk بعد تحديث (نسخة قديمة متخزنة في المتصفح طلبت ملف
// مبقاش موجود) — أشهرها AsyncRequireError: Loading module ... failed.
function isChunkLoadError(error: Error): boolean {
  const msg = `${error.name} ${error.message}`;
  return /loading module|chunkloaderror|loading chunk|failed to fetch|dynamically imported module/i.test(
    msg,
  );
}

// حاجز أخطاء: لو حصل خطأ برمجي أثناء عرض شاشة، نعرض نص الخطأ بدل ما يقفل التطبيق
interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

class ErrorBoundaryInner extends React.Component<Props & { colors: ThemeColors }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // ويب بس: لو الخطأ فشل تحميل ملف بعد تحديث، حدّث الصفحة مرة واحدة
    // (النسخة الجديدة هتتحمل) بدل الشاشة الحمرا — والعلامة في
    // sessionStorage بتمنع loop لو التحديث نفسه فشل
    if (Platform.OS === 'web' && isChunkLoadError(error)) {
      try {
        if (
          typeof window !== 'undefined' &&
          window.sessionStorage?.getItem('darklink:chunk-reload') !== '1'
        ) {
          window.sessionStorage.setItem('darklink:chunk-reload', '1');
          window.location.reload();
          return;
        }
      } catch {
        // التخزين مش متاح — اعرض الخطأ عادي
      }
    }
    this.setState({ error });
  }

  render() {
    const { colors } = this.props;
    const styles = makeStyles(colors);
    if (this.state.error) {
      const e = this.state.error;
      return (
        <View style={styles.wrap}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.title}>⚠️ حصل خطأ في التطبيق</Text>
            <Text style={styles.hint}>
              خد سكرين شوت للصفحة دي وابعتها — هتساعدنا نصلّح المشكلة بسرعة
            </Text>
            <Text selectable style={styles.err}>
              {e.name}: {e.message}
              {e.stack ? `\n\n${e.stack.slice(0, 1500)}` : ''}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

export function ErrorBoundary({ children }: Props) {
  const { colors } = useTheme();
  return <ErrorBoundaryInner colors={colors}>{children}</ErrorBoundaryInner>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, paddingTop: 60 },
  scroll: { padding: spacing.lg, gap: spacing.md },
  title: {
    color: colors.text,
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.bold,
  },
  hint: { color: colors.muted, fontSize: fonts.sizes.md, lineHeight: 22 },
  err: {
    color: '#f87171',
    fontSize: fonts.sizes.sm,
    fontFamily: 'monospace',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 12,
    padding: spacing.md,
  },
});
