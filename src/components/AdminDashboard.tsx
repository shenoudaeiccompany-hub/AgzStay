import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Crown,
  Database,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  CURATED_EGYPT_UNITS,
  EDITABLE_ADVERTISER_ROLES,
  EDITABLE_PROPERTY_TYPES,
  formatEGP,
  getPriceUnitLabel,
} from '@/data/chalets';
import {
  ALL_GOVERNORATE_NAMES,
  getAreasForCity,
  getCitiesForGovernorate,
} from '@/data/egyptLocations';
import {
  isSupabaseConfigured,
  testSupabaseUnitsConnection,
  type SupabaseUnitsTestResult,
} from '@/lib/supabase';
import {
  agzstayStorageKeys,
  deleteChaletRecord,
  fetchAllChaletsFromDb,
  fetchAllSubscriptions,
  insertChaletRecord,
  resolveReceiptPreviewUrl,
  reviewSubscriptionAdmin,
  updateChaletRecord,
} from '@/services/agzstayRepository';
import type {
  AdvertiserRoleLabel,
  Chalet,
  PropertyType,
  SubscriptionRecord,
} from '@/types/chalet';

interface AdminDashboardProps {
  onDataChanged?: () => void;
}

const ADMIN_PIN = (import.meta.env.VITE_ADMIN_PIN as string | undefined)?.trim() || '123456';

const QUICK_V2_SQL_HINT = `-- يرجى تنفيذ ملف supabase/migrations/005_agzstay_v2_schema.sql في Supabase SQL Editor
-- للتأكد من تهيئة جدول chalets وجدول subscriptions وحاويات property-images و receipts.`;

export function AdminDashboard({ onDataChanged }: AdminDashboardProps) {
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(agzstayStorageKeys.adminPinVerified) === '1';
    } catch {
      return false;
    }
  });
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const [activeTab, setActiveTab] = useState<'units' | 'subscriptions'>('units');
  const [units, setUnits] = useState<Chalet[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [unitSearch, setUnitSearch] = useState('');
  const [subFilter, setSubFilter] = useState<'all' | 'pending' | 'active' | 'rejected'>('all');

  const [diagResult, setDiagResult] = useState<SupabaseUnitsTestResult | null>(null);
  const [testingDiag, setTestingDiag] = useState(false);
  const [seedingSamples, setSeedingSamples] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Quick Inline Unit Edit
  const [editingUnit, setEditingUnit] = useState<Chalet | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editPropertyType, setEditPropertyType] = useState<PropertyType>('شاليه');
  const [editAdvertiserRole, setEditAdvertiserRole] =
    useState<AdvertiserRoleLabel>('مالك مباشر');
  const [editGovernorate, setEditGovernorate] = useState('مطروح');
  const [editCity, setEditCity] = useState('');
  const [editArea, setEditArea] = useState('');
  const [editManualCity, setEditManualCity] = useState(false);
  const [editManualArea, setEditManualArea] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Receipt Preview Modal
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [receiptPreviewTitle, setReceiptPreviewTitle] = useState('');

  const loadAdminData = useCallback(async () => {
    if (!unlocked) return;
    setLoading(true);
    try {
      const [unitsRes, subsRes] = await Promise.all([
        fetchAllChaletsFromDb(true),
        fetchAllSubscriptions(),
      ]);
      if (unitsRes.error) {
        setFeedback({ type: 'error', text: unitsRes.error });
      } else {
        setUnits(unitsRes.data ?? []);
      }
      if (!subsRes.error && subsRes.data) {
        setSubscriptions(subsRes.data);
      } else if (subsRes.error) {
        setFeedback({ type: 'error', text: subsRes.error });
      }
    } finally {
      setLoading(false);
    }
  }, [unlocked]);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput.trim() === ADMIN_PIN) {
      setPinError('');
      setUnlocked(true);
      try {
        sessionStorage.setItem(agzstayStorageKeys.adminPinVerified, '1');
      } catch {
        // ignore
      }
    } else {
      setPinError('رمز الدخول غير صحيح. تأكد من الرمز وحاول مرة أخرى.');
    }
  };

  const handleLockAdmin = () => {
    setUnlocked(false);
    setPinInput('');
    try {
      sessionStorage.removeItem(agzstayStorageKeys.adminPinVerified);
    } catch {
      // ignore
    }
  };

  const handleRunDiagnostics = async () => {
    setTestingDiag(true);
    try {
      const res = await testSupabaseUnitsConnection();
      setDiagResult(res);
    } finally {
      setTestingDiag(false);
    }
  };

  const handleCopySqlHint = async () => {
    try {
      await navigator.clipboard?.writeText(QUICK_V2_SQL_HINT);
      setSqlCopied(true);
      window.setTimeout(() => setSqlCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleSeedSampleUnits = async () => {
    if (!isSupabaseConfigured) {
      setFeedback({ type: 'error', text: 'الاتصال بـ Supabase غير مضبوط في هذه البيئة.' });
      return;
    }
    setSeedingSamples(true);
    setFeedback(null);
    try {
      const existingTitles = new Set(units.map((u) => u.title.trim()));
      let insertedCount = 0;
      let skippedCount = 0;
      for (const sample of CURATED_EGYPT_UNITS) {
        if (existingTitles.has(sample.title.trim())) {
          skippedCount += 1;
          continue;
        }
        const res = await insertChaletRecord({
          title: sample.title,
          description: sample.description,
          governorate: sample.governorate,
          city: sample.city,
          areaOrVillage: sample.areaOrVillage,
          propertyType: sample.propertyType,
          advertiserRole: sample.advertiserRole,
          ownerName: sample.ownerName,
          ownerPhone: sample.ownerPhone,
          isFeatured: sample.isFeatured,
          depositType: sample.depositType,
          depositValue: sample.depositValue,
          pricePerNight: sample.pricePerNight,
          monthlyPrice: sample.monthlyPrice,
          bedrooms: sample.bedrooms,
          bathrooms: sample.bathrooms,
          areaSqm: sample.areaSqm,
          maxGuests: sample.maxGuests,
          images: sample.images,
          amenities: sample.amenities,
          blockedDates: sample.blockedDates,
          rules: sample.rules,
          availabilityStatus: 'active',
        });
        if (res.error) {
          setFeedback({ type: 'error', text: res.error });
          break;
        }
        insertedCount += 1;
      }
      if (insertedCount > 0) {
        setFeedback({
          type: 'success',
          text:
            skippedCount > 0
              ? `تم إدخال ${insertedCount} وحدة جديدة في جدول chalets (وتم تخطي ${skippedCount} موجودة مسبقاً).`
              : `تم إدخال ${insertedCount} وحدات مصرية متكاملة في جدول chalets بنجاح.`,
        });
        await loadAdminData();
        onDataChanged?.();
      } else if (skippedCount > 0) {
        setFeedback({
          type: 'success',
          text: 'جميع الوحدات النموذجية (٩ وحدات) موجودة بالفعل في جدول chalets.',
        });
      }
    } finally {
      setSeedingSamples(false);
    }
  };

  const openEditUnitModal = (unit: Chalet) => {
    const gov = unit.governorate || ALL_GOVERNORATE_NAMES[0];
    const govCities = getCitiesForGovernorate(gov);
    const matchedCity = govCities.some((c) => c.name === unit.city);
    const cityAreas = matchedCity ? getAreasForCity(gov, unit.city) : [];
    const matchedArea = matchedCity && cityAreas.includes(unit.areaOrVillage);

    setEditingUnit(unit);
    setEditTitle(unit.title);
    setEditPrice(String(unit.pricePerNight));
    setEditPropertyType(unit.propertyType);
    setEditAdvertiserRole(unit.advertiserRole);
    setEditGovernorate(gov);
    setEditCity(unit.city);
    setEditArea(unit.areaOrVillage);
    setEditManualCity(!matchedCity && Boolean(unit.city));
    setEditManualArea(Boolean(unit.areaOrVillage) && (!matchedCity || !matchedArea));
  };

  const handleSaveAdminUnitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUnit) return;
    const numPrice = Number(editPrice);
    if (!Number.isFinite(numPrice) || numPrice <= 0) {
      setFeedback({ type: 'error', text: 'يرجى إدخال سعر صحيح.' });
      return;
    }
    setSavingEdit(true);
    try {
      const res = await updateChaletRecord(editingUnit.id, {
        title: editTitle.trim(),
        pricePerNight: numPrice,
        propertyType: editPropertyType,
        advertiserRole: editAdvertiserRole,
        governorate: editGovernorate,
        city: editCity.trim(),
        areaOrVillage: editArea.trim(),
      });
      if (res.error) {
        setFeedback({ type: 'error', text: res.error });
        return;
      }
      setEditingUnit(null);
      setFeedback({ type: 'success', text: 'تم تعديل الوحدة بنجاح.' });
      await loadAdminData();
      onDataChanged?.();
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleFeatured = async (unit: Chalet) => {
    const res = await updateChaletRecord(unit.id, { isFeatured: !unit.isFeatured });
    if (res.error) {
      setFeedback({ type: 'error', text: res.error });
      return;
    }
    await loadAdminData();
    onDataChanged?.();
  };

  const handleToggleUnitVisibility = async (unit: Chalet) => {
    const nextStatus = unit.availabilityStatus === 'active' ? 'hidden' : 'active';
    const res = await updateChaletRecord(unit.id, { availabilityStatus: nextStatus });
    if (res.error) {
      setFeedback({ type: 'error', text: res.error });
      return;
    }
    await loadAdminData();
    onDataChanged?.();
  };

  const handleDeleteUnit = async (unit: Chalet) => {
    if (!window.confirm(`حذف "${unit.title}" نهائياً من جدول chalets؟`)) return;
    const res = await deleteChaletRecord(unit.id);
    if (res.error) {
      setFeedback({ type: 'error', text: res.error });
      return;
    }
    setFeedback({ type: 'success', text: 'تم حذف الوحدة.' });
    await loadAdminData();
    onDataChanged?.();
  };

  const handlePreviewReceipt = async (sub: SubscriptionRecord) => {
    const res = await resolveReceiptPreviewUrl(sub.receiptUrl, sub.receiptPath);
    if (res.error || !res.data) {
      setFeedback({ type: 'error', text: res.error ?? 'تعذر فتح الإيصال.' });
      return;
    }
    setReceiptPreviewTitle(`${sub.ownerName} — ${sub.planName}`);
    setReceiptPreviewUrl(res.data);
  };

  const handleReviewSubscription = async (
    sub: SubscriptionRecord,
    decision: 'active' | 'rejected'
  ) => {
    const res = await reviewSubscriptionAdmin(sub.id, sub.ownerPhone, decision);
    if (res.error) {
      setFeedback({ type: 'error', text: res.error });
      return;
    }
    setFeedback({
      type: 'success',
      text:
        decision === 'active'
          ? `تم تفعيل باقة "${sub.planName}" لـ ${sub.ownerName} وتمييز وحداته تلقائياً.`
          : `تم رفض طلب اشتراك ${sub.ownerName}.`,
    });
    await loadAdminData();
    onDataChanged?.();
  };

  const filteredUnits = useMemo(() => {
    const q = unitSearch.trim().toLowerCase();
    if (!q) return units;
    return units.filter((u) =>
      `${u.title} ${u.governorate} ${u.city} ${u.areaOrVillage} ${u.ownerName} ${u.ownerPhone}`
        .toLowerCase()
        .includes(q)
    );
  }, [unitSearch, units]);

  const filteredSubscriptions = useMemo(() => {
    if (subFilter === 'all') return subscriptions;
    return subscriptions.filter((s) => s.status === subFilter);
  }, [subFilter, subscriptions]);

  const pendingSubsCount = subscriptions.filter((s) => s.status === 'pending').length;

  // Admin PIN Gate
  if (!unlocked) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-14 sm:px-6">
        <div className="rounded-2xl border border-stone-200/70 bg-white p-6 shadow-xs sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1E3A5F] text-white">
            <Lock className="h-6 w-6 text-[#C5A880]" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-[#1E3A5F]">لوحة تحكم الإدارة</h1>
          <p className="mt-1.5 text-sm text-[#6B7280]">
            أدخل رمز الحماية (PIN) للوصول إلى إدارة الوحدات ومراجعة اشتراكات المعلنين.
          </p>

          <form onSubmit={handlePinSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="admin-pin" className="mb-1.5 block text-xs font-semibold text-slate-700">
                رمز الدخول (PIN)
              </label>
              <input
                id="admin-pin"
                type="password"
                inputMode="numeric"
                required
                dir="ltr"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="••••••"
                className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-center font-mono text-lg tracking-widest text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
              />
            </div>

            {pinError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {pinError}
              </div>
            )}

            <button
              type="submit"
              className="min-h-[46px] w-full rounded-xl bg-[#1E3A5F] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#172E4D]"
            >
              فتح لوحة الأدمن
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stone-200/70 bg-white p-5 shadow-xs">
        <div>
          <h1 className="text-2xl font-bold text-[#1E3A5F]">لوحة تحكم الأدمن — AgzStay</h1>
          <p className="mt-1 text-xs text-[#6B7280]">
            إدارة وحدات جدول chalets ومراجعة إيصالات الباقات من جدول subscriptions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={testingDiag}
            onClick={() => void handleRunDiagnostics()}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3.5 py-2 text-xs font-semibold text-[#1E3A5F] hover:bg-slate-100"
          >
            <Database className="h-4 w-4 text-[#C5A880]" />
            <span>{testingDiag ? 'جاري الفحص...' : 'فحص الاتصال بـ Supabase'}</span>
          </button>

          <button
            type="button"
            disabled={seedingSamples}
            onClick={() => void handleSeedSampleUnits()}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#C5A880] px-3.5 py-2 text-xs font-bold text-[#1F2937] hover:bg-[#b5976d] disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            <span>{seedingSamples ? 'جاري الإدخال...' : 'إدخال ٩ وحدات مصرية متكاملة'}</span>
          </button>

          <button
            type="button"
            onClick={() => void loadAdminData()}
            disabled={loading}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-stone-200/70 bg-white px-3.5 py-2 text-xs font-semibold text-[#1F2937] hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>

          <button
            type="button"
            onClick={handleLockAdmin}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            <LogOut className="h-4 w-4" />
            <span>قفل اللوحة</span>
          </button>
        </div>
      </div>

      {/* Diagnostics Result */}
      {diagResult && (
        <div
          className={`mt-4 rounded-2xl border p-4 text-xs ${
            diagResult.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-amber-200 bg-amber-50 text-amber-950'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold">
              {diagResult.ok
                ? `الاتصال ناجح: جدول chalets يحتوي على ${diagResult.count} وحدة، وجدول subscriptions ${
                    diagResult.subscriptionsOk ? `متاح (${diagResult.subscriptionsCount ?? 0})` : 'غير مهيأ بعد'
                  }.`
                : `تنبيه الاتصال: ${diagResult.error ?? 'تعذر الوصول للجدول'}`}
            </span>
            <button
              type="button"
              onClick={() => void handleCopySqlHint()}
              className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-[#1E3A5F]"
            >
              {sqlCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{sqlCopied ? 'تم النسخ' : 'نسخ ملاحظة الترحيل SQL'}</span>
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <div
          className={`mt-4 flex items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-xs font-bold ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-600" />
            )}
            {feedback.text}
          </span>
          <button type="button" onClick={() => setFeedback(null)} className="p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main 2 Tabs */}
      <div className="mt-6 flex flex-wrap gap-2 border-b border-stone-200/70 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('units')}
          className={`inline-flex min-h-[42px] items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold transition ${
            activeTab === 'units'
              ? 'bg-[#1E3A5F] text-white shadow-xs'
              : 'bg-white text-[#1F2937] hover:bg-slate-100'
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>إدارة الوحدات ({units.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('subscriptions')}
          className={`inline-flex min-h-[42px] items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold transition ${
            activeTab === 'subscriptions'
              ? 'bg-[#1E3A5F] text-white shadow-xs'
              : 'bg-white text-[#1F2937] hover:bg-slate-100'
          }`}
        >
          <Crown className="h-4 w-4 text-[#C5A880]" />
          <span>مراجعة اشتراكات الباقات ({subscriptions.length})</span>
          {pendingSubsCount > 0 && (
            <span className="rounded-full bg-[#C5A880] px-2 py-0.5 text-[11px] font-bold text-[#1F2937]">
              {pendingSubsCount} جديد
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: Units Management */}
      {activeTab === 'units' && (
        <section className="mt-6 space-y-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={unitSearch}
              onChange={(e) => setUnitSearch(e.target.value)}
              placeholder="ابحث بالعنوان، المحافظة، اسم المعلن أو الهاتف..."
              className="h-11 w-full rounded-xl border border-stone-200/70 bg-white pl-3 pr-10 text-xs text-[#1F2937] focus:border-[#1E3A5F] focus:outline-none sm:text-sm"
            />
          </div>

          {filteredUnits.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-[#6B7280]">
              لا توجد وحدات مطابقة في جدول chalets حالياً.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUnits.map((unit) => {
                const isHidden = unit.availabilityStatus !== 'active';
                return (
                  <div
                    key={unit.id}
                    className="flex flex-col justify-between gap-4 rounded-2xl border border-stone-200/70 bg-white p-4 shadow-xs lg:flex-row lg:items-center"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            isHidden
                              ? 'bg-slate-100 text-[#6B7280]'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {isHidden ? 'مخفية' : 'نشطة'}
                        </span>
                        <span className="rounded-full bg-[#FAF9F6] px-2.5 py-0.5 text-[11px] font-semibold text-[#1E3A5F]">
                          {unit.propertyType}
                        </span>
                        <span className="rounded-full bg-[#FAF9F6] px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                          {unit.advertiserRole}
                        </span>
                        {unit.isFeatured && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#C5A880] px-2.5 py-0.5 text-[11px] font-bold text-[#1F2937]">
                            <Sparkles className="h-3 w-3" />
                            إعلان مميز
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-bold text-[#1F2937]">{unit.title}</h3>
                      <p className="text-xs text-[#6B7280]">
                        {[unit.governorate, unit.city, unit.areaOrVillage].filter(Boolean).join(' • ')}{' '}
                        | {unit.ownerName} ({unit.ownerPhone || 'بدون هاتف'}) |{' '}
                        <strong className="text-[#1E3A5F]">
                          {formatEGP(unit.pricePerNight)} ({getPriceUnitLabel(unit)})
                        </strong>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleToggleFeatured(unit)}
                        className={`inline-flex min-h-[38px] items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                          unit.isFeatured
                            ? 'border-[#C5A880] bg-[#C5A880]/20 text-[#1E3A5F]'
                            : 'border-stone-200/70 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Sparkles className="h-3.5 w-3.5 text-[#C5A880]" />
                        <span>{unit.isFeatured ? 'إلغاء التمييز' : 'تمييز الإعلان'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditUnitModal(unit)}
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 py-1.5 text-xs font-semibold text-[#1E3A5F] hover:bg-slate-100"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>تعديل</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleToggleUnitVisibility(unit)}
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-stone-200/70 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {isHidden ? (
                          <>
                            <Eye className="h-3.5 w-3.5 text-emerald-600" />
                            <span>إظهار</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-3.5 w-3.5 text-amber-600" />
                            <span>إخفاء</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleDeleteUnit(unit)}
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>حذف</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Tab 2: Subscriptions Review */}
      {activeTab === 'subscriptions' && (
        <section className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: 'all', label: 'الكل' },
                { id: 'pending', label: 'قيد المراجعة' },
                { id: 'active', label: 'مفعّلة' },
                { id: 'rejected', label: 'مرفوضة' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSubFilter(f.id)}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  subFilter === f.id
                    ? 'bg-[#1E3A5F] text-white'
                    : 'border border-stone-200/70 bg-white text-[#1F2937] hover:bg-slate-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredSubscriptions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-[#6B7280]">
              لا توجد طلبات اشتراكات في هذا القسم.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSubscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className="flex flex-col justify-between gap-4 rounded-2xl border border-stone-200/70 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:p-5"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          sub.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700'
                            : sub.status === 'rejected'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {sub.status === 'active'
                          ? 'مفعّلة'
                          : sub.status === 'rejected'
                          ? 'مرفوضة'
                          : 'قيد المراجعة'}
                      </span>
                      <span className="rounded-full bg-[#FAF9F6] px-2.5 py-0.5 text-[11px] font-bold text-[#1E3A5F]">
                        {sub.planName}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-[#1F2937]">
                      {sub.ownerName} — <span dir="ltr">{sub.ownerPhone}</span>
                    </h3>
                    <p className="text-xs text-[#6B7280]">
                      القيمة: <strong className="text-[#1E3A5F]">{formatEGP(sub.price)}</strong> • الحد
                      الأقصى: {sub.maxUnits} وحدات
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {(sub.receiptUrl || sub.receiptPath) && (
                      <button
                        type="button"
                        onClick={() => void handlePreviewReceipt(sub)}
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 py-1.5 text-xs font-semibold text-[#1E3A5F] hover:bg-slate-100"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>معاينة الإيصال</span>
                      </button>
                    )}

                    {sub.status !== 'active' && (
                      <button
                        type="button"
                        onClick={() => void handleReviewSubscription(sub, 'active')}
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>اعتماد وتفعيل + تمييز الوحدات</span>
                      </button>
                    )}

                    {sub.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => void handleReviewSubscription(sub, 'rejected')}
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        <span>رفض</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Admin Edit Unit Modal */}
      {editingUnit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h2 className="text-base font-bold text-[#1E3A5F]">تعديل سريع للوحدة</h2>
              <button
                type="button"
                onClick={() => setEditingUnit(null)}
                className="rounded-lg p-1.5 text-[#6B7280] hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAdminUnitEdit} className="mt-4 space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">العنوان</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="h-10 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">نوع العقار</label>
                  <select
                    value={editPropertyType}
                    onChange={(e) => setEditPropertyType(e.target.value as PropertyType)}
                    className="h-10 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-2.5 text-xs font-semibold"
                  >
                    {EDITABLE_PROPERTY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">صفة المعلن</label>
                  <select
                    value={editAdvertiserRole}
                    onChange={(e) => setEditAdvertiserRole(e.target.value as AdvertiserRoleLabel)}
                    className="h-10 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-2.5 text-xs font-semibold"
                  >
                    {EDITABLE_ADVERTISER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">المحافظة</label>
                  <select
                    value={editGovernorate}
                    onChange={(e) => {
                      const nextGov = e.target.value;
                      const nextCities = getCitiesForGovernorate(nextGov);
                      const nextCity = nextCities[0]?.name ?? '';
                      const nextArea = getAreasForCity(nextGov, nextCity)[0] ?? '';
                      setEditGovernorate(nextGov);
                      setEditCity(nextCity);
                      setEditArea(nextArea);
                      setEditManualCity(false);
                      setEditManualArea(false);
                    }}
                    className="h-10 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-2 text-xs"
                  >
                    {ALL_GOVERNORATE_NAMES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">المدينة</label>
                  {editManualCity ? (
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={editCity}
                        onChange={(e) => setEditCity(e.target.value)}
                        placeholder="اكتب المدينة..."
                        className="h-10 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-2.5 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const firstCity = getCitiesForGovernorate(editGovernorate)[0]?.name ?? '';
                          setEditManualCity(false);
                          setEditCity(firstCity);
                          setEditArea(getAreasForCity(editGovernorate, firstCity)[0] ?? '');
                        }}
                        className="h-10 shrink-0 rounded-xl border border-stone-200/70 px-2 text-[11px] font-semibold text-[#1E3A5F]"
                      >
                        قائمة
                      </button>
                    </div>
                  ) : (
                    <select
                      value={editCity}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__custom__') {
                          setEditManualCity(true);
                          setEditManualArea(true);
                          setEditCity('');
                          setEditArea('');
                        } else {
                          setEditCity(val);
                          setEditManualArea(false);
                          setEditArea(getAreasForCity(editGovernorate, val)[0] ?? '');
                        }
                      }}
                      className="h-10 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-2 text-xs"
                    >
                      {getCitiesForGovernorate(editGovernorate).map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                      <option value="__custom__">+ أخرى (كتابة يدوياً)</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    القرية / المنطقة
                  </label>
                  {editManualCity || editManualArea ? (
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={editArea}
                        onChange={(e) => setEditArea(e.target.value)}
                        placeholder="اكتب القرية أو الكمبوند..."
                        className="h-10 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-2.5 text-xs"
                      />
                      {!editManualCity && getAreasForCity(editGovernorate, editCity).length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditManualArea(false);
                            setEditArea(getAreasForCity(editGovernorate, editCity)[0] ?? '');
                          }}
                          className="h-10 shrink-0 rounded-xl border border-stone-200/70 px-2 text-[11px] font-semibold text-[#1E3A5F]"
                        >
                          قائمة
                        </button>
                      )}
                    </div>
                  ) : (
                    <select
                      value={editArea}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__custom__') {
                          setEditManualArea(true);
                          setEditArea('');
                        } else {
                          setEditArea(val);
                        }
                      }}
                      className="h-10 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-2 text-xs"
                    >
                      <option value="">اختر المنطقة (اختياري)</option>
                      {getAreasForCity(editGovernorate, editCity).map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                      <option value="__custom__">+ أخرى (كتابة قرية أو كمبوند يدوياً)</option>
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  السعر (ج.م)
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  className="h-10 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-sm font-bold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingUnit(null)}
                  className="rounded-xl border border-stone-200/70 px-4 py-2 text-xs font-bold text-[#6B7280]"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="rounded-xl bg-[#1E3A5F] px-5 py-2 text-xs font-bold text-white"
                >
                  {savingEdit ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receipt Preview Modal */}
      {receiptPreviewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h2 className="text-sm font-bold text-[#1E3A5F]">{receiptPreviewTitle}</h2>
              <button
                type="button"
                onClick={() => setReceiptPreviewUrl(null)}
                className="rounded-lg p-1.5 text-[#6B7280] hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 max-h-[70vh] overflow-auto rounded-xl bg-[#FAF9F6] p-2 text-center">
              {receiptPreviewUrl.toLowerCase().includes('.pdf') ? (
                <a
                  href={receiptPreviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#1E3A5F] px-5 py-3 text-xs font-bold text-white"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>فتح ملف الإيصال (PDF)</span>
                </a>
              ) : (
                <img
                  src={receiptPreviewUrl}
                  alt={receiptPreviewTitle}
                  className="mx-auto max-h-[62vh] rounded-lg object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
