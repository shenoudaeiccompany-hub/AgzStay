import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileCheck2,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { useModal } from '@/hooks/useModal';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  uploadVerificationDocument,
  type RepoResult,
} from '@/services/agzstayRepository';
import type { AppUser, OwnerVerificationSubmission } from '@/types/chalet';

interface OwnerVerificationModalProps {
  currentUser: AppUser | null;
  existingSubmission: OwnerVerificationSubmission | null;
  onClose: () => void;
  onOpenAuth?: () => void;
  onSubmitVerification: (payload: {
    ownerName: string;
    phone: string;
    documentType: OwnerVerificationSubmission['documentType'];
    documentNumber: string;
    documentPath: string;
    documentPreviewName: string;
  }) => Promise<RepoResult<OwnerVerificationSubmission>>;
}

export function OwnerVerificationModal({
  currentUser,
  existingSubmission,
  onClose,
  onOpenAuth,
  onSubmitVerification,
}: OwnerVerificationModalProps) {
  const modalRef = useModal<HTMLDivElement>({ onClose });
  const [ownerName, setOwnerName] = useState(
    existingSubmission?.ownerName ?? currentUser?.name ?? ''
  );
  const [phone, setPhone] = useState(existingSubmission?.phone ?? currentUser?.phone ?? '');
  const [documentType, setDocumentType] = useState<
    OwnerVerificationSubmission['documentType']
  >(existingSubmission?.documentType ?? 'resort-card');
  const [documentNumber, setDocumentNumber] = useState(
    existingSubmission?.documentNumber ?? ''
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentPreviewName, setDocumentPreviewName] = useState(
    existingSubmission?.documentPreviewName ?? ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('الحد الأقصى لحجم المستند هو ٥ ميجابايت.');
      e.target.value = '';
      return;
    }
    setError('');
    setSelectedFile(file);
    setDocumentPreviewName(file.name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      setError('وضع تجريبي: توثيق الملاك معطل لعدم إعداد Supabase.');
      return;
    }
    if (!currentUser) {
      setError('يرجى تسجيل الدخول أولاً لتقديم مستندات التوثيق.');
      return;
    }
    if (!ownerName.trim() || !documentNumber.trim()) {
      setError('يرجى إدخال الاسم الكامل ورقم مستند الملكية أو كارنيه القرية.');
      return;
    }
    if (!/^01[0125][0-9]{8}$/.test(phone.trim())) {
      setError('يرجى إدخال رقم موبايل مصري صحيح للتواصل والتحقق.');
      return;
    }
    if (!selectedFile && !existingSubmission?.documentPath) {
      setError('يرجى إرفاق صورة كارنيه القرية أو إثبات الملكية.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      let documentPath = existingSubmission?.documentPath ?? '';
      if (selectedFile) {
        const uploadRes = await uploadVerificationDocument(selectedFile);
        if (uploadRes.error || !uploadRes.data) {
          setError(uploadRes.error || 'تعذر رفع المستند.');
          return;
        }
        documentPath = uploadRes.data.path;
      }

      const res = await onSubmitVerification({
        ownerName: ownerName.trim(),
        phone: phone.trim(),
        documentType,
        documentNumber: documentNumber.trim(),
        documentPath,
        documentPreviewName: documentPreviewName || 'verification-document',
      });

      if (res.error) {
        setError(res.error);
        return;
      }
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="توثيق حساب المالك"
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-bold text-success-700">
              <ShieldCheck className="h-3.5 w-3.5 text-success-500" />
              توثيق المالك عبر الإدارة العامة
            </div>
            <h2 className="mt-1.5 text-xl font-bold text-slate-900">توثيق ملكية الوحدة</h2>
            <p className="text-xs text-slate-500">
              يُرفع المستند إلى مخزن خاص مشفر وتتم مراجعته من الإدارة لترقية حسابك إلى مالك موثق
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

        {existingSubmission?.status === 'pending' && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-extrabold">طلبك قيد مراجعة الإدارة العامة</p>
              <p className="mt-0.5 text-[11px] leading-relaxed">
                بمجرد مراجعة المستند واعتماده من فريق الإدارة، سيتحول حسابك تلقائياً إلى &quot;مالك
                موثق&quot; وتتمكن من نشر وإدارة وحداتك علناً.
              </p>
            </div>
          </div>
        )}

        {existingSubmission?.status === 'verified' && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div>
              <p className="font-extrabold">حسابك موثق كمُعلن مالك معتمد</p>
              <p className="mt-0.5 text-[11px]">
                الاسم الموثق: {existingSubmission.ownerName} • رقم المستند:{' '}
                {existingSubmission.documentNumber}
              </p>
            </div>
          </div>
        )}

        {existingSubmission?.status === 'unverified' && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-error-200 bg-error-50 p-3.5 text-xs text-error-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-error-600" />
            <div>
              <p className="font-extrabold">تم رفض طلب التوثيق السابق — يرجى التعديل وإعادة الإرسال</p>
              {existingSubmission.rejectionReason && (
                <p className="mt-1 text-[11px] font-semibold">
                  سبب الرفض من الإدارة: {existingSubmission.rejectionReason}
                </p>
              )}
            </div>
          </div>
        )}

        {!isSupabaseConfigured ? (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>وضع تجريبي: لا يمكن رفع مستندات التوثيق بدون إعداد Supabase.</span>
          </div>
        ) : !currentUser ? (
          <div className="mt-4 space-y-3 rounded-2xl border border-primary-100 bg-primary-50/70 p-4 text-center text-xs">
            <p className="font-bold text-primary-900">يرجى تسجيل الدخول أولاً لرفع مستند التوثيق</p>
            {onOpenAuth && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAuth();
                }}
                className="rounded-xl bg-primary-600 px-5 py-2 font-bold text-white hover:bg-primary-700"
              >
                تسجيل الدخول / إنشاء حساب
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
            <div>
              <label htmlFor="ver-name" className="mb-1 block text-xs font-bold text-slate-700">
                الاسم المطابق للمستند
              </label>
              <input
                id="ver-name"
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="مثال: م. طارق المنشاوي"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="ver-phone" className="mb-1 block text-xs font-bold text-slate-700">
                رقم الموبايل المؤكد
              </label>
              <input
                id="ver-phone"
                type="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01000000000"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm focus:border-primary-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="ver-type" className="mb-1 block text-xs font-bold text-slate-700">
                نوع مستند التوثيق
              </label>
              <select
                id="ver-type"
                value={documentType}
                onChange={(e) =>
                  setDocumentType(
                    e.target.value as OwnerVerificationSubmission['documentType']
                  )
                }
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary-500 focus:bg-white focus:outline-none"
              >
                <option value="resort-card">كارنيه عضوية القرية</option>
                <option value="ownership-contract">عقد ملكية أو تخصيص</option>
                <option value="authorization">توكيل رسمي بالإدارة</option>
              </select>
            </div>

            <div>
              <label htmlFor="ver-doc-num" className="mb-1 block text-xs font-bold text-slate-700">
                رقم الوحدة / الكارنيه
              </label>
              <input
                id="ver-doc-num"
                type="text"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                placeholder="مثال: قطاع B - وحدة 14"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-bold text-slate-700">
                صورة المستند (PNG / JPG / PDF — حد أقصى ٥ ميجابايت)
              </span>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-xs font-bold text-slate-600 transition hover:border-primary-500 hover:bg-primary-50/40">
                <Upload className="h-4 w-4 text-primary-600" />
                <span>
                  {documentPreviewName ? documentPreviewName : 'اضغط لاختيار صورة المستند أو PDF'}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              {documentPreviewName && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-success-700">
                  <FileCheck2 className="h-4 w-4 text-success-500" />
                  <span>تم اختيار: {documentPreviewName}</span>
                </div>
              )}
            </div>

            {error && (
              <p className="rounded-xl bg-error-50 px-3 py-2 text-xs font-semibold text-error-700">
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>{isSubmitting ? 'جاري الرفع والإرسال...' : 'إرسال طلب التوثيق للمراجعة'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
