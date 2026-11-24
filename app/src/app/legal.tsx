import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Screen } from '../components/ui';
import { colors, fonts, spacing } from '../theme';

const PRIVACY_AR = `سياسة الخصوصية — DARKLINK

١. هويتك: عند اختيار الوضع المجهول لا نعرض اسمك الحقيقي أو بريدك لأي مستخدم آخر، في التطبيق أو عبر واجهات البرمجة. يظهر للآخرين اسمك المستعار فقط.
٢. بياناتك: نخزن بريدك وملفك ورسائلك ومحفظتك لتشغيل الخدمة فقط، ولا نبيع بياناتك.
٣. الوسائط: الصور والرسائل الصوتية مخزنة في مساحات خاصة لا يصل إليها إلا أطراف المحادثة.
٤. المحفظة: لا يمكن تعديل رصيدك من التطبيق؛ كل العمليات تتم من الخادم وتُسجل في سجل معاملات.
٥. الحذف: يمكنك حذف حسابك من الإعدادات، ويُحذف ملفك وبياناتك المرتبطة نهائيًا.

شروط الاستخدام

١. الهدايا افتراضية داخل التطبيق ولا قيمة نقدية لها ولا يمكن سحبها.
٢. يمنع إساءة الاستخدام أو انتحال الشخصية أو مضايقة المستخدمين؛ استخدم الحظر والإبلاغ.
٣. شراء الجواهر في النسخة التجريبية يعمل بوضع اختبار (Sandbox) ولا يتم خصم أموال حقيقية.`;

const PRIVACY_EN = `Privacy Policy — DARKLINK

1. Your identity: In Anonymous mode we never expose your real name or email to any other user, in the app or via the API. Others only see your alias.
2. Your data: We store your email, profile, messages and wallet only to operate the service. We do not sell your data.
3. Media: Photos and voice notes live in private storage accessible only to conversation participants.
4. Wallet: Your balance cannot be changed from the app; all operations run server-side and are recorded in a transaction ledger.
5. Deletion: You can delete your account from Settings; your profile and linked data are permanently removed.

Terms of Use

1. Gifts are virtual items inside the app with no cash value and cannot be withdrawn.
2. Abuse, impersonation and harassment are prohibited; use block and report.
3. Gem purchases in the preview build run in Sandbox mode — no real money is charged.`;

export default function Legal() {
  const ar = true; // تُعرض النصوص حسب لغة الواجهة عند النشر — حاليًا العربية افتراضيًا
  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.h}>📄</Text>
        <Text style={styles.body}>{ar ? PRIVACY_AR : PRIVACY_EN}</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 30, marginVertical: spacing.md },
  body: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    lineHeight: 26,
    marginBottom: spacing.xxl,
  },
});
