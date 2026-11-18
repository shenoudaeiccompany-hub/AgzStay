import { ShieldCheck, Star, UserCheck } from 'lucide-react';
import type { RenterTrustReview } from '@/types/chalet';

interface RenterTrustBadgeProps {
  reviews: RenterTrustReview[];
  renterPhone?: string;
  compact?: boolean;
}

export function RenterTrustBadge({
  reviews,
  renterPhone,
  compact = false,
}: RenterTrustBadgeProps) {
  const matched = renterPhone
    ? reviews.filter((r) => r.renterPhone === renterPhone)
    : reviews;
  const effective = matched.length > 0 ? matched : reviews;

  const avgRating =
    effective.length > 0
      ? effective.reduce((sum, r) => sum + r.rating, 0) / effective.length
      : 5.0;
  const avgPunctuality =
    effective.length > 0
      ? effective.reduce((sum, r) => sum + r.punctualityScore, 0) / effective.length
      : 5.0;
  const avgCare =
    effective.length > 0
      ? effective.reduce((sum, r) => sum + r.propertyCareScore, 0) / effective.length
      : 5.0;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-0.5 text-[11px] font-bold text-success-700">
        <UserCheck className="h-3.5 w-3.5 text-success-500" />
        <span>سجل ثقة المستأجر: {avgRating.toFixed(1)}★</span>
        <span className="text-success-700/75">({effective.length})</span>
      </span>
    );
  }

  return (
    <div className="rounded-2xl border border-success-500/20 bg-success-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-success-500 text-white">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-extrabold text-slate-900">سجل ثقة المستأجر</div>
            <div className="text-[11px] text-slate-600">
              تقييم الملاك السابقين بناءً على {effective.length} إقامة
            </div>
          </div>
        </div>

        <div className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-sm font-extrabold text-success-700 shadow-sm">
          <Star className="h-4 w-4 fill-warning-500 text-warning-500" />
          <span>{avgRating.toFixed(1)}</span>
          <span className="text-xs font-normal text-slate-400">/ 5</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-white px-3 py-2">
          <span className="text-slate-500">الالتزام بالمواعيد</span>
          <div className="mt-0.5 font-extrabold text-primary-700">
            {avgPunctuality.toFixed(1)} / 5
          </div>
        </div>
        <div className="rounded-xl bg-white px-3 py-2">
          <span className="text-slate-500">المحافظة على الوحدة</span>
          <div className="mt-0.5 font-extrabold text-primary-700">
            {avgCare.toFixed(1)} / 5
          </div>
        </div>
      </div>
    </div>
  );
}
