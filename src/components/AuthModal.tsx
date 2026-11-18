import { useState } from 'react';
import { LogIn, ShieldCheck, UserPlus, X } from 'lucide-react';
import { isSupabaseConfigured } from '@/lib/supabase';
import { signInWithSupabaseOrLocal } from '@/services/masayefRepository';
import type { AppUser } from '@/types/chalet';

interface AuthModalProps {
  onClose: () => void;
  onAuthenticated: (user: AppUser) => void;
}

export function AuthModal({ onClose, onAuthenticated }: AuthModalProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [role, setRole] = useState<'guest' | 'owner'>('guest');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('يرجى إدخال البريد الإلكتروني وكلمة المرور.');
      return;
    }
    if (isSignUp && !name.trim()) {
      setError('يرجى إدخال الاسم الكامل.');
      return;
    }
    setError('');
    setLoading(true);
    const result = await signInWithSupabaseOrLocal({
      email: email.trim(),
      password,
      name: name.trim(),
      phone: phone.trim(),
      role,
      isSignUp,
    });
    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    onAuthenticated(result.user);
    onClose();
  };

  return (
    <div
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
              {isSupabaseConfigured ? 'متصل بـ Supabase Auth' : 'وضع الحساب المحلي'}
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
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <span className="mb-1.5 block text-xs font-bold text-slate-700">نوع الحساب</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole('guest')}
                className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                  role === 'guest'
                    ? 'border-primary-600 bg-primary-50 text-primary-700'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                مصيّف / مستأجر
              </button>
              <button
                type="button"
                onClick={() => setRole('owner')}
                className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                  role === 'owner'
                    ? 'border-primary-600 bg-primary-50 text-primary-700'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                مالك شاليه
              </button>
            </div>
          </div>

          {isSignUp && (
            <>
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
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary-500 focus:bg-white focus:outline-none"
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
                  placeholder="01012345678"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm focus:border-primary-500 focus:bg-white focus:outline-none"
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
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm focus:border-primary-500 focus:bg-white focus:outline-none"
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
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm focus:border-primary-500 focus:bg-white focus:outline-none"
              required
            />
          </div>

          {!isSupabaseConfigured && (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
              ملاحظة: عند إضافة <code className="font-mono">VITE_SUPABASE_URL</code> و{' '}
              <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> يتم التبديل تلقائياً إلى
              المصادقة السحابية عبر Supabase.
            </p>
          )}

          {error && (
            <p className="rounded-xl bg-error-50 px-3 py-2 text-xs font-semibold text-error-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-60"
          >
            {isSignUp ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
            <span>{loading ? 'جاري التنفيذ...' : isSignUp ? 'إنشاء الحساب' : 'دخول'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsSignUp((prev) => !prev);
              setError('');
            }}
            className="w-full text-center text-xs font-bold text-primary-600 hover:text-primary-700"
          >
            {isSignUp ? 'لديك حساب بالفعل؟ تسجيل الدخول' : 'مستخدم جديد؟ أنشئ حسابك الآن'}
          </button>
        </form>
      </div>
    </div>
  );
}
