import { useState } from 'react';
import { Check, ShieldCheck, Star, UserCheck, X } from 'lucide-react';
import { PROPERTY_REVIEW_TAGS, RENTER_TRUST_TAGS } from '@/data/chalets';
import type { PropertyReviewTag, RenterTrustTag } from '@/types/chalet';

type RatingModalMode =
  | {
      type: 'renter-to-property';
      chaletId: string;
      chaletTitle: string;
      bookingId: string;
      authorName: string;
      stayDate: string;
      onSubmit: (payload: {
        chaletId: string;
        bookingId: string;
        authorName: string;
        rating: number;
        tags: PropertyReviewTag[];
        comment: string;
        stayDate: string;
      }) => void;
    }
  | {
      type: 'host-to-renter';
      bookingId: string;
      chaletTitle: string;
      renterName: string;
      renterPhone: string;
      hostName: string;
      onSubmit: (payload: {
        bookingId: string;
        chaletTitle: string;
        renterName: string;
        renterPhone: string;
        hostName: string;
        rating: number;
        punctualityScore: number;
        propertyCareScore: number;
        tags: RenterTrustTag[];
        comment: string;
      }) => void;
    };

interface RatingModalProps {
  config: RatingModalMode;
  onClose: () => void;
}

export function RatingModal({ config, onClose }: RatingModalProps) {
  const [rating, setRating] = useState(5);
  const [punctualityScore, setPunctualityScore] = useState(5);
  const [propertyCareScore, setPropertyCareScore] = useState(5);
  const [selectedPropertyTags, setSelectedPropertyTags] = useState<PropertyReviewTag[]>([
    'مطابقة الصور للواقع',
    'نظافة الوحدة',
  ]);
  const [selectedRenterTags, setSelectedRenterTags] = useState<RenterTrustTag[]>([
    'الالتزام بالمواعيد',
    'المحافظة على الوحدة',
  ]);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  const isHostRatingRenter = config.type === 'host-to-renter';

  const togglePropertyTag = (tag: PropertyReviewTag) => {
    setSelectedPropertyTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const toggleRenterTag = (tag: RenterTrustTag) => {
    setSelectedRenterTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (comment.trim().length < 5) {
      setError('يرجى كتابة ملاحظة موجزة لا تقل عن ٥ أحرف.');
      return;
    }

    if (config.type === 'renter-to-property') {
      config.onSubmit({
        chaletId: config.chaletId,
        bookingId: config.bookingId,
        authorName: config.authorName,
        rating,
        tags: selectedPropertyTags,
        comment: comment.trim(),
        stayDate: config.stayDate,
      });
    } else {
      const avg = Math.round(((punctualityScore + propertyCareScore + rating) / 3) * 10) / 10;
      config.onSubmit({
        bookingId: config.bookingId,
        chaletTitle: config.chaletTitle,
        renterName: config.renterName,
        renterPhone: config.renterPhone,
        hostName: config.hostName,
        rating: avg,
        punctualityScore,
        propertyCareScore,
        tags: selectedRenterTags,
        comment: comment.trim(),
      });
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={isHostRatingRenter ? 'تقييم المستأجر' : 'تقييم الوحدة والمعلن'}
    >
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                isHostRatingRenter
                  ? 'bg-secondary-50 text-secondary-700'
                  : 'bg-primary-50 text-primary-700'
              }`}
            >
              {isHostRatingRenter ? (
                <UserCheck className="h-3.5 w-3.5" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
              {isHostRatingRenter ? 'تقييم متبادل: من المالك للمستأجر' : 'تقييم متبادل: من المستأجر للوحدة'}
            </span>
            <h3 className="mt-1.5 text-lg font-bold text-slate-900">
              {isHostRatingRenter
                ? `تقييم المستأجر: ${config.renterName}`
                : `تقييم: ${config.chaletTitle}`}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <span className="mb-1.5 block text-xs font-bold text-slate-700">التقييم العام</span>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  aria-label={`${star} نجوم`}
                  className="rounded-lg p-1 transition hover:scale-110"
                >
                  <Star
                    className={`h-7 w-7 ${
                      star <= rating
                        ? 'fill-warning-500 text-warning-500'
                        : 'fill-slate-100 text-slate-300'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {isHostRatingRenter ? (
            <>
              <div className="grid grid-cols-2 gap-3 rounded-2xl bg-sand-50 p-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    الالتزام بالمواعيد
                  </label>
                  <select
                    value={punctualityScore}
                    onChange={(e) => setPunctualityScore(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800"
                  >
                    {[5, 4, 3, 2, 1].map((v) => (
                      <option key={v} value={v}>
                        {v} / 5
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    المحافظة على الوحدة
                  </label>
                  <select
                    value={propertyCareScore}
                    onChange={(e) => setPropertyCareScore(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800"
                  >
                    {[5, 4, 3, 2, 1].map((v) => (
                      <option key={v} value={v}>
                        {v} / 5
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-bold text-slate-700">
                  أبرز نقاط الالتزام
                </span>
                <div className="flex flex-wrap gap-2">
                  {RENTER_TRUST_TAGS.map((tag) => {
                    const active = selectedRenterTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleRenterTag(tag)}
                        className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                          active
                            ? 'border-secondary-500 bg-secondary-50 text-secondary-700'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        {active && <Check className="h-3.5 w-3.5" />}
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div>
              <span className="mb-1.5 block text-xs font-bold text-slate-700">
                تقييم الشفافية والجودة
              </span>
              <div className="flex flex-wrap gap-2">
                {PROPERTY_REVIEW_TAGS.map((tag) => {
                  const active = selectedPropertyTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => togglePropertyTag(tag)}
                      className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                        active
                          ? 'border-success-500 bg-success-50 text-success-700'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      {active && <Check className="h-3.5 w-3.5" />}
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="modal-rating-comment" className="mb-1 block text-xs font-bold text-slate-700">
              {isHostRatingRenter ? 'ملاحظتك حول تعامل المستأجر' : 'تجربتك مع الوحدة والمعلن'}
            </label>
            <textarea
              id="modal-rating-comment"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                isHostRatingRenter
                  ? 'مثال: التزام ممتاز بموعد التسليم ومحافظة تامة على الأثاث...'
                  : 'مثال: الشقة مطابقة تماماً للصور والسعر واضح بدون أي عمولة إضافية...'
              }
              className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-sm focus:border-secondary-500 focus:bg-white focus:outline-none"
            />
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
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="rounded-xl bg-primary-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary-700"
            >
              حفظ التقييم
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
