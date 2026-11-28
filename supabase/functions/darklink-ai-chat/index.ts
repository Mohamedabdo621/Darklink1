// DARKLINK AI — محادثة المساعد الذكي (Edge Function)
// التدفق: JWT → ملكية المحادثة → الحد اليومي → السياق + قاعدة المعرفة
// → المزوّد الأول، وعند فشله المزوّد الثاني تلقائيًا → حفظ + عدّادات → الرد.
// قاعدة صارمة: لا يظهر اسم أي مزود للمستخدم أبدًا — كل رسائل الخطأ
// عربية عامة، والرد يرجع { reply, conversation_id, remaining_today } فقط.
// المفاتيح تُقرأ من Supabase Secrets فقط (Deno.env) — لا توجد في الكود.
import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    },
  });

// رسائل عربية عامة للمستخدم — بلا أي اسم مزود أو تفصيلة تقنية.
const ERR_AR = {
  noAuth: "سجّل دخولك الأول عشان تستخدم المساعد الذكي.",
  badRequest: "الرسالة مش واضحة، جرّب تبعتها تاني.",
  tooLong: "الرسالة طويلة أوي، اختصرها شوية.",
  forbidden: "المحادثة دي مش بتاعتك.",
  disabled: "المساعد الذكي متوقف مؤقتًا، جرّب بعد شوية.",
  dailyLimit: (limit: number) =>
    `وصلت للحد اليومي من الرسائل (${limit} رسالة)، جرّب بكرة 💜`,
  busy: "الخدمة مشغولة دلوقتي، جرّب بعد شوية 💜",
};

const ARABIC_DIACRITICS = "ًٌٍَُِّْـ";

// نفس تطبيع البوت: توحيد أشكال الحروف العربية + إزالة التشكيل.
function norm(s: string): string {
  let out = s.toLowerCase();
  for (const [a, b] of [["أ", "ا"], ["إ", "ا"], ["آ", "ا"], ["ة", "ه"],
    ["ى", "ي"], ["ؤ", "و"], ["ئ", "ي"]] as const) {
    out = out.split(a).join(b);
  }
  return [...out].filter((c) => !ARABIC_DIACRITICS.includes(c)).join("");
}

function kwMatches(kw: string, tokens: Set<string>, text: string): boolean {
  if (kw.includes(" ")) return text.includes(kw);
  if (/^[\x00-\x7F]+$/.test(kw)) return tokens.has(kw);
  for (const tok of tokens) if (tok.includes(kw)) return true;
  return false;
}

interface KbRow {
  topic: string;
  answer: string;
  keywords: string;
}

function pickKb(rows: KbRow[], userText: string, max = 2): KbRow[] {
  const n = norm(userText);
  const tokens = new Set(n.split(/[^\w\u0600-\u06FF]+/).filter(Boolean));
  const scored = rows.map((row) => {
    const kws = row.keywords.split(/\s+/).filter(Boolean);
    let score = 0;
    for (const kw of kws) if (kwMatches(norm(kw), tokens, n)) score++;
    return { row, score };
  }).filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.row);
  return scored;
}

function isArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "no_auth", error_ar: ERR_AR.noAuth }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) {
    return json({ error: "no_auth", error_ar: ERR_AR.noAuth }, 401);
  }

  const admin = createClient(url, service);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request", error_ar: ERR_AR.badRequest }, 400);
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const requestId = typeof body.request_id === "string" && body.request_id
    ? body.request_id
    : crypto.randomUUID();
  let conversationId = typeof body.conversation_id === "string"
    ? body.conversation_id
    : null;

  // ---- الإعدادات (من app_config — يغيّرها المدير بلا إعادة نشر) ----
  const { data: cfgRows } = await admin
    .from("app_config")
    .select("key, value")
    .like("key", "ai\_%");
  const cfg: Record<string, string> = {};
  for (const r of cfgRows ?? []) cfg[r.key] = r.value;

  if (cfg.ai_enabled !== "true") {
    return json({ error: "disabled", error_ar: ERR_AR.disabled }, 503);
  }
  const dailyLimit = Math.max(1, parseInt(cfg.ai_daily_limit_per_user ?? "30", 10) || 30);
  const maxInput = Math.max(100, parseInt(cfg.ai_max_input_chars ?? "2000", 10) || 2000);
  const maxOutput = Math.max(128, parseInt(cfg.ai_max_output_tokens ?? "1024", 10) || 1024);
  const systemPrompt = cfg.ai_system_prompt ??
    "أنت Darklink AI، المساعد الذكي الرسمي لمنصة DARKLINK.";
  const providerOrder = (cfg.ai_provider_order ?? "gemini,groq")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const models: Record<string, string> = {
    gemini: cfg.ai_model_gemini ?? "gemini-2.5-flash",
    groq: cfg.ai_model_groq ?? "openai/gpt-oss-20b",
  };

  if (!message) {
    return json({ error: "bad_request", error_ar: ERR_AR.badRequest }, 400);
  }
  if (message.length > maxInput) {
    return json({ error: "too_long", error_ar: ERR_AR.tooLong }, 400);
  }

  // ---- إعادة إرسال بنفس request_id: رجّع الرد المحفوظ بدل التكرار ----
  const { data: dup } = await admin
    .from("ai_messages")
    .select("conversation_id, content")
    .eq("request_id", requestId)
    .eq("role", "user")
    .maybeSingle();
  if (dup) {
    const { data: prevReply } = await admin
      .from("ai_messages")
      .select("content")
      .eq("conversation_id", dup.conversation_id)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prevReply) {
      return json({
        reply: prevReply.content,
        conversation_id: dup.conversation_id,
        remaining_today: null,
      });
    }
  }

  // ---- المحادثة: تحقق من الملكية أو أنشئ جديدة ----
  if (conversationId) {
    const { data: conv } = await admin
      .from("ai_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!conv) {
      return json({ error: "forbidden", error_ar: ERR_AR.forbidden }, 403);
    }
  } else {
    const { data: conv, error: convErr } = await admin
      .from("ai_conversations")
      .insert({ user_id: user.id, title: trunc(message, 60) })
      .select("id")
      .single();
    if (convErr || !conv) {
      return json({ error: "busy", error_ar: ERR_AR.busy }, 502);
    }
    conversationId = conv.id as string;
  }

  // ---- الحد اليومي للمستخدم ----
  const today = new Date().toISOString().slice(0, 10);
  const { data: usageRow } = await admin
    .from("ai_usage_daily")
    .select("message_count, input_tokens, output_tokens")
    .eq("user_id", user.id)
    .eq("usage_date", today)
    .maybeSingle();
  const usedToday = usageRow?.message_count ?? 0;
  if (usedToday >= dailyLimit) {
    return json(
      { error: "daily_limit", error_ar: ERR_AR.dailyLimit(dailyLimit) },
      429,
    );
  }

  // ---- السياق: آخر 10 رسائل ----
  const { data: history } = await admin
    .from("ai_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(10);
  const historyAsc = (history ?? []).reverse().map((m) => ({
    role: m.role as "user" | "assistant",
    content: trunc(m.content as string, 1000),
  }));

  // ---- قاعدة المعرفة: مطابقة كلمات مفتاحية (نفس منطق البوت) ----
  const lang = isArabic(message) ? "ar" : "en";
  const { data: kbRows } = await admin
    .from("ai_knowledge")
    .select("topic, answer, keywords")
    .eq("lang", lang)
    .eq("is_active", true);
  const kb = pickKb((kbRows ?? []) as KbRow[], message, 2);
  // بلا مطابقة: ثبّت إجابة الميزات كأرضية افتراضية حتى لا يخترع النموذج
  // ميزات غير موجودة (مثل محادثات جماعية) — مصدر واحد للحقيقة هو الجدول.
  let kbFinal = kb;
  if (kbFinal.length === 0) {
    const { data: feat } = await admin
      .from("ai_knowledge")
      .select("topic, answer, keywords")
      .eq("topic", "features")
      .eq("lang", lang)
      .eq("is_active", true)
      .maybeSingle();
    if (feat) kbFinal = [feat as KbRow];
  }
  const kbBlock = kbFinal.length
    ? "\n\nمعلومات من قاعدة معرفة التطبيق (استخدمها للإجابة، ولا تخترع غيرها):\n" +
      kbFinal.map((k) => `- [${k.topic}]: ${k.answer}`).join("\n")
    : "";
  const systemContent = systemPrompt + kbBlock;

  const chatMessages = [
    { role: "system", content: systemContent },
    ...historyAsc,
    { role: "user", content: message },
  ];

  // ---- استدعاء المزوّدين بالترتيب مع التبديل التلقائي ----
  const endpoints: Record<string, { url: string; keyEnv: string }> = {
    gemini: {
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      keyEnv: "GEMINI_API_KEY",
    },
    groq: {
      url: "https://api.groq.com/openai/v1/chat/completions",
      keyEnv: "GROQ_API_KEY",
    },
  };

  let replyText: string | null = null;
  let usedProvider: string | null = null;
  let usedModel: string | null = null;
  let promptTokens = 0;
  let completionTokens = 0;
  const failures: string[] = [];

  for (const provider of providerOrder) {
    const ep = endpoints[provider];
    if (!ep) continue;
    const apiKey = Deno.env.get(ep.keyEnv) ?? "";
    if (!apiKey) {
      failures.push(`${provider}: missing key`);
      continue;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(ep.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: models[provider],
          messages: chatMessages,
          temperature: 0.7,
          max_completion_tokens: maxOutput,
        }),
        signal: controller.signal,
      });
      const rawText = await res.text();
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(rawText) as Record<string, unknown>; } catch { /* غير JSON */ }
      if (res.ok) {
        const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
        const content = choices?.[0]?.message?.content?.trim() ?? "";
        if (content) {
          replyText = content;
          usedProvider = provider;
          usedModel = models[provider];
          const usage = data.usage as
            { prompt_tokens?: number; completion_tokens?: number } | undefined;
          promptTokens = usage?.prompt_tokens ?? Math.ceil(
            (systemContent.length + message.length) / 4,
          );
          completionTokens = usage?.completion_tokens ??
            Math.ceil(content.length / 4);
          break;
        }
        failures.push(`${provider}: empty reply`);
      } else {
        const errDetail = typeof data.error === "object" && data.error !== null
          ? JSON.stringify(data.error).slice(0, 300)
          : rawText.slice(0, 300);
        failures.push(`${provider}: http ${res.status} ${errDetail}`);
      }
    } catch (e) {
      failures.push(`${provider}: ${e instanceof Error ? e.name : "network"}`);
    } finally {
      clearTimeout(timer);
    }
  }

  // سجّل أي تبديل مزود داخليًا (للإدارة فقط) — بلا أسماء مزودين للمستخدم.
  if (failures.length > 0 && replyText) {
    await admin.from("error_logs").insert({
      user_id: user.id,
      message: "ai-chat: provider fallback",
      stack: failures.join("; ").slice(0, 1000),
      route: "darklink-ai-chat",
    }).then(() => undefined, () => undefined);
  }

  if (!replyText) {
    // سجّل الفشل داخليًا (للإدارة فقط) — والمستخدم ياخد رسالة عامة.
    await admin.from("error_logs").insert({
      user_id: user.id,
      message: "ai-chat: all providers failed",
      stack: failures.join("; ").slice(0, 1000),
      route: "darklink-ai-chat",
    }).then(() => undefined, () => undefined);
    return json({ error: "busy", error_ar: ERR_AR.busy }, 502);
  }

  // ---- الحفظ: رسالة المستخدم + رد المساعد (مع عدم التكرار) ----
  const { error: userMsgErr } = await admin
    .from("ai_messages")
    .insert({
      conversation_id: conversationId,
      user_id: user.id,
      role: "user",
      content: message,
      request_id: requestId,
    });
  if (userMsgErr) {
    // غالبًا سباق إعادة إرسال — الرد موجود أصلًا، رجّعه بلا تكرار.
    const { data: prevReply } = await admin
      .from("ai_messages")
      .select("content")
      .eq("conversation_id", conversationId)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prevReply) {
      return json({
        reply: prevReply.content,
        conversation_id: conversationId,
        remaining_today: Math.max(0, dailyLimit - usedToday),
      });
    }
  }
  await admin.from("ai_messages").insert({
    conversation_id: conversationId,
    user_id: user.id,
    role: "assistant",
    content: replyText,
    provider: usedProvider,
    model: usedModel,
    input_tokens: promptTokens,
    output_tokens: completionTokens,
  });

  // ---- العدّادات + تحديث المحادثة ----
  const newCount = usedToday + 1;
  const prevIn = (usageRow as { input_tokens?: number } | null)?.input_tokens ?? 0;
  const prevOut = (usageRow as { output_tokens?: number } | null)?.output_tokens ?? 0;
  await admin.from("ai_usage_daily").upsert(
    {
      user_id: user.id,
      usage_date: today,
      message_count: newCount,
      input_tokens: prevIn + promptTokens,
      output_tokens: prevOut + completionTokens,
    },
    { onConflict: "user_id,usage_date" },
  );
  const { data: provRow } = await admin
    .from("ai_provider_usage_daily")
    .select("request_count, input_tokens, output_tokens")
    .eq("provider", usedProvider)
    .eq("usage_date", today)
    .maybeSingle();
  await admin.from("ai_provider_usage_daily").upsert(
    {
      provider: usedProvider,
      usage_date: today,
      request_count: (provRow?.request_count ?? 0) + 1,
      input_tokens: (provRow?.input_tokens ?? 0) + promptTokens,
      output_tokens: (provRow?.output_tokens ?? 0) + completionTokens,
    },
    { onConflict: "provider,usage_date" },
  );
  await admin.from("ai_conversations").update({
    updated_at: new Date().toISOString(),
  }).eq("id", conversationId);

  return json({
    reply: replyText,
    conversation_id: conversationId,
    remaining_today: Math.max(0, dailyLimit - newCount),
  });
});
