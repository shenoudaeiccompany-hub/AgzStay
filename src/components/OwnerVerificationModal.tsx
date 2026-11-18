import { useState } from 'react';
import { CheckCircle2, FileCheck2, ShieldCheck, Upload, X } from 'lucide-react';
import type { OwnerVerificationSubmission } from '@/types/chalet';

interface OwnerVerificationModalProps {
  existingSubmission: OwnerVerificationSubmission | null;
  onClose: () => void;
  onSubmitVerification: (submission: OwnerVerificationSubmission) => void;
}

export function OwnerVerificationModal({
  existingSubmission,
  onClose,
  onSubmitVerification,
}: OwnerVerificationModalProps) {
  const [ownerName, setOwnerName] = useState(existingSubmission?.ownerName ?? '');
  const [phone, setPhone] = useState(existingSubmission?.phone ?? '');
  const [documentType, setDocumentType] = useState<
    OwnerVerificationSubmission['documentType']
  >(existingSubmission?.documentType ?? 'resort-card');
  const [documentNumber, setDocumentNumber] = useState(
    existingSubmission?.documentNumber ?? ''
  );
  const [documentPreviewName, setDocumentPreviewName] = useState(
    existingSubmission?.documentPreviewName ?? ''
  );
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setDocumentPreviewName(file.name);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerName.trim() || !documentNumber.trim()) {
      setError('يرجى إدخال الاسم الكامل ورقم مستند الملكية أو كارنيه القرية.');
      return;
    }
    if (!/^01[0125][0-9]{8}$/.test(phone.trim())) {
      setError('يرجى إدخال رقم موبايل مصري صحيح للتواصل والتحقق.');
      return;
    }
    if (!documentPreviewName) {
      setError('يرجى إرفاق صورة كارنيه القرية أو إثبات الملكية.');
      return;
    }

    setError('');
    onSubmitVerification({
      ownerName: ownerName.trim(),
      phone: phone.trim(),
      documentType,
      documentNumber: documentNumber.trim(),
      documentPreviewName,
      status: 'verified',
      submittedAt: new Date().toISOString(),
    });
    onClose();
  };

  return (
    <div
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
              شارة المالك الموثق
            </div>
            <h2 className="mt-1.5 text-xl font-bold text-slate-900">توثيق ملكية الشاليه</h2>
            <p className="text-xs text-slate-500">
              أثبت ملكيتك للحصول على شارة الثقة وزيادة نسبة الحجوزات المباشرة
            </p>
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
              placeholder="01001234567"
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
              صورة المستند (كارنيه القرية أو العقد)
            </span>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-xs font-bold text-slate-600 transition hover:border-primary-500 hover:bg-primary-50/40">
              <Upload className="h-4 w-4 text-primary-600" />
              <span>
                {documentPreviewName ? documentPreviewName : 'اضغط لاختيار صورة المستند'}
              </span>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            {documentPreviewName && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-success-700">
                <FileCheck2 className="h-4 w-4 text-success-500" />
                <span>تم إرفاق: {documentPreviewName}</span>
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
              className="inline-flex items-center gap-1.5 rounded-xl bg-success-500 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-success-700"
            >
              <CheckCircle2 className="h-4 w-4" />
              اعتماد وتفعيل التوثيق
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
