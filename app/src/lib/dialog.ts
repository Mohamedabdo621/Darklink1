// ============================================================
// DARKLINK — نظام النوافذ المنبثقة بستايل التطبيق (بديل Alert)
// مخزن خارجي بسيط + واجهة برمجية مشابهة لـ Alert.alert
// ============================================================

export interface AppDialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface AppDialogState {
  id: number;
  title: string;
  message?: string;
  buttons: AppDialogButton[];
  prompt?: {
    submitText: string;
    onSubmit: (value: string) => void;
    /** إخفاء النص أثناء الكتابة (رمز PIN) */
    secure?: boolean;
    /** لوحة أرقام بدل لوحة الحروف */
    numeric?: boolean;
  };
}

let current: AppDialogState | null = null;
let seq = 1;
let defaultOkLabel = 'OK';
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeDialog(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getDialog(): AppDialogState | null {
  return current;
}

export function closeDialog() {
  current = null;
  emit();
}

/** يضبطه الـ Provider من i18n عشان زر الإغلاق الافتراضي يبقى بلغة التطبيق */
export function setDialogOkLabel(label: string) {
  defaultOkLabel = label;
}

export function appAlert(
  title: string,
  message?: string,
  buttons?: AppDialogButton[],
) {
  current = {
    id: seq++,
    title,
    message,
    buttons: buttons?.length ? buttons : [{ text: defaultOkLabel }],
  };
  emit();
}

export function appPrompt(
  title: string,
  message: string | undefined,
  submitText: string,
  onSubmit: (value: string) => void,
  opts?: { secure?: boolean; numeric?: boolean },
) {
  current = {
    id: seq++,
    title,
    message,
    buttons: [],
    prompt: { submitText, onSubmit, secure: opts?.secure, numeric: opts?.numeric },
  };
  emit();
}
