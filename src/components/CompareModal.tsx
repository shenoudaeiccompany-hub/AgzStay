import { Scale, Star, Trash2, X } from 'lucide-react';
import {
  formatEGP,
  getAdvertiserBadgeInfo,
  getAmenityLabel,
  getUnitTypeLabel,
  getViewTypeLabel,
} from '@/data/chalets';
import type { Chalet } from '@/types/chalet';

interface CompareModalProps {
  chalets: Chalet[];
  onClose: () => void;
  onRemoveChalet: (id: string) => void;
  onSelectChalet: (chalet: Chalet) => void;
}

export function CompareModal({
  chalets,
  onClose,
  onRemoveChalet,
  onSelectChalet,
}: CompareModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="مقارنة الوحدات"
    >
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                مقارنة الوحدات ({chalets.length})
              </h2>
              <p className="text-xs text-slate-500">
                قارن الأسعار وهوية المعلن والمواصفات جنباً إلى جنب
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق المقارنة"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {chalets.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            لم يتم اختيار وحدات للمقارنة.
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-right text-sm">
              <thead>
                <tr>
                  <th className="w-40 border-b border-slate-200 p-3 text-xs font-bold text-slate-500">
                    المواصفة
                  </th>
                  {chalets.map((chalet) => (
                    <th
                      key={chalet.id}
                      className="min-w-[200px] border-b border-slate-200 p-3 align-top"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold text-primary-700">
                            {chalet.area || chalet.destinationLabel}
                          </span>
                          <h3 className="mt-1.5 line-clamp-2 text-sm font-bold text-slate-900">
                            {chalet.title}
                          </h3>
                          <p className="mt-0.5 text-xs font-normal text-slate-500">
                            {chalet.resort}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemoveChalet(chalet.id)}
                          aria-label={`إزالة ${chalet.title}`}
                          className="rounded-lg p-1 text-slate-400 hover:bg-error-50 hover:text-error-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                <tr>
                  <td className="p-3 font-bold text-slate-600">السعر اليومي</td>
                  {chalets.map((c) => (
                    <td key={c.id} className="p-3 font-bold text-primary-700">
                      {formatEGP(c.pricePerNight)} / يوم
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-3 font-bold text-slate-600">الإيجار الأسبوعي</td>
                  {chalets.map((c) => (
                    <td key={c.id} className="p-3 font-semibold text-slate-800">
                      {formatEGP(c.weeklyPrice ?? Math.round(c.pricePerNight * 6.2))}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-3 font-bold text-slate-600">الإيجار الشهري</td>
                  {chalets.map((c) => (
                    <td key={c.id} className="p-3 font-semibold text-secondary-700">
                      {formatEGP(c.monthlyPrice ?? Math.round(c.pricePerNight * 22))}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-3 font-bold text-slate-600">هوية المعلن</td>
                  {chalets.map((c) => {
                    const badge = getAdvertiserBadgeInfo(
                      c.owner.roleType,
                      c.owner.brokerAgency
                    );
                    return (
                      <td key={c.id} className="p-3">
                        <span className="font-bold text-slate-800">{badge.label}</span>
                        <div className="text-[11px] text-slate-500">{c.owner.name}</div>
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="p-3 font-bold text-slate-600">التقييم العام</td>
                  {chalets.map((c) => (
                    <td key={c.id} className="p-3">
                      <span className="inline-flex items-center gap-1 font-bold text-warning-700">
                        <Star className="h-3.5 w-3.5 fill-warning-500 text-warning-500" />
                        {c.reviewsCount > 0 ? `${c.rating.toFixed(1)} (${c.reviewsCount})` : 'جديد'}
                      </span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-3 font-bold text-slate-600">السعة والغرف</td>
                  {chalets.map((c) => (
                    <td key={c.id} className="p-3 text-slate-700">
                      {c.bedrooms} غرف • {c.bathrooms} حمام
                      {c.areaSqm ? ` • ${c.areaSqm} م²` : ''}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-3 font-bold text-slate-600">النوع والإطلالة</td>
                  {chalets.map((c) => (
                    <td key={c.id} className="p-3 text-slate-700">
                      {getUnitTypeLabel(c.unitType)} • {getViewTypeLabel(c.viewType)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-3 font-bold text-slate-600">أبرز المميزات</td>
                  {chalets.map((c) => (
                    <td key={c.id} className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {c.amenities.map((a) => (
                          <span
                            key={a}
                            className="rounded-md bg-secondary-50 px-2 py-0.5 text-[11px] font-semibold text-secondary-700"
                          >
                            {getAmenityLabel(a)}
                          </span>
                        ))}
                      </div>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-3" />
                  {chalets.map((c) => (
                    <td key={c.id} className="p-3">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onSelectChalet(c);
                        }}
                        className="w-full rounded-xl bg-primary-600 py-2 text-xs font-bold text-white transition hover:bg-primary-700"
                      >
                        عرض التفاصيل والتواصل
                      </button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
