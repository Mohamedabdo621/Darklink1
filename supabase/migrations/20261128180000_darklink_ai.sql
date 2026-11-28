-- ============================================================
-- DARKLINK AI — قاعدة البيانات (2026-11-28 — stage 1)
-- 5 جداول + RLS + مفاتيح app_config + بذرة قاعدة المعرفة
-- المزوّدون: Gemini أساسي + Groq احتياطي (لا يظهر اسم مزود
-- للمستخدمين أبدًا — القاعدة: الذكاء الاصطناعي يقدّم نفسه
-- باسم Darklink AI فقط).
-- ============================================================

-- ---------- المحادثات ----------
create table if not exists public.ai_conversations (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references public.profiles (id) on delete cascade,
    title      text not null default 'محادثة جديدة',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists ai_conversations_user_idx
    on public.ai_conversations (user_id, updated_at desc);

-- ---------- الرسائل ----------
create table if not exists public.ai_messages (
    id              uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
    user_id         uuid not null references public.profiles (id) on delete cascade,
    role            text not null check (role in ('user', 'assistant')),
    content         text not null check (char_length(content) <= 8000),
    provider        text,  -- داخلي فقط (اسم المزود) — لا يُرجَع للعميل أبدًا
    model           text,  -- داخلي فقط — لا يُرجَع للعميل أبدًا
    request_id      text unique,  -- عدم تكرار إعادة الإرسال (يولّده العميل)
    input_tokens    int,
    output_tokens   int,
    created_at      timestamptz not null default now()
);
create index if not exists ai_messages_conv_idx
    on public.ai_messages (conversation_id, created_at);
create index if not exists ai_messages_user_idx
    on public.ai_messages (user_id, created_at desc);

-- ---------- الاستهلاك اليومي لكل مستخدم ----------
create table if not exists public.ai_usage_daily (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references public.profiles (id) on delete cascade,
    usage_date    date not null default current_date,
    message_count int not null default 0,
    input_tokens  int not null default 0,
    output_tokens int not null default 0,
    unique (user_id, usage_date)
);
create index if not exists ai_usage_daily_date_idx
    on public.ai_usage_daily (usage_date);

-- ---------- الاستهلاك اليومي لكل مزود (القاطع العام) ----------
create table if not exists public.ai_provider_usage_daily (
    id            uuid primary key default gen_random_uuid(),
    provider      text not null,
    usage_date    date not null default current_date,
    request_count int not null default 0,
    input_tokens  int not null default 0,
    output_tokens int not null default 0,
    unique (provider, usage_date)
);

-- ---------- قاعدة المعرفة ----------
create table if not exists public.ai_knowledge (
    id         uuid primary key default gen_random_uuid(),
    topic      text not null,
    question   text,
    answer     text not null,
    keywords   text not null default '',
    lang       text not null default 'ar' check (lang in ('ar', 'en')),
    is_active  boolean not null default true,
    updated_at timestamptz not null default now(),
    unique (topic, lang)
);
create index if not exists ai_knowledge_topic_idx
    on public.ai_knowledge (topic, lang) where is_active;

-- ---------- RLS ----------
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_usage_daily enable row level security;
alter table public.ai_provider_usage_daily enable row level security;
alter table public.ai_knowledge enable row level security;

-- المحادثات: العميل يقرأ محادثاته فقط + يحذفها (الدالة تنشئ وتحدّث بـ service-role)
drop policy if exists ai_conversations_select_own on public.ai_conversations;
create policy ai_conversations_select_own on public.ai_conversations
    for select using (auth.uid() = user_id);
drop policy if exists ai_conversations_delete_own on public.ai_conversations;
create policy ai_conversations_delete_own on public.ai_conversations
    for delete using (auth.uid() = user_id);

-- الرسائل: قراءة فقط لمحادثات المستخدم (الكتابة من الدالة بـ service-role)
drop policy if exists ai_messages_select_own on public.ai_messages;
create policy ai_messages_select_own on public.ai_messages
    for select using (auth.uid() = user_id);

-- عدّاد المستخدم: قراءة فقط لصاحبه — لا إدخال/تعديل/حذف من العميل إطلاقًا
drop policy if exists ai_usage_daily_select_own on public.ai_usage_daily;
create policy ai_usage_daily_select_own on public.ai_usage_daily
    for select using (auth.uid() = user_id);

-- عدّاد المزوّدين وقاعدة المعرفة: بلا سياسات للعميل إطلاقًا
-- (تُقرأ/تُكتب من الدالة بـ service-role ومن RPCs آمنة للإدارة فقط)

-- ---------- مفاتيح app_config ----------
insert into public.app_config (key, value) values
    ('ai_enabled', 'true'),
    ('ai_provider_order', 'gemini,groq'),
    ('ai_model_gemini', 'gemini-3.5-flash-lite'), -- Lite: 500 طلب/يوم مجانًا (2.5-flash توقّف للمستخدمين الجدد؛ 3.8-flash 20/يوم فقط)
    ('ai_model_groq', 'openai/gpt-oss-20b'),
    ('ai_daily_limit_per_user', '30'),
    ('ai_max_input_chars', '2000'),
    ('ai_max_output_tokens', '1024'),
    ('ai_system_prompt', $ai$أنت Darklink AI، المساعد الذكي الرسمي لمنصة DARKLINK. تتكلم بالعربية (وخصوصًا اللهجة المصرية) وبالإنجليزية حسب لغة المستخدم. مهمتك مساعدة مستخدمي DARKLINK في كل ما يخص التطبيق: التسجيل، الشات، الهدايا، الجواهر، VIP، الأكواد، المجتمع، والدفع. التزم فقط بالمعلومات الموجودة في مقتطفات قاعدة المعرفة المرفقة مع كل سؤال؛ لا تخترع ميزة أو سعرًا أو سياسة غير موجودة فيها. إذا لم تعرف الإجابة، اعترف بذلك بصراحة ووجّه المستخدم للدعم (إنستجرام @darklink.app أو قناة التليجرام). لا تدّعِ أبدًا أنك موظف بشري. لا تطلب أبدًا كلمات مرور أو رموز تحقق أو أسرار دفع، ولا تنفّذ أي عملية مالية أو تغيير في الحساب من المحادثة. كن ودودًا ومحترمًا ومختصرًا. قدّم نفسك دائمًا باسم Darklink AI فقط.$ai$)
on conflict (key) do nothing;

-- ---------- admin_set_config: إضافة مفاتيح ai_* للقائمة المسموحة ----------
create or replace function public.admin_set_config(p_key text, p_value text)
returns void language plpgsql security definer set search_path = public as $$
begin
    if not public.is_admin() then raise exception 'forbidden'; end if;
    if p_key not in ('vodafone_cash_number', 'etisalat_cash_number',
                     'manual_bonus_pct', 'transfer_daily_cap',
                     'referral_reward', 'contest_prize_gems',
                     'vip_price_gems', 'vip_silver_price', 'vip_days',
                     'ai_enabled', 'ai_provider_order',
                     'ai_model_gemini', 'ai_model_groq',
                     'ai_daily_limit_per_user', 'ai_max_input_chars',
                     'ai_max_output_tokens', 'ai_system_prompt') then
        raise exception 'key_not_allowed';
    end if;
    insert into public.app_config (key, value) values (p_key, p_value)
    on conflict (key) do update set value = excluded.value;
end $$;

-- ---------- بذرة قاعدة المعرفة (من بوت تليجرام — بيانات حقيقية فقط) ----------
insert into public.ai_knowledge (topic, question, answer, keywords, lang) values
('launch', $kb$إمتى التطبيق هينزل؟$kb$,
 $kb$التطبيق هينزل يوم 1 ديسمبر 2026 🚀
وفي الوقت ده تقدر تجرّب نسخة الويب شغالة دلوقتي:
https://mohamedabdo621.github.io/Darklink1/
ولو عايز نبّهك أول ما الـ APK ينزل، دوس على 📥 تحميل التطبيق وبعدين 🔔 نبّهني لما ينزل.$kb$,
 'امتي متي ينزل موعد اطلاق هينزل launch release when', 'ar'),
('launch', $kb$When does the app launch?$kb$,
 $kb$DARKLINK launches on 1 December 2026 🚀
You can try the web version right now:
https://mohamedabdo621.github.io/Darklink1/
Tap 📥 Download, then 🔔 Notify me, and I'll message you as soon as the APK is out.$kb$,
 'امتي متي ينزل موعد اطلاق هينزل launch release when', 'en'),
('download', $kb$إزاي أحمّل التطبيق؟$kb$,
 $kb$تقدر تحمّل التطبيق كده:
📱 الـ APK هينزل يوم 1 ديسمبر — دوس 📥 تحميل التطبيق من القايمة، ولو لسه منزلش دوس 🔔 نبّهني لما ينزل وهنبعتلك.
🌐 ونسخة الويب شغالة دلوقتي من غير تحميل:
https://mohamedabdo621.github.io/Darklink1/$kb$,
 'تحميل حمل تنزيل apk download ويب متصفح رابط لينك website link web اونلاين', 'ar'),
('download', $kb$How do I download the app?$kb$,
 $kb$You can get DARKLINK here:
📱 The APK launches 1 December — tap 📥 Download in the menu, or 🔔 Notify me and I'll message you when it's out.
🌐 The web version works right now, no download needed:
https://mohamedabdo621.github.io/Darklink1/$kb$,
 'تحميل حمل تنزيل apk download ويب متصفح رابط لينك website link web اونلاين', 'en'),
('install', $kb$إزاي أثبّت التطبيق؟$kb$,
 $kb$عشان تثبّت التطبيق:
1) نزّل ملف الـ APK من هنا.
2) افتحه من موبايلك — لو طلب إذن «التثبيت من مصادر غير معروفة» فعّله.
3) دوس «تثبيت» وافتح التطبيق.
التطبيق مش على متجر جوجل لسه، فالـ APK هو طريقة التحميل الرسمية.$kb$,
 'تثبيت ثبت تثبت اثبت install setup', 'ar'),
('install', $kb$How do I install the app?$kb$,
 $kb$To install the app:
1) Download the APK from here.
2) Open it on your phone — if it asks for “install from unknown sources”, enable it.
3) Tap “Install” and open the app.
The app isn't on Google Play yet, so the APK is the official way to get it.$kb$,
 'تثبيت ثبت تثبت اثبت install setup', 'en'),
('vip', $kb$إيه اشتراك VIP؟$kb$,
 $kb$اشتراك VIP 👑 لمدة 30 يوم:
• فضي — 500 جوهرة
• ذهبي — 1000 جوهرة
الاشتراك من جوه التطبيق بالجواهر، وبيفتح مزايا حصرية.$kb$,
 'vip اشتراك ذهبي فضي', 'ar'),
('vip', $kb$What is VIP?$kb$,
 $kb$VIP 👑 for 30 days:
• Silver — 500 gems
• Gold — 1000 gems
Subscribe inside the app with gems.$kb$,
 'vip اشتراك ذهبي فضي', 'en'),
('prices', $kb$بكام الجواهر؟$kb$,
 $kb$باقات الجواهر 💎 (الدفع من جوه التطبيق):
• 100 جوهرة — 49 جنيه
• 500 جوهرة — 199 جنيه
• 1000 جوهرة — 349 جنيه
• 5000 جوهرة — 1499 جنيه
الدفع اليدوي عليه بونص 10% 🎁

وأسعار الهدايا بتبدأ من 10 جواهر (وردة) لحد 1000 جوهرة (صندوق الكنز) 👑$kb$,
 'بكام سعر اسعار جواهر باقه شراء اشتري price prices gems buy', 'ar'),
('prices', $kb$How much are gems?$kb$,
 $kb$Gem packs 💎 (pay inside the app):
• 100 gems — 49 EGP
• 500 gems — 199 EGP
• 1000 gems — 349 EGP
• 5000 gems — 1499 EGP
Manual payment gets a 10% bonus 🎁

Gifts start at 10 gems (rose) up to 1000 gems (treasure chest) 👑$kb$,
 'بكام سعر اسعار جواهر باقه شراء اشتري price prices gems buy', 'en'),
('codes', $kb$إيه أكواد الخصم؟$kb$,
 $kb$أكواد الهدايا 🎁:
• DARKLINK100 — 100 جوهرة (أول 100 استخدام)
• DARKLINKVIP — اشتراك VIP لمدة 30 يوم (أول 5 استخدامات)
الأكواد سارية لحد 31 ديسمبر.
عشان تستبدل كود: افتح التطبيق → تبويب المحفظة → استبدال، واكتب الكود هناك.$kb$,
 'كود اكواد خصم كوبون code promo coupon', 'ar'),
('codes', $kb$What are the gift codes?$kb$,
 $kb$Gift codes 🎁:
• DARKLINK100 — 100 gems (first 100 uses)
• DARKLINKVIP — 30 days of VIP (first 5 uses)
Valid until 31 December.
To redeem: open the app → Wallet tab → Redeem, and type the code there.$kb$,
 'كود اكواد خصم كوبون code promo coupon', 'en'),
('payment', $kb$إزاي أدفع؟$kb$,
 $kb$الدفع يدوي بفودافون كاش أو اتصالات كاش 💵
تطلب من جوه التطبيق وتدفع، وبعد التأكيد الجواهر بتنزل حسابك ومعاها بونص 10% 🎁$kb$,
 'دفع فودافون اتصالات كاش ادفع محفظه vodafone etisalat payment pay cash', 'ar'),
('payment', $kb$How do I pay?$kb$,
 $kb$Payment is manual with Vodafone Cash or Etisalat Cash 💵
Order inside the app and pay — once confirmed, the gems land in your account with a 10% bonus 🎁$kb$,
 'دفع فودافون اتصالات كاش ادفع محفظه vodafone etisalat payment pay cash', 'en'),
('gifts', $kb$إيه الهدايا المتاحة؟$kb$,
 $kb$الهدايا 🎁 (بالجواهر):
• وردة 10 • قلب 25 • دب 50 • نجمة 75 • جوهرة سحرية 100
• بلورة 150 • فانوس 150 • ألعاب نارية 200 • ماسة 250
• تاج 500 • صندوق الكنز 1000
كل هدية ليها أنيميشن خاصة بتشتغل لما تتبعت 💜$kb$,
 'هديه هدايا ورده تاج دب نجمه gift gifts rose crown', 'ar'),
('gifts', $kb$What gifts are available?$kb$,
 $kb$Gifts 🎁 (in gems):
• Rose 10 • Heart 25 • Teddy 50 • Star 75 • Magic gem 100
• Crystal 150 • Lantern 150 • Fireworks 200 • Diamond 250
• Crown 500 • Treasure chest 1000
Every gift has its own animation when sent 💜$kb$,
 'هديه هدايا ورده تاج دب نجمه gift gifts rose crown', 'en'),
('referral', $kb$إزاي أدعو صحابي؟$kb$,
 $kb$ادعُ صحابك واكسب 🤝
• صاحبك يسجّل بكود الدعوة بتاعك → تاخد 50 جوهرة فورًا
• وهو ياخد 25 جوهرة ترحيب
• بحد أقصى 10 مكافآت في اليوم
كود الدعوة بتلاقيه في صفحتك جوه التطبيق، والرابط بيشتغل من غير ما حد ينزّل حاجة الأول.$kb$,
 'ادعو ادعي دعي دعو صحاب احاله رابط الدعوه invite referral friend', 'ar'),
('referral', $kb$How do I invite friends?$kb$,
 $kb$Invite friends and earn 🤝
• A friend registers with your invite code → you get 50 gems instantly
• They get 25 welcome gems
• Max 10 rewards a day
Your invite code is on your profile inside the app.$kb$,
 'ادعو ادعي دعي دعو صحاب احاله رابط الدعوه invite referral friend', 'en'),
('signup', $kb$إزاي أعمل حساب؟$kb$,
 $kb$عشان تعمل حساب 📝:
1) افتح التطبيق وسجّل بإيميلك وكلمة سر.
2) كمّل بياناتك (تاريخ الميلاد — لازم يكون عمرك 16 سنة أو أكتر).
3) اختار هويتك: اسم مستعار مجهول 👻 أو هويتك العامة.
كل حساب ليه كود عام (حرف-رقم زي A-1) تقدر تشاركه مع صحابك.$kb$,
 'تسجيل حساب ايميل انشاء سجل register signup account email login sign', 'ar'),
('signup', $kb$How do I create an account?$kb$,
 $kb$To create an account 📝:
1) Open the app and sign up with your email and a password.
2) Complete your profile (birthdate — you must be 16 or older).
3) Choose your identity: an anonymous nickname 👻 or your public identity.
Every account has a public code (like A-1) you can share with friends.$kb$,
 'تسجيل حساب ايميل انشاء سجل register signup account email login sign', 'en'),
('age', $kb$التطبيق من سن كام؟$kb$,
 $kb$التطبيق للي عمرهم 16 سنة أو أكتر — تاريخ الميلاد بيتسأل عنه أول ما تسجّل، ولو أقل من 16 مش هتقدر تكمّل التسجيل.$kb$,
 'سن عمر قاصر age old', 'ar'),
('age', $kb$What age is the app for?$kb$,
 $kb$DARKLINK is for ages 16 and up — your birthdate is asked when you register, and under-16 accounts can't finish signing up.$kb$,
 'سن عمر قاصر age old', 'en'),
('privacy', $kb$إزاي أحافظ على خصوصيتي؟$kb$,
 $kb$خصوصيتك بإيدك 👻
تقدر تظهر باسم مستعار من غير ما حد يعرفك، أو بهويتك العامة — وتقدر تحظر أي حد أو تبلّغ عنه في أي وقت، والحظر بيتطبق في الشات والاكتشاف والهدايا.$kb$,
 'مجهول خصوصيه مستعار anonymous privacy private', 'ar'),
('privacy', $kb$How do I stay private?$kb$,
 $kb$Your privacy is yours 👻
Show up with a nickname no one can trace, or with your public identity — and you can block or report anyone at any time; blocks apply in chat, Discover and gifts.$kb$,
 'مجهول خصوصيه مستعار anonymous privacy private', 'en'),
('community', $kb$إيه قسم المجتمع؟$kb$,
 $kb$المجتمع 🌌:
• بوستات (نص + صورة أو فيديو أو فويس) لحد 10 في اليوم
• استطلاعات تصويت — صوّت وغيّر صوتك
• إعادة نشر، حفظ، منشن @ وهاشتاج #
• تثبيت بوست في صفحتك
• تبويبات: الكل / أصدقائي / الرائج / محفوظ
• شريط «الأكثر تفاعلًا اليوم»
كل ده جوه التطبيق في تبويب المجتمع.$kb$,
 'مجتمع بوست منشور استطلاع تايم لاين تايملاين community post poll timeline feed', 'ar'),
('community', $kb$What is the Community section?$kb$,
 $kb$Community 🌌:
• Posts (text + photo, video or voice), up to 10 a day
• Polls — vote and change your vote
• Repost, save, @mentions and #hashtags
• Pin a post on your profile
• Tabs: All / Friends / Trending / Saved
• A “most-liked today” strip
All inside the app, in the Community tab.$kb$,
 'مجتمع بوست منشور استطلاع تايم لاين تايملاين community post poll timeline feed', 'en'),
('daily', $kb$إيه المكافأة اليومية؟$kb$,
 $kb$المكافأة اليومية 🎁:
• ادخل كل يوم واستلم مكافأتك من الصفحة الرئيسية
• مهام يومية: ابعت 10 رسايل → 5 جواهر، ابعت هدية → 8 جواهر
• وفيه مهام أسبوعية كمان — كل ده بيزوّد مستواك (XP) 🏆$kb$,
 'مكافاه يوميه مهام مهمه daily reward tasks', 'ar'),
('daily', $kb$What is the daily reward?$kb$,
 $kb$Daily reward 🎁:
• Come back every day and claim your reward from Home
• Daily tasks: send 10 messages → 5 gems, send a gift → 8 gems
• Weekly tasks too — all of it raises your level (XP) 🏆$kb$,
 'مكافاه يوميه مهام مهمه daily reward tasks', 'en'),
('features', $kb$إيه مميزات التطبيق؟$kb$,
 $kb$في DARKLINK تقدر:
💬 تشات فوري مع رسايل صوتية
🎁 تبعت هدايا
💎 تجمع جواهر وتشتري بيها
👑 تشترك VIP
👻 تظهر بهوية مجهولة باسم مستعار أو بهويتك العامة
📖 ستوري ومهام يومية ومكافآت$kb$,
 'مميزات ايه فيه مميز features what', 'ar'),
('features', $kb$What features does the app have?$kb$,
 $kb$In DARKLINK you can:
💬 Instant chat with voice notes
🎁 Send gifts
💎 Collect gems and spend them
👑 Subscribe to VIP
👻 Show up anonymous with a nickname or as yourself
📖 Stories, daily tasks and rewards$kb$,
 'مميزات ايه فيه مميز features what', 'en'),
('free', $kb$التطبيق مجاني؟$kb$,
 $kb$أيوه، التطبيق مجاني 🎉
التسجيل والشات ببلاش. الهدايا بتتبعت بالجواهر (أرخص هدية 10 جواهر)، والجواهر نفسها تقدر تكسبها ببلاش من المكافأة اليومية والمهام — وفيه VIP اختياري للي عايز مزايا زيادة.$kb$,
 'مجاني ببلاش فلوس مجانا free', 'ar'),
('free', $kb$Is the app free?$kb$,
 $kb$Yes, the app is free 🎉
Signing up and chatting are free. Gifts are sent with gems (the cheapest gift is 10 gems), and you can earn gems for free from the daily reward and quests — VIP is optional for extra perks.$kb$,
 'مجاني ببلاش فلوس مجانا free', 'en'),
('block', $kb$حد بيضايقني، أعمل إيه؟$kb$,
 $kb$لو حد ضايقك:
• من الشات أو البروفايل دوس على القايمة (⋮) واختار «حظر» — مش هيقدر يكلمك ولا يشوفك في الاكتشاف ولا يبعتلك هدايا
• ولو بوست مخالف، بلّغ عنه من قايمة البوست — 5 بلاغات والبوست بيتخفى تلقائيًا
• ولو محتاج مساعدة من الإدارة، اكتب هنا أو على إنستجرام @darklink.app$kb$,
 'حظر بلاغ ابلاغ ازعاج بلوك ضايق block report abuse harass', 'ar'),
('block', $kb$Someone is bothering me, what do I do?$kb$,
 $kb$If someone bothers you:
• From their chat or profile, open the menu (⋮) and tap “Block” — they can't message you, find you in Discover, or send you gifts
• To report a bad post, use the post menu — 5 reports hide it automatically
• For help from the team, write here or on Instagram @darklink.app$kb$,
 'حظر بلاغ ابلاغ ازعاج بلوك ضايق block report abuse harass', 'en'),
('support', $kb$عندي مشكلة في التطبيق$kb$,
 $kb$لو عندك مشكلة في التطبيق:
1) اكتبلي هنا إيه اللي حصل بالظبط وهنساعدك
2) أو ابعت على إنستجرام @darklink.app
3) أو في القناة https://t.me/darklink_app
ولو المشكلة في التحميل أو التثبيت، دوس ❓ أسئلة شائعة من القايمة.$kb$,
 'دعم مساعده مشكله عطل مش شغال support help problem issue bug error', 'ar'),
('support', $kb$I have a problem with the app$kb$,
 $kb$If something's wrong with the app:
1) Tell me here exactly what happened and we'll help
2) Or message Instagram @darklink.app
3) Or the channel https://t.me/darklink_app
For download/install problems, tap ❓ FAQ in the menu.$kb$,
 'دعم مساعده مشكله عطل مش شغال support help problem issue bug error', 'en'),
('links', $kb$فين قناتكم وصفحاتكم؟$kb$,
 $kb$تابعنا هنا 👇
• القناة: https://t.me/darklink_app
• إنستجرام: https://www.instagram.com/darklink.app
• نسخة الويب: https://mohamedabdo621.github.io/Darklink1/$kb$,
 'انستجرام قناه تليجرام instagram channel telegram تواصل social', 'ar'),
('links', $kb$Where are your channel and pages?$kb$,
 $kb$Follow us 👇
• Channel: https://t.me/darklink_app
• Instagram: https://www.instagram.com/darklink.app
• Web version: https://mohamedabdo621.github.io/Darklink1/$kb$,
 'انستجرام قناه تليجرام instagram channel telegram تواصل social', 'en'),
('greeting', $kb$أهلاً$kb$,
 $kb$أهلاً بيك في DARKLINK 🌌

اتعرّف على ناس جديدة — بهويتك أو من غيرها 💜
شات فوري، هدايا، جواهر، وVIP... كل ده في مكان واحد.

التطبيق هينزل يوم 1 ديسمبر 🚀$kb$,
 'سلام مرحبا هاي اهلا صباح مساء hello hi hey', 'ar'),
('greeting', $kb$Hello$kb$,
 $kb$Welcome to DARKLINK 🌌

Meet new people — as yourself or anonymously 💜
Instant chat, gifts, gems and VIP... all in one place.

The app launches on 1 December 🚀$kb$,
 'سلام مرحبا هاي اهلا صباح مساء hello hi hey', 'en'),
('thanks', $kb$شكرًا$kb$,
 $kb$العفو 💜 أي سؤال تاني أنا موجود 🌌$kb$,
 'شكرا thanks thank thx', 'ar'),
('thanks', $kb$Thank you$kb$,
 $kb$You're welcome 💜 Ask me anything else 🌌$kb$,
 'شكرا thanks thank thx', 'en')
on conflict (topic, lang) do nothing;
