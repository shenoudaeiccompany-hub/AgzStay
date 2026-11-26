# AgzStay — إجازة ستاي

منصة مصرية متكاملة بواجهة عربية (`RTL`) لحجز الشقق المفروشة والشاليهات والفيلات مباشرة من الملاك الموثقين والوسطاء المعتمدين — مع تسعير يومي وأسبوعي وشهري شفاف، تقويم توافر حقيقي يمنع الحجز المزدوج، دورة دفع عربون كاملة بإيصالات موثقة، وتطبيق PWA وتطبيق أندرويد.

---

## التقنيات المستخدمة

- **الواجهة الأمامية:** React 18 + TypeScript + Vite + Tailwind CSS + Lucide React + Leaflet
- **الخادم وقاعدة البيانات:** Supabase (PostgreSQL + `btree_gist` + RLS + RPCs + Storage + Realtime + Edge Functions)
- **التخزين والوسائط:** ضغط تلقائي للصور في المتصفح بصيغة WebP (`<= 1600px`، جودة `0.8`) مع `srcset`، وباكتات خاصة للمستندات والإيصالات بـ Signed URLs
- **الـ PWA وSEO:** Service Worker ذكي (`network-first` للتنقل مع `offline.html`، `cache-first` للـ `/assets/`) + Serverless Meta/Sitemap لـ Vercel
- **الاختبارات والتحقق:** Vitest + ESLint + TypeScript + GitHub Actions CI
- **تطبيق أندرويد (`/app`):** WebView محصّن يخدم نسخة الـ Web المبنية (`dist/`) مع `MIXED_CONTENT_NEVER_ALLOW` وProGuard/R8

---

## التشغيل المحلي (Local Development)

```bash
npm install
cp .env.example .env
# أضف مفاتيح VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY داخل .env
npm run dev
```

### متغيرات البيئة (`.env`)

راجع ملف `.env.example`:
- `VITE_SUPABASE_URL` — رابط مشروع Supabase
- `VITE_SUPABASE_ANON_KEY` — المفتاح العام `anon` (مسموح بالواجهة مع RLS)
- `SUPABASE_URL` و `SUPABASE_ANON_KEY` — (على Vercel Serverless لـ `/api/chalet-meta` و `/api/sitemap.xml`)
- `VITE_PUBLIC_SITE_URL` / `SITE_URL` — الدومين الإنتاجي (مثل `https://agzstay.vercel.app`)
- **تنبيه أمان:** لا تضع أبداً مفتاح `service_role` في الكود أو في متصفح العميل أو في المستودع.

---

## إعداد Supabase والأمان

1. افتح **SQL Editor** في لوحة Supabase ونفّذ الترحيلات بالترتيب من `001` حتى `008`:
   - `001`–`005`: الجداول الأساسية، الباقات، نظام الحجز، الإعلانات، والتخزين.
   - `supabase/migrations/006_secure_v2.sql`: إغلاق الثغرات الأمنية (`SECURITY INVOKER` + `set search_path = ''`، عزل `owner_phone` في `chalet_contacts`، كشف الرقم المحدود بـ `reveal_listing_contact()`، حصر الاشتراكات عبر `request_subscription` و`admin_review_subscription`، قفل باكت `receipts`، وحماية صلاحية `admin`).
   - `supabase/migrations/007_maintenance_and_legacy_triggers_fix.sql`: إصلاح تريجرات `002`/`003` القديمة، وإضافة دوال الصيانة المجدولة (`expire_subscriptions()`، `purge_contact_reveals()`) ودالة ربط الإعلانات القديمة (`admin_link_legacy_owner(p_user_id, p_phone)`).
   - `supabase/migrations/008_verification_reports_and_stats.sql`: تفعيل نظام توثيق الملاك وشارة «معلن موثق» (`verifications` + `submit_owner_verification` + `admin_review_owner_verification`)، وإحصائيات كشف الرقم المجمّعة للمعلن (`get_owner_contact_reveal_stats`)، ونظام البلاغات عن الوحدات المخالفة (`submit_listing_report` + `admin_review_listing_report`).
2. لتعيين حساب مدير من **SQL Editor** (مرتبط بالمشروع الصحيح):
   ```sql
   update public.profiles
      set role = 'admin'
    where id = (select id from auth.users where email = 'you@example.com');
   ```
3. للجدولة الاختيارية (`pg_cron` من `Database → Extensions`):
   - `select cron.schedule('agzstay-expire-subscriptions', '0 * * * *', $$ select public.expire_subscriptions(); $$);`
   - `select cron.schedule('agzstay-purge-reveals', '30 3 * * *', $$ select public.purge_contact_reveals(); $$);`
4. الاختبارات الأمنية: `supabase/tests/006_secure_v2.test.sql` (pgTAP) + `npm test`.
5. لنشر دالة إشعارات واتساب/الهاتف عند تغير حالة الحجز:
   ```bash
   supabase functions deploy notify-whatsapp
   ```


---

## الأوامر الأساسية والاختبارات

```bash
npm run typecheck   # فحص TypeScript
npm run lint        # فحص ESLint
npm run test        # تشغيل اختبارات Vitest
npm run build       # بناء نسخة الإنتاج في dist/
```

---

## النشر والتحديث على Vercel

- **النشر التلقائي (الموصى به):** بعد ربط مستودع GitHub بمشروع Vercel وتضمين متغيرات البيئة (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`) في **Settings → Environment Variables**:
  ```bash
  git add .
  git commit -m "وصف التحديث"
  git push origin main
  ```
  سيبدأ Vercel تلقائياً بناء التحديث الجديد ونشره خلال ثوانٍ.
- **النشر المباشر عبر Vercel CLI:**
  ```bash
  npm i -g vercel
  vercel --prod
  ```
- يوجّه ملف `vercel.json` محركات البحث وبرامج المعاينة (WhatsApp / Facebook / Telegram) لروابط `/chalet/:id` إلى دالة `/api/chalet-meta` لتوليد Open Graph Tags وJSON-LD تلقائياً، كما يوفّر `/sitemap.xml` عبر `/api/sitemap.xml`.

---

## إعداد مفتاح توقيع أندرويد للإصدار (Release Keystore)

> **تحذير مهم:** لا تستخدم أبداً `debug.keystore` لنشر نسخة المتجر على Google Play، ولا ترفع ملفات `*.jks` أو `*.keystore` أو كلمات المرور إلى Git.

1. أنشئ ملف مفتاح التوقيع الحقيقي (`.jks`) خارج مجلد المشروع (مثلاً في `~/keystores/`):
   ```bash
   keytool -genkeypair -v \
     -keystore ~/keystores/agzstay-release.jks \
     -alias agzstay_release \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
2. احتفظ بنسخة احتياطية آمنة ومشفّرة من ملف `.jks` وكلمات المرور + `keyAlias` في مدير كلمات مرور موثوق أو خزنة آمنة (فقدانه يمنعك من تحديث التطبيق مستقبلاً على Google Play — مع تفعيل Play App Signing على Play Console كحماية إضافية).
3. عند بناء AAB للنشر الفعلي، مرّر بيانات التوقيع عبر متغيرات البيئة في بيئة البناء الآمنة أو Play App Signing دون حفظ كلمات المرور في الكود المصدري.
