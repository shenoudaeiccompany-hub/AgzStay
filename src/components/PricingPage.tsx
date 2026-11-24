import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Crown,
  Lock,
  Mail,
  Phone,
  RefreshCw,
  Sparkles,
  Upload,
  User,
  Wallet,
} from 'lucide-react';
import { formatEGP } from '@/data/chalets';
import { SUBSCRIPTION_PLANS } from '@/data/subscriptions';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  fetchMyProfile,
  fetchPlansFromDb,
  getCurrentAuthUser,
  onAuthStateChange,
  signInWithEmailPassword,
  signUpOwnerAccount,
  submitSubscriptionRequestRpc,
  uploadSubscriptionReceiptFile,
} from '@/services/agzstayRepository';
import type {
  AdvertiserTypeCode,
  AuthUserSummary,
  RouteSection,
  SubscriptionPlan,
  UserProfile,
} from '@/types/chalet';

interface PricingPageProps {
  onNavigate: (section: RouteSection) => void;
  onSubscriptionSubmitted?: () => void;
}

const ADMIN_WALLET_INFO =
  (import.meta.env.VITE_SUBSCRIPTION_WALLET as string | undefined)?.trim() || '';

export function PricingPage({ onNavigate, onSubscriptionSubmitted }: PricingPageProps) {
  const [plans, setPlans] = useState<SubscriptionPlan[]>(SUBSCRIPTION_PLANS);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);

  const [authUser, setAuthUser] = useState<AuthUserSummary | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Inline Supabase Auth state when user wants to subscribe while logged out
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [authAdvType, setAuthAdvType] = useState<AdvertiserTypeCode>('owner');
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState('');

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [walletCopied, setWalletCopied] = useState(false);

  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const [plansRes, user] = await Promise.all([fetchPlansFromDb(), getCurrentAuthUser()]);
        if (!active) return;
        if (plansRes.data && plansRes.data.length > 0) {
          setPlans(plansRes.data);
        }
        setAuthUser(user);
        if (user) {
          const profRes = await fetchMyProfile();
          if (active && profRes.data) setProfile(profRes.data);
        }
      } finally {
        if (active) setLoadingPlans(false);
      }
    };
    void init();

    const unsubscribe = onAuthStateChange((user) => {
      setAuthUser(user);
      if (user) {
        void fetchMyProfile().then((res) => {
          if (res.data) setProfile(res.data);
        });
      } else {
        setProfile(null);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    setErrorMsg('');
    setSuccessMsg('');
    if (plan.id === 'free' || plan.price === 0) {
      onNavigate('owner');
      return;
    }
    setSelectedPlan(plan);
    window.setTimeout(() => {
      document.getElementById('subscription-checkout-box')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 60);
  };

  const handleCopyWallet = async () => {
    if (!ADMIN_WALLET_INFO) return;
    try {
      await navigator.clipboard?.writeText(ADMIN_WALLET_INFO);
      setWalletCopied(true);
      window.setTimeout(() => setWalletCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleInlineAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setAuthMessage('');
    setAuthLoading(true);
    try {
      if (authMode === 'login') {
        const res = await signInWithEmailPassword(authEmail, authPassword);
        if (res.error || !res.data) {
          setErrorMsg(res.error ?? 'تعذر تسجيل الدخول.');
          return;
        }
        setAuthUser(res.data);
        const prof = await fetchMyProfile();
        if (prof.data) setProfile(prof.data);
      } else {
        if (authName.trim().length < 3) {
          setErrorMsg('يرجى إدخال الاسم ثلاثياً على الأقل.');
          return;
        }
        const res = await signUpOwnerAccount({
          email: authEmail,
          password: authPassword,
          name: authName,
          phone: authPhone,
          advertiserType: authAdvType,
        });
        if (res.error || !res.data) {
          setErrorMsg(res.error ?? 'تعذر إنشاء الحساب.');
          return;
        }
        if (res.data.needsEmailConfirmation) {
          setAuthMessage(
            'تم إنشاء الحساب! يرجى تأكيد بريدك الإلكتروني عبر الرابط المرسل إليك ثم تسجيل الدخول لإرسال الإيصال.'
          );
          setAuthMode('login');
          return;
        }
        setAuthUser(res.data.user);
        const prof = await fetchMyProfile();
        if (prof.data) setProfile(prof.data);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;

    if (!authUser) {
      setErrorMsg('يجب تسجيل الدخول أولاً لإرسال طلب الاشتراك.');
      return;
    }
    if (!receiptFile) {
      setErrorMsg('يرجى إرفاق صورة إيصال التحويل لتأكيد طلب الاشتراك.');
      return;
    }
    if (!isSupabaseConfigured) {
      setErrorMsg('قاعدة البيانات غير مضبوطة في هذه البيئة لإتمام رفع الإيصال.');
      return;
    }

    setErrorMsg('');
    setSubmitting(true);
    try {
      const uploadRes = await uploadSubscriptionReceiptFile(receiptFile);
      if (uploadRes.error || !uploadRes.data) {
        setErrorMsg(uploadRes.error ?? 'تعذر رفع صورة الإيصال.');
        return;
      }

      const subRes = await submitSubscriptionRequestRpc(selectedPlan.id, uploadRes.data.path);
      if (subRes.error) {
        setErrorMsg(subRes.error);
        return;
      }

      setSuccessMsg(
        `تم استلام طلب اشتراكك في "${selectedPlan.name}" بنجاح! سيقوم الأدمن بمراجعة الإيصال وتفعيل الباقة وظهور شارة "إعلان مميز" على وحداتك قريباً.`
      );
      setReceiptFile(null);
      onSubscriptionSubmitted?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200/70 bg-white px-4 py-1 text-xs font-semibold text-[#1E3A5F] shadow-xs">
          <Crown className="h-3.5 w-3.5 text-[#C5A880]" />
          باقات الإعلان للملاك والمكاتب العقارية
        </span>
        <h1 className="mt-4 text-2xl font-bold text-[#1E3A5F] sm:text-4xl">
          خطط واضحة تناسب حجم وحداتك
        </h1>
        <p className="mt-2.5 text-sm leading-relaxed text-[#6B7280] sm:text-base">
          ابدأ بإعلان واحد مجاناً، أو اختر الباقة المناسبة لنشر حتى ٢٠ وحدة مع شارة &ldquo;إعلان مميز&rdquo; وأولوية ظهور.
        </p>
      </div>

      {/* 4 Minimalist Package Cards */}
      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const isPro = plan.id === 'pro';
          const isSelected = selectedPlan?.id === plan.id;
          return (
            <div
              key={plan.id}
              className={`flex flex-col rounded-2xl border bg-white p-6 shadow-xs transition hover:shadow-sm ${
                isSelected
                  ? 'border-[#1E3A5F] ring-2 ring-[#1E3A5F]/15'
                  : isPro
                  ? 'border-[#C5A880]'
                  : 'border-stone-200/70'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                    isPro
                      ? 'bg-[#C5A880] text-[#1F2937]'
                      : 'border border-stone-200/70 bg-[#FAF9F6] text-[#1E3A5F]'
                  }`}
                >
                  {plan.badge}
                </span>
                {plan.isFeaturedEligible && <Sparkles className="h-4 w-4 text-[#C5A880]" />}
              </div>

              <h2 className="mt-4 text-lg font-bold text-[#1F2937]">{plan.name}</h2>

              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-[#1E3A5F]">
                  {plan.price === 0 ? '٠ ج.م' : formatEGP(plan.price)}
                </span>
                {plan.price > 0 && <span className="text-xs text-[#6B7280]">/ شهرياً</span>}
              </div>

              <div className="mt-4 rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3.5 py-2.5 text-xs font-bold text-[#1E3A5F]">
                الحد الأقصى: {plan.maxUnits.toLocaleString('ar-EG')}{' '}
                {plan.maxUnits === 1 ? 'إعلان' : 'إعلانات'}
              </div>

              <ul className="mt-5 flex-1 space-y-3 text-xs text-[#6B7280]">
                {plan.features.map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span className="leading-relaxed">{feat}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                disabled={loadingPlans}
                onClick={() => handleSelectPlan(plan)}
                className={`mt-6 min-h-[44px] w-full rounded-xl px-4 py-2.5 text-xs font-bold shadow-xs transition disabled:opacity-60 ${
                  plan.price === 0
                    ? 'border border-[#1E3A5F] bg-white text-[#1E3A5F] hover:bg-[#FAF9F6]'
                    : isPro || isSelected
                    ? 'bg-[#1E3A5F] text-white hover:bg-[#172E4D]'
                    : 'bg-[#C5A880] text-[#1F2937] hover:bg-[#b5976d]'
                }`}
              >
                {plan.price === 0 ? 'ابدأ النشر مجاناً' : 'اشترك في هذه الباقة'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Clean Comparison Strip */}
      <section className="mt-10 overflow-hidden rounded-2xl border border-stone-200/70 bg-white shadow-xs">
        <div className="border-b border-stone-200/70 bg-[#FAF9F6] px-6 py-4">
          <h2 className="text-sm font-bold text-[#1E3A5F]">مقارنة سريعة بين الباقات</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] text-right text-xs">
            <thead className="border-b border-stone-200/70 text-[#6B7280]">
              <tr>
                <th className="px-6 py-3.5 font-semibold">الميزة</th>
                {plans.map((p) => (
                  <th key={p.id} className="px-4 py-3.5 font-bold text-[#1E3A5F]">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200/70 text-[#1F2937]">
              <tr>
                <td className="px-6 py-3.5 font-semibold text-[#6B7280]">قيمة الاشتراك</td>
                {plans.map((p) => (
                  <td key={p.id} className="px-4 py-3.5 font-bold text-[#1E3A5F]">
                    {p.price === 0 ? 'مجاناً (٠ ج.م)' : formatEGP(p.price)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-6 py-3.5 font-semibold text-[#6B7280]">عدد الإعلانات المتاح</td>
                {plans.map((p) => (
                  <td key={p.id} className="px-4 py-3.5 font-semibold">
                    {p.maxUnits.toLocaleString('ar-EG')} {p.maxUnits === 1 ? 'إعلان' : 'إعلانات'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-6 py-3.5 font-semibold text-[#6B7280]">شارة إعلان مميز</td>
                {plans.map((p) => (
                  <td key={p.id} className="px-4 py-3.5">
                    {p.isFeaturedEligible ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                        <Check className="h-4 w-4" /> مفعّلة
                      </span>
                    ) : (
                      <span className="text-[#6B7280]">غير مشمولة</span>
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-6 py-3.5 font-semibold text-[#6B7280]">أولوية الظهور</td>
                {plans.map((p) => (
                  <td key={p.id} className="px-4 py-3.5 text-[#6B7280]">
                    {p.priorityLabel}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Paid Plan Checkout & Receipt Upload */}
      {selectedPlan && selectedPlan.price > 0 && (
        <section
          id="subscription-checkout-box"
          className="mx-auto mt-10 max-w-2xl rounded-2xl border border-[#C5A880] bg-white p-6 shadow-xs sm:p-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200/70 pb-4">
            <div>
              <h2 className="text-lg font-bold text-[#1E3A5F]">
                تفعيل {selectedPlan.name} ({formatEGP(selectedPlan.price)})
              </h2>
              <p className="mt-1 text-xs text-[#6B7280]">
                حوّل قيمة الباقة ثم ارفع صورة الإيصال ليتم تفعيل باقتك وميزة الإعلان المميز.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPlan(null)}
              className="text-xs font-semibold text-[#6B7280] hover:text-[#1F2937]"
            >
              تغيير الباقة
            </button>
          </div>

          <div className="mt-5 rounded-2xl border border-stone-200/70 bg-[#FAF9F6] p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#1E3A5F]">
              <Wallet className="h-4 w-4 text-[#C5A880]" />
              <span>بيانات التحويل الرسمية (إنستاباي / محفظة إلكترونية)</span>
            </div>

            {ADMIN_WALLET_INFO ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200/70 bg-white px-3.5 py-2.5">
                <span className="font-mono text-sm font-bold text-[#1E3A5F]" dir="ltr">
                  {ADMIN_WALLET_INFO}
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopyWallet()}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#FAF9F6] px-3 py-1 text-xs font-semibold text-[#1E3A5F] hover:bg-stone-100"
                >
                  {walletCopied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span>تم النسخ</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>نسخ</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  لم يتم ضبط بيانات المحفظة في إعدادات البيئة (VITE_SUBSCRIPTION_WALLET). تواصل مع الإدارة للحصول على رقم التحويل قبل إرسال الإيصال.
                </span>
              </div>
            )}
          </div>

          {successMsg ? (
            <div className="mt-6 space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
              <p className="text-sm font-bold text-emerald-900">{successMsg}</p>
              <button
                type="button"
                onClick={() => onNavigate('owner')}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#1E3A5F] px-5 py-2 text-xs font-bold text-white hover:bg-[#172E4D]"
              >
                <Building2 className="h-4 w-4" />
                <span>الانتقال إلى بوابة المعلن</span>
              </button>
            </div>
          ) : !authUser ? (
            <div className="mt-6 rounded-2xl border border-stone-200/70 bg-[#FAF9F6] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[#1E3A5F]">
                  سجّل دخولك أولاً لإتمام طلب الاشتراك
                </h3>
                <div className="flex rounded-xl border border-stone-200/70 bg-white p-1 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setErrorMsg('');
                    }}
                    className={`rounded-lg px-3 py-1 transition ${
                      authMode === 'login' ? 'bg-[#1E3A5F] text-white' : 'text-[#6B7280]'
                    }`}
                  >
                    تسجيل الدخول
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('signup');
                      setErrorMsg('');
                    }}
                    className={`rounded-lg px-3 py-1 transition ${
                      authMode === 'signup' ? 'bg-[#1E3A5F] text-white' : 'text-[#6B7280]'
                    }`}
                  >
                    حساب جديد
                  </button>
                </div>
              </div>

              {authMessage && (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
                  {authMessage}
                </div>
              )}

              <form onSubmit={handleInlineAuthSubmit} className="mt-4 space-y-3">
                {authMode === 'signup' && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#6B7280]">
                        الاسم / اسم المكتب
                      </label>
                      <div className="relative">
                        <User className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          required
                          value={authName}
                          onChange={(e) => setAuthName(e.target.value)}
                          placeholder="أ. كريم عبد الله"
                          className="h-10 w-full rounded-xl border border-stone-200/70 bg-white pl-3 pr-9 text-xs text-[#1F2937]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#6B7280]">
                        رقم الهاتف (واتساب)
                      </label>
                      <div className="relative">
                        <Phone className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="tel"
                          required
                          dir="ltr"
                          value={authPhone}
                          onChange={(e) => setAuthPhone(e.target.value)}
                          placeholder="01012345678"
                          className="h-10 w-full rounded-xl border border-stone-200/70 bg-white pl-3 pr-9 text-right text-xs text-[#1F2937]"
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-semibold text-[#6B7280]">
                        صفة المعلن
                      </label>
                      <select
                        value={authAdvType}
                        onChange={(e) => setAuthAdvType(e.target.value as AdvertiserTypeCode)}
                        className="h-10 w-full rounded-xl border border-stone-200/70 bg-white px-3 text-xs font-semibold text-[#1F2937]"
                      >
                        <option value="owner">مالك مباشر</option>
                        <option value="broker">مكتب / وسيط عقاري</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#6B7280]">
                      البريد الإلكتروني
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="email"
                        required
                        dir="ltr"
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="h-10 w-full rounded-xl border border-stone-200/70 bg-white pl-3 pr-9 text-left text-xs text-[#1F2937]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#6B7280]">
                      كلمة المرور
                    </label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="password"
                        required
                        minLength={6}
                        dir="ltr"
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        placeholder="••••••"
                        className="h-10 w-full rounded-xl border border-stone-200/70 bg-white pl-3 pr-9 text-left text-xs text-[#1F2937]"
                      />
                    </div>
                  </div>
                </div>

                {errorMsg && (
                  <div
                    className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700"
                    role="alert"
                  >
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#1E3A5F] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#172E4D] disabled:opacity-60"
                >
                  {authLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
                  <span>{authMode === 'login' ? 'دخول لرفع الإيصال' : 'إنشاء الحساب والمتابعة'}</span>
                </button>
              </form>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div className="rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-4 py-3 text-xs text-[#1F2937]">
                <span className="font-bold text-[#1E3A5F]">الحساب المسجّل:</span>{' '}
                <span>{profile?.name || authUser.email}</span>
                {profile?.phone && (
                  <span className="mr-2 text-[#6B7280]" dir="ltr">
                    ({profile.phone})
                  </span>
                )}
              </div>

              <div>
                <label
                  htmlFor="sub-receipt"
                  className="mb-1.5 block text-xs font-semibold text-[#6B7280]"
                >
                  صورة إيصال التحويل (تُرفع في مساحة خاصة وآمنة)
                </label>
                <label
                  htmlFor="sub-receipt"
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 bg-[#FAF9F6] p-6 text-center transition hover:border-[#1E3A5F]"
                >
                  <Upload className="h-6 w-6 text-[#1E3A5F]" />
                  <span className="text-xs font-semibold text-[#1F2937]">
                    {receiptFile
                      ? `تم اختيار: ${receiptFile.name}`
                      : 'اضغط لاختيار صورة إيصال إنستاباي أو المحفظة (JPG / PNG / WebP / PDF)'}
                  </span>
                  <input
                    id="sub-receipt"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="sr-only"
                    onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>

              {errorMsg && (
                <div
                  className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700"
                  role="alert"
                >
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="min-h-[48px] w-full rounded-xl bg-[#1E3A5F] px-5 py-3 text-sm font-bold text-white shadow-xs transition hover:bg-[#172E4D] disabled:opacity-60"
              >
                {submitting ? 'جاري رفع الإيصال وإرسال الطلب...' : 'إرسال طلب الاشتراك للمراجعة'}
              </button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
