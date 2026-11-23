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

## إعداد Supabase

1. افتح **SQL Editor** في لوحة Supabase ونفّذ الترحيلات بالترتيب:
   - `supabase/migrations/001_init.sql` (الجداول، `profiles`، `chalet_contacts` المحمي، منع التداخل بـ `btree_gist`، وRLS)
   - `supabase/migrations/002_phase2_lifecycle_and_payments.sql` (الباكتات الخاصة `verification-docs` و `payment-receipts` و `chalet-images`، ودوال RPC لثبات السيرفر ودورة حياة الحجز)
2. (اختياري) أنشئ أول حساب Admin بتحديث عمود `role` إلى `'admin'` في جدول `profiles` من لوحة Supabase مباشرة.
3. لنشر دالة إشعارات واتساب/الهاتف عند تغير حالة الحجز:
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
