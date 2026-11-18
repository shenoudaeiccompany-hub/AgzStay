import { useState } from 'react';
import { Calendar, Check, CheckCircle2, Lock, MessageSquarePlus, Star, Trash2 } from 'lucide-react';
import { PROPERTY_REVIEW_TAGS } from '@/data/chalets';
import type { BookingRequest, ChaletReview, PropertyReviewTag } from '@/types/chalet';

const RATING_LABELS: Record<number, string> = {
  1: 'غير مرضٍ',
  2: 'مقبول',
  3: 'جيد',
  4: 'ممتاز',
  5: 'استثنائي',
};

interface StarRatingInputProps {
  value: number;
  onChange: (rating: number) => void;
  size?: 'sm' | 'md';
}

export function StarRatingInput({ value, onChange, size = 'md' }: StarRatingInputProps) {
  const [hovered, setHovered] = useState<number>(0);
  const displayValue = hovered || value;
  const iconClass = size === 'sm' ? 'h-5 w-5' : 'h-7 w-7';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className="inline-flex items-center gap-1"
        role="radiogroup"
        aria-label="التقييم بالنجوم"
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const active = star <= displayValue;
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={value === star}
              aria-label={`${star} من 5 نجوم - ${RATING_LABELS[star]}`}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => onChange(star)}
              className="rounded-lg p-1 transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <Star
                className={`${iconClass} transition ${
                  active
                    ? 'fill-warning-500 text-warning-500'
                    : 'fill-slate-100 text-slate-300'
                }`}
              />
            </button>
          );
        })}
      </div>
      {displayValue > 0 && (
        <span className="rounded-full bg-warning-50 px-2.5 py-0.5 text-xs font-bold text-warning-700">
          {RATING_LABELS[displayValue]} ({displayValue}/5)
        </span>
      )}
    </div>
  );
}

interface ReviewFormProps {
  booking: BookingRequest;
  onSubmit: (payload: {
    chaletId: string;
    bookingId: string;
    authorName: string;
    rating: number;
    tags?: PropertyReviewTag[];
    comment: string;
    stayDate: string;
  }) => void;
  onCancel?: () => void;
  compact?: boolean;
}

export function ReviewForm({ booking, onSubmit, onCancel, compact = false }: ReviewFormProps) {
  const [rating, setRating] = useState<number>(5);
  const [selectedTags, setSelectedTags] = useState<PropertyReviewTag[]>([
    'مطابقة الصور للواقع',
    'نظافة الوحدة',
  ]);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  const toggleTag = (tag: PropertyReviewTag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1 || rating > 5) {
      setError('يرجى اختيار التقييم من ١ إلى ٥ نجوم.');
      return;
    }
    if (comment.trim().length < 5) {
      setError('يرجى كتابة تعليق لا يقل عن ٥ أحرف لمشاركة تجربتك.');
      return;
    }
    setError('');
    onSubmit({
      chaletId: booking.chaletId,
      bookingId: booking.id,
      authorName: booking.guestName,
      rating,
      tags: selectedTags,
      comment: comment.trim(),
      stayDate: booking.checkIn,
    });
    setComment('');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-2xl border border-primary-100 bg-primary-50/40 ${
        compact ? 'p-3.5' : 'p-4'
      } space-y-3`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-xs font-bold text-primary-800">
            تقييم تجربتك باسم: {booking.guestName}
          </span>
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
            <Calendar className="h-3 w-3" />
            <span>بتاريخ: {booking.checkIn}</span>
          </div>
        </div>
        <span className="rounded-full bg-success-50 px-2.5 py-0.5 text-[11px] font-bold text-success-700">
          تواصل موثق
        </span>
      </div>

      <div>
        <span className="mb-1.5 block text-xs font-bold text-slate-700">تقييمك العام</span>
        <StarRatingInput
          value={rating}
          onChange={setRating}
          size={compact ? 'sm' : 'md'}
        />
      </div>

      <div>
        <span className="mb-1.5 block text-xs font-bold text-slate-700">نقاط الجودة والشفافية</span>
        <div className="flex flex-wrap gap-1.5">
          {PROPERTY_REVIEW_TAGS.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
                  active
                    ? 'border-success-500 bg-success-50 text-success-700'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                {active && <Check className="h-3 w-3" />}
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label
          htmlFor={`review-comment-${booking.id}`}
          className="mb-1 block text-xs font-bold text-slate-700"
        >
          رأيك في الوحدة والمعلن
        </label>
        <textarea
          id={`review-comment-${booking.id}`}
          rows={compact ? 2 : 3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="شارك تفاصيل مطابقة الصور، النظافة، وشفافية السعر..."
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none"
        />
      </div>

      {error && (
        <p className="rounded-xl bg-error-50 px-3 py-2 text-xs font-semibold text-error-700">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            إلغاء
          </button>
        )}
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-primary-700"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          نشر التقييم الآن
        </button>
      </div>
    </form>
  );
}

interface ChaletReviewsProps {
  chaletRating: number;
  totalReviewsCount: number;
  reviews: ChaletReview[];
  bookingsForChalet: BookingRequest[];
  onSubmitReview: (payload: {
    chaletId: string;
    bookingId: string;
    authorName: string;
    rating: number;
    tags?: PropertyReviewTag[];
    comment: string;
    stayDate: string;
  }) => void;
  onDeleteReview: (reviewId: string) => void;
}

export function ChaletReviews({
  chaletRating,
  totalReviewsCount,
  reviews,
  bookingsForChalet,
  onSubmitReview,
  onDeleteReview,
}: ChaletReviewsProps) {
  const reviewedBookingIds = new Set(reviews.map((r) => r.bookingId));
  const pendingReviewBookings = bookingsForChalet.filter(
    (b) => !reviewedBookingIds.has(b.id)
  );
  const [selectedBookingId, setSelectedBookingId] = useState<string>('');

  const activeBooking =
    pendingReviewBookings.find((b) => b.id === selectedBookingId) ??
    pendingReviewBookings[0] ??
    null;

  return (
    <section className="space-y-4 border-t border-slate-100 pt-5" aria-label="التقييمات والآراء">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">تقييمات المستأجرين والمشترين</h3>
          <p className="text-xs text-slate-500">
            تقييم متبادل يتحقق من مطابقة الصور، النظافة، وشفافية السعر
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-2xl border border-warning-500/20 bg-warning-50 px-3.5 py-2">
          <Star className="h-5 w-5 fill-warning-500 text-warning-500" />
          <div className="leading-tight">
            <div className="text-base font-bold text-slate-900">
              {totalReviewsCount > 0 ? chaletRating.toFixed(1) : 'جديد'}
              {totalReviewsCount > 0 && (
                <span className="mr-1 text-xs font-medium text-slate-500">/ 5</span>
              )}
            </div>
            <div className="text-[11px] font-semibold text-warning-700">
              {totalReviewsCount} تقييم إجمالي
            </div>
          </div>
        </div>
      </div>

      {bookingsForChalet.length === 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-sand-50 p-4 text-xs text-slate-600">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <div>
            <p className="font-bold text-slate-800">التقييم متاح بعد التواصل أو إرسال طلب حجز</p>
            <p className="mt-0.5 leading-relaxed">
              لضمان مصداقية التقييمات، تواصل مع المعلن عبر واتساب/الاتصال أو أرسل طلب حجز لتتمكن من تقييم الوحدة والشفافية.
            </p>
          </div>
        </div>
      ) : activeBooking ? (
        <div className="space-y-2.5">
          {pendingReviewBookings.length > 1 && (
            <div className="flex items-center gap-2">
              <label
                htmlFor="select-booking-review"
                className="text-xs font-bold text-slate-700"
              >
                اختر الطلب المراد تقييمه:
              </label>
              <select
                id="select-booking-review"
                value={activeBooking.id}
                onChange={(e) => setSelectedBookingId(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-primary-500 focus:outline-none"
              >
                {pendingReviewBookings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.guestName} — {b.checkIn}
                  </option>
                ))}
              </select>
            </div>
          )}
          <ReviewForm booking={activeBooking} onSubmit={onSubmitReview} />
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-2xl border border-success-500/20 bg-success-50 px-4 py-3 text-xs font-bold text-success-700">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success-500" />
          <span>شكراً لك! تم تسجيل تقييمك لهذه الوحدة.</span>
        </div>
      )}

      {reviews.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-slate-500">
            أحدث التقييمات الموثقة ({reviews.length})
          </h4>
          {reviews.map((review) => (
            <div
              key={review.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{review.authorName}</span>
                    <span className="rounded-full bg-secondary-50 px-2 py-0.5 text-[10px] font-bold text-secondary-700">
                      تجربة موثقة
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex items-center gap-0.5" aria-label={`تقييم ${review.rating} من 5`}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`h-3.5 w-3.5 ${
                            star <= review.rating
                              ? 'fill-warning-500 text-warning-500'
                              : 'fill-slate-100 text-slate-300'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-[11px] text-slate-400">{review.stayDate}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onDeleteReview(review.id)}
                  aria-label="حذف التقييم"
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-error-50 hover:text-error-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {review.tags && review.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {review.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-md bg-success-50 px-2 py-0.5 text-[10px] font-bold text-success-700"
                    >
                      <Check className="h-2.5 w-2.5" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{review.comment}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
