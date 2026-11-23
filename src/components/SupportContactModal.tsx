import { useState } from 'react';
import { Check, Copy, Mail, MessageCircle, PlusCircle, ShieldCheck, X } from 'lucide-react';
import { useModal } from '@/hooks/useModal';

interface SupportContactModalProps {
  onClose: () => void;
  onOpenAddProperty?: () => void;
}

const SUPPORT_EMAIL =
  (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined)?.trim() ||
  'shenouda.eiccompany@gmail.com';
const SUPPORT_WHATSAPP =
  (import.meta.env.VITE_SUPPORT_WHATSAPP as string | undefined)?.replace(/\D/g, '') || '';

export function SupportContactModal({
  onClose,
  onOpenAddProperty,
}: SupportContactModalProps) {
  const modalRef = useModal<HTMLDivElement>({ onClose });
  const [emailCopied, setEmailCopied] = useState(false);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard?.writeText(SUPPORT_EMAIL);
      setEmailCopied(true);
      window.setTimeout(() => setEmailCopied(false), 2200);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="تواصل معنا"
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-bold text-primary-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              دعم منصة AgzStay (إجازة ستاي)
            </span>
            <h2 className="mt-2 text-lg font-extrabold text-slate-900">تواصل معنا</h2>
            <p className="mt-1 text-xs text-slate-500">
              هل تبحث عن وحدة في منطقة معينة أو تواجه مشكلة تقنية؟ يسعدنا تواصلك مباشرة.
            </p>
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

        <div className="mt-5 space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-sand-50 p-4">
            <div className="text-xs font-bold text-slate-500">البريد الإلكتروني للإدارة والدعم</div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm font-bold text-primary-700" dir="ltr">
                {SUPPORT_EMAIL}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyEmail()}
                  className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  {emailCopied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-success-600" />
                      تم النسخ
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      نسخ
                    </>
                  )}
                </button>
                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                    'استفسار عبر منصة إجازة ستاي (AgzStay)'
                  )}`}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-primary-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-primary-700"
                >
                  <Mail className="h-3.5 w-3.5" />
                  إرسال بريد
                </a>
              </div>
            </div>
          </div>

          {SUPPORT_WHATSAPP && (
            <a
              href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(
                'مرحباً فريق إجازة ستاي (AgzStay)، أود الاستفسار عن الوحدات المتاحة.'
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-700"
            >
              <MessageCircle className="h-4 w-4" />
              تواصل مباشرة عبر واتساب الدعم
            </a>
          )}

          {onOpenAddProperty && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAddProperty();
              }}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-secondary-200 bg-secondary-50 px-4 py-3 text-sm font-bold text-secondary-800 hover:bg-secondary-100"
            >
              <PlusCircle className="h-4 w-4" />
              لديك شقة أو شاليه؟ أضف وحدتك الآن
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
