-- DARKLINK — صفحة إكمال البيانات بعد التسجيل (v1.6.0)
-- تاريخ الميلاد (بيتحسب منه العمر + بوابة 16+) والجنس (اختياري)
alter table public.profiles
  add column if not exists birthdate date,
  add column if not exists gender text
    check (gender is null or gender in ('male', 'female', 'prefer_not_to_say'));
