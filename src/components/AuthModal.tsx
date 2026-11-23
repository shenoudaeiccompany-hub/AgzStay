import { useState } from 'react';
import { AlertTriangle, CheckCircle2, LogIn, ShieldCheck, UserPlus, X } from 'lucide-react';
import { useModal } from '@/hooks/useModal';
import { isSupabaseConfigured } from '@/lib/supabase';
import { signInWithEmail, signUpWithEmail } from '@/services/agzstayRepository';
import type { AppUser } from '@/types/chalet';

interface AuthModalProps {
  onClose: () => void;
  onAuthenticated: (user: AppUser) => void;
}

export function AuthModal({ onClose, onAuthenticated }: AuthModalProps) {
  const modalRef = useModal<HTMLDivElement>({ onClose });
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmationMessage, setConfirmationMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      setError('وضع تجريبي: تسجيل الدخول وإنشاء الحساب معطلان لعدم إعداد Supabase.');
      return;
    }
    if (!email.trim() || !password.trim()) {
      setError('يرجى إدخال البريد الإلكتروني وكلمة المرور.');
      return;
    }
    if (isSignUp && !name.trim()) {
      setError('يرجى إدخال الاسم الكامل.');
      return;
    }
    setError('');
    setConfirmationMessage('');
    setLoading(true);

    if (isSignUp) {
      const result = await signUpWithEmail({
        email: email.trim(),
        password,
        name: name.trim(),
        phone: phone.trim(),
      });
      setLoading(false);

      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.data?.needsEmailConfirmation) {
        setConfirmationMessage(
          'تحقق من بريدك الإلكتروني لتفعيل الحساب عبر رابط التأكيد، ثم عد لتسجيل الدخول.'
        );
        return;
      }
      if (result.data?.user) {
        onAuthenticated(result.data.user);
        onClose();
      }
      return;
    }

    const result = await signInWithEmail({ email: email.trim(), password });
    setLoading(false);

    if (result.error || !result.data) {
      setError(result.error || 'تعذر تسجيل الدخول.');
      return;
    }
    onAuthenticated(result.data);
    onClose();
  };

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="تسجيل الدخول"
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-bold text-primary-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              {isSupabaseConfigured ? 'متصل بـ Supabase Auth' : 'وضع تجريبي (بدون حفظ)'}
            </div>
            <h2 className="mt-1.5 text-xl font-bold text-slate-900">
              {isSignUp
                ? 'إنشاء حساب في إجازة ستاي (AgzStay)'
                : 'تسجيل الدخول إلى إجازة ستاي'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!isSupabaseConfigured && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-bold">وضع تجريبي: تسجيل الدخول معطل</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800">
                أضف <code className="font-mono">VITE_SUPABASE_URL</code> و{' '}
                <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> في ملف{' '}
                <code className="font-mono">.env</code> لتفعيل الحسابات والحجز الفعلي.
              </p>
            </div>
          </div>
        )}

        {confirmationMessage ? (
          <div className="mt-5 space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="text-base font-extrabold text-emerald-950">تم إنشاء الحساب بنجاح</h3>
            <p className="text-xs leading-relaxed text-emerald-800">{confirmationMessage}</p>
            <button
              type="button"
              onClick={() => {
                setConfirmationMessage('');
                setIsSignUp(false);
              }}
              className="w-full rounded-xl bg-primary-600 py-2.5 text-sm font-bold text-white hover:bg-primary-700"
            >
              الانتقال لتسجيل الدخول
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
            {isSignUp && (
              <>
                <div className="rounded-xl border border-primary-100 bg-primary-50/70 px-3 py-2 text-[11px] leading-relaxed text-primary-900">
                  تبدأ جميع الحسابات الجديدة كحساب <strong>مصيّف / مستأجر</strong>. لترقية حسابك
                  إلى <strong>مالك وحدة موثق</strong>، ارفع مستند التوثيق من لوحة المالك بعد الدخول.
                </div>

                <div>
                  <label htmlFor="auth-name" className="mb-1 block text-xs font-bold text-slate-700">
                    الاسم الكامل
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثال: كريم السيد"
                    disabled={!isSupabaseConfigured}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary-500 focus:bg-white focus:outline-none disabled:opacity-60"
                  />
                </div>
                <div>
                  <label htmlFor="auth-phone" className="mb-1 block text-xs font-bold text-slate-700">
                    رقم الموبايل (اختياري)
                  </label>
                  <input
                    id="auth-phone"
                    type="tel"
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="01000000000"
                    disabled={!isSupabaseConfigured}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm focus:border-primary-500 focus:bg-white focus:outline-none disabled:opacity-60"
                  />
                </div>
              </>
            )}

            <div>
              <label htmlFor="auth-email" className="mb-1 block text-xs font-bold text-slate-700">
                البريد الإلكتروني
              </label>
              <input
                id="auth-email"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                disabled={!isSupabaseConfigured}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm focus:border-primary-500 focus:bg-white focus:outline-none disabled:opacity-60"
                required
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="mb-1 block text-xs font-bold text-slate-700">
                كلمة المرور
              </label>
              <input
                id="auth-password"
                type="password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={!isSupabaseConfigured}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm focus:border-primary-500 focus:bg-white focus:outline-none disabled:opacity-60"
                required
              />
            </div>

            {error && (
              <p className="rounded-xl bg-error-50 px-3 py-2 text-xs font-semibold text-error-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!isSupabaseConfigured || loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSignUp ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
              <span>{loading ? 'جاري التنفيذ...' : isSignUp ? 'إنشاء الحساب' : 'دخول'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsSignUp((prev) => !prev);
                setError('');
                setConfirmationMessage('');
              }}
              className="w-full text-center text-xs font-bold text-primary-600 hover:text-primary-700"
            >
              {isSignUp ? 'لديك حساب بالفعل؟ تسجيل الدخول' : 'مستخدم جديد؟ أنشئ حسابك الآن'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
