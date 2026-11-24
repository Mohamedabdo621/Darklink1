-- إصلاح: باقات الجواهر اتزرعت مرتين (النشر التلقائي + تشغيل يدوي)
-- لأن gem_packages مكانتش عليها قيد فريد على name_key زي gifts.
-- 1) حذف التكرارات (نفس المحتوى، نبقي على نسخة واحدة من كل باقة)
delete from public.gem_packages a
using public.gem_packages b
where a.name_key = b.name_key
  and a.ctid > b.ctid;

-- 2) قيد فريد يمنع التكرار نهائيًا (ويفعّل on conflict في ملف البذرة)
alter table public.gem_packages
    add constraint gem_packages_name_key_key unique (name_key);
