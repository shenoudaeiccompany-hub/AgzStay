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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="تواصل معنا"
    >
      <div className="w-full max-w-md rounded-2xl border border-stone-200/70 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between border-b border-stone-100 pb-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200/70 bg-[#FAF9F6] px-3 py-1 text-xs font-bold text-[#1E3A5F]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#C5A880]" />
              دعم منصة AgzStay (إجازة ستاي)
            </span>
            <h2 className="mt-2.5 text-lg font-bold text-[#1F2937]">تواصل معنا</h2>
            <p className="mt-1 text-xs text-[#6B7280]">
              هل تبحث عن وحدة في منطقة معينة أو تواجه مشكلة تقنية؟ يسعدنا تواصلك مباشرة.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FAF9F6] text-[#6B7280] hover:bg-stone-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          <div className="rounded-2xl border border-stone-200/70 bg-[#FAF9F6] p-4">
            <div className="text-xs font-semibold text-[#6B7280]">البريد الإلكتروني للإدارة والدعم</div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm font-bold text-[#1E3A5F]" dir="ltr">
                {SUPPORT_EMAIL}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyEmail()}
                  className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-stone-200/70 bg-white px-3 py-1.5 text-xs font-bold text-[#1F2937] hover:bg-stone-50"
                >
                  {emailCopied ? (
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
                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                    'استفسار عبر منصة إجازة ستاي (AgzStay)'
                  )}`}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#1E3A5F] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#172E4D]"
                >
                  <Mail className="h-3.5 w-3.5" />
                  <span>إرسال بريد</span>
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
              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-xs hover:bg-emerald-700"
            >
              <MessageCircle className="h-4 w-4" />
              <span>تواصل مباشرة عبر واتساب الدعم</span>
            </a>
          )}

          {onOpenAddProperty && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAddProperty();
              }}
              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-[#C5A880] bg-[#FAF6F0] px-4 py-3 text-sm font-bold text-[#1E3A5F] hover:bg-[#F3EBDE]"
            >
              <PlusCircle className="h-4 w-4 text-[#C5A880]" />
              <span>لديك شقة أو شاليه؟ أضف وحدتك الآن</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
