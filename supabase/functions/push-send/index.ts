// DARKLINK — إرسال إشعار Push (Edge Function)
// تُستدعى من زناد قاعدة البيانات (pg_net) عند كل إشعار جديد.
// المصادقة: ترويسة x-push-secret تُقارن بسرّ Edge Function
// (PUSH_SECRET في Supabase Secrets) — لا JWT، ولا قراءة من app_config.
// الخصوصية: نص الإشعار لا يحتوي أبدًا على محتوى الرسائل — اسم العرض فقط.
import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

interface ProfileRow {
  identity_mode: string;
  share_info: boolean;
  display_name: string | null;
  anonymous_alias: string;
  language: string;
}

function shownName(p: ProfileRow): string {
  return p.identity_mode === "public" && p.share_info
    ? (p.display_name ?? p.anonymous_alias)
    : p.anonymous_alias;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service);

  // التحقق من السر المشترك (سرّ Edge Function، لا يُقرأ من app_config)
  const secret = req.headers.get("x-push-secret") ?? "";
  const expected = Deno.env.get("PUSH_SECRET") ?? "";
  if (!expected || secret !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  const { notification_id } = await req.json().catch(() => ({}));
  if (!notification_id) return json({ error: "missing id" }, 400);

  const { data: notif } = await admin
    .from("notifications")
    .select("id, user_id, type, payload")
    .eq("id", notification_id)
    .single();
  if (!notif) return json({ ok: true, skipped: "notif gone" });

  // لغة المستلم + توكنات أجهزته
  const { data: recipient } = await admin
    .from("profiles")
    .select("language")
    .eq("id", notif.user_id)
    .single();
  const lang = recipient?.language === "en" ? "en" : "ar";

  const { data: tokens } = await admin
    .from("push_tokens")
    .select("token")
    .eq("user_id", notif.user_id);
  if (!tokens?.length) return json({ ok: true, skipped: "no tokens" });

  // اسم عرض المرسل (إن وجد)
  const payload = (notif.payload ?? {}) as Record<string, unknown>;
  let senderName = "";
  const senderId = (payload.sender_id ?? payload.from_user_id) as
    | string
    | undefined;
  if (senderId) {
    const { data: sender } = await admin
      .from("profiles")
      .select("identity_mode, share_info, display_name, anonymous_alias, language")
      .eq("id", senderId)
      .single();
    if (sender) senderName = shownName(sender as ProfileRow);
  }

  const L = {
    ar: {
      new_message: ["💬 رسالة جديدة", senderName ? `${senderName} أرسل لك رسالة` : "وصلتك رسالة جديدة"],
      voice_note: ["🎤 رسالة صوتية", senderName ? `${senderName} أرسل لك رسالة صوتية` : "وصلتك رسالة صوتية"],
      gift_received: ["🎁 هدية جديدة", senderName ? `${senderName} أرسل لك هدية` : "وصلتك هدية جديدة"],
      purchase_success: ["💎 تم الشراء", "تمت إضافة الجواهر إلى محفظتك"],
      fallback: ["DARKLINK", "عندك إشعار جديد"],
    },
    en: {
      new_message: ["💬 New message", senderName ? `${senderName} sent you a message` : "You have a new message"],
      voice_note: ["🎤 Voice note", senderName ? `${senderName} sent you a voice note` : "You have a new voice note"],
      gift_received: ["🎁 New gift", senderName ? `${senderName} sent you a gift` : "You received a gift"],
      purchase_success: ["💎 Purchase complete", "Gems were added to your wallet"],
      fallback: ["DARKLINK", "You have a new notification"],
    },
  }[lang];
  const [title, body] =
    (L as Record<string, string[]>)[notif.type] ?? L.fallback;

  const messages = tokens.map((t) => ({
    to: t.token,
    title,
    body,
    sound: "default",
    data: {
      type: notif.type,
      conversation_id: payload.conversation_id ?? null,
    },
  }));

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  });
  const out = await res.text();
  return json({ ok: true, sent: messages.length, expo: out.slice(0, 300) });
});
