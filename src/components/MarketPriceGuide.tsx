import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Building2,
  Info,
  Sparkles,
  TrendingUp,
  Umbrella,
} from 'lucide-react';
import { MARKET_BENCHMARKS, formatEGP } from '@/data/chalets';
import type { Chalet } from '@/types/chalet';

interface MarketPriceGuideProps {
  properties: Chalet[];
  onSelectGovernorateAndBrowse: (searchHint: string) => void;
  onBackToBrowse: () => void;
}

export function MarketPriceGuide({
  properties,
  onSelectGovernorateAndBrowse,
  onBackToBrowse,
}: MarketPriceGuideProps) {
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'residential' | 'coastal'>('all');
  const [rateView, setRateView] = useState<'daily' | 'monthly'>('daily');

  const filteredBenchmarks = useMemo(() => {
    return MARKET_BENCHMARKS.filter(
      (entry) => categoryFilter === 'all' || entry.category === categoryFilter
    );
  }, [categoryFilter]);

  const maxDailyVal = useMemo(
    () => Math.max(...MARKET_BENCHMARKS.map((b) => b.dailyWeekendAvg)),
    []
  );
  const maxMonthlyVal = useMemo(
    () => Math.max(...MARKET_BENCHMARKS.map((b) => b.monthlyAvg)),
    []
  );

  return (
    <section className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <div className="rounded-3xl bg-gradient-to-bl from-primary-600 via-primary-700 to-primary-900 p-6 text-white shadow-lg sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-sand-100">
              <BarChart3 className="h-3.5 w-3.5 text-secondary-200" />
              <span>مرجع التسعير العادل للإيجار في مصر</span>
            </div>
            <h1 className="mt-3 text-2xl font-extrabold sm:text-3xl">
              مؤشر أسعار AgzStay الاسترشادي للإيجار اليومي والشهري في مصر
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-primary-100">
              قارن متوسطات الأسعار اليومية والشهرية ومقارنة أيام الأسبوع مع الويك إند والمواسم
              في المحاور السكنية والمقاصد الساحلية قبل الحجز لحمايتك من المبالغة في الأسعار.
            </p>
          </div>

          <button
            type="button"
            onClick={onBackToBrowse}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-primary-700 shadow-sm transition hover:bg-sand-100"
          >
            <ArrowRight className="h-4 w-4" />
            <span>العودة لتصفح الوحدات</span>
          </button>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-4">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all', label: 'كل المناطق' },
              { id: 'residential', label: 'الشقق المفروشة (المدن)' },
              { id: 'coastal', label: 'المقاصد الساحلية' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() =>
                  setCategoryFilter(tab.id as 'all' | 'residential' | 'coastal')
                }
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  categoryFilter === tab.id
                    ? 'bg-secondary-500 text-white shadow-sm'
                    : 'bg-white/10 text-primary-100 hover:bg-white/20'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-xl bg-white/10 p-1">
            {[
              { id: 'daily', label: 'مقارنة اليومي (عادي / ويك إند)' },
              { id: 'monthly', label: 'المتوسط الشهري' },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setRateView(mode.id as 'daily' | 'monthly')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  rateView === mode.id
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-primary-100 hover:text-white'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {filteredBenchmarks.map((entry) => {
          const liveRentals = properties.filter((p) => {
            const text = `${p.area ?? ''} ${p.resort} ${p.destinationLabel}`;
            const token = entry.areaName.split(' ')[0];
            return text.includes(token);
          });

          const liveDailyAvg =
            liveRentals.length > 0
              ? Math.round(
                  liveRentals.reduce((sum, p) => sum + p.pricePerNight, 0) / liveRentals.length
                )
              : null;

          const weekdayPct = Math.round((entry.dailyWeekdayAvg / maxDailyVal) * 100);
          const weekendPct = Math.round((entry.dailyWeekendAvg / maxDailyVal) * 100);
          const monthlyPct = Math.round((entry.monthlyAvg / maxMonthlyVal) * 100);
          const weekendDiffPct = Math.round(
            ((entry.dailyWeekendAvg - entry.dailyWeekdayAvg) / entry.dailyWeekdayAvg) * 100
          );

          return (
            <div
              key={entry.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          entry.category === 'coastal'
                            ? 'bg-secondary-50 text-secondary-700'
                            : 'bg-primary-50 text-primary-700'
                        }`}
                      >
                        {entry.category === 'coastal' ? (
                          <Umbrella className="h-3 w-3" />
                        ) : (
                          <Building2 className="h-3 w-3" />
                        )}
                        {entry.governorateLabel}
                      </span>
                      <span className="rounded-full bg-sand-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                        طلب: {entry.demandLevel}
                      </span>
                    </div>
                    <h2 className="mt-2 text-lg font-extrabold text-slate-900">
                      {entry.areaName}
                    </h2>
                  </div>

                  {liveDailyAvg !== null && (
                    <div className="rounded-xl border border-success-500/20 bg-success-50 px-3 py-1.5 text-left">
                      <div className="text-[10px] font-bold text-success-700">
                        متوسط الوحدات المباشرة ({liveRentals.length})
                      </div>
                      <div className="text-xs font-extrabold text-success-700">
                        {formatEGP(liveDailyAvg)} / ليلة
                      </div>
                    </div>
                  )}
                </div>

                {rateView === 'daily' && (
                  <div className="mt-4 space-y-3 rounded-2xl bg-sand-50 p-4">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-700">أيام الأسبوع العادية (الأحد - الأربعاء)</span>
                        <span className="text-primary-700">{formatEGP(entry.dailyWeekdayAvg)}</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-secondary-500 transition-all"
                          style={{ width: `${Math.max(12, weekdayPct)}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-700">
                          الويك إند والمواسم (+{weekendDiffPct}%)
                        </span>
                        <span className="text-accent-600">{formatEGP(entry.dailyWeekendAvg)}</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-accent-500 transition-all"
                          style={{ width: `${Math.max(14, weekendPct)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {rateView === 'monthly' && (
                  <div className="mt-4 rounded-2xl bg-sand-50 p-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-700">متوسط الإيجار الشهري المفروش</span>
                      <span className="text-base font-extrabold text-primary-700">
                        {formatEGP(entry.monthlyAvg)}
                      </span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-primary-600 transition-all"
                        style={{ width: `${Math.max(15, monthlyPct)}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[11px] text-slate-600">
                      يعادل تقريباً {formatEGP(Math.round(entry.monthlyAvg / 30))} لليوم في العقود الشهرية.
                    </p>
                  </div>
                )}

                <div className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200/70 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-secondary-500" />
                  <span>{entry.tip}</span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                  <TrendingUp className="h-3.5 w-3.5 text-secondary-500" />
                  تحديث دوري لمتوسط السوق
                </span>
                <button
                  type="button"
                  onClick={() => onSelectGovernorateAndBrowse(entry.areaName.split(' ')[0])}
                  className="inline-flex items-center gap-1 text-xs font-bold text-secondary-600 hover:text-secondary-700"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  عرض وحدات {entry.areaName.split(' ')[0]}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
