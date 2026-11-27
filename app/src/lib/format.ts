// تنسيق الوقت بالعربي: 07:39 ص — أرقام لاتينية + ص/م (ثابت في كل اللغات
// والأجهزة، بدل toLocaleTimeString اللي بيطلع AM/PM حسب لغة الجهاز)
export function formatTimeAr(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  let h = d.getHours();
  const m = d.getMinutes();
  const period = h < 12 ? 'ص' : 'م';
  h = h % 12 || 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
}
