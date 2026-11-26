import { Headphones, ShieldCheck } from 'lucide-react';
import { SupportCenterContent } from '@/components/SupportContactModal';
import type { RouteSection } from '@/types/chalet';

interface SupportCenterPageProps {
  initialBookingId?: string;
  onNavigate: (section: RouteSection) => void;
}

export function SupportCenterPage({ initialBookingId, onNavigate }: SupportCenterPageProps) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
      <div className="rounded-2xl border border-stone-200/70 bg-white p-5 shadow-xs sm:p-8">
        <div className="mb-6 border-b border-stone-100 pb-5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200/70 bg-[#FAF9F6] px-3 py-1 text-xs font-bold text-[#1E3A5F]">
            <ShieldCheck className="h-3.5 w-3.5 text-[#C5A880]" />
            <span>مركز المساعدة وخدمة العملاء — AgzStay</span>
          </span>
          <h1 className="mt-3 flex items-center gap-2 text-2xl font-bold text-[#1E3A5F]">
            <Headphones className="h-6 w-6 text-[#C5A880]" />
            <span>المساعدة وخدمة العملاء</span>
          </h1>
          <p className="mt-1.5 text-xs leading-relaxed text-[#6B7280] sm:text-sm">
            أرسل استفسارك أو طلب تعديل/إلغاء حجز ليتم ربطه تلقائياً بحسابك وحفظه في سجل الدعم ومتابعة الرد.
          </p>
        </div>

        <SupportCenterContent
          initialBookingId={initialBookingId}
          onOpenAddProperty={() => onNavigate('owner')}
          onNavigate={onNavigate}
        />
      </div>
    </main>
  );
}
