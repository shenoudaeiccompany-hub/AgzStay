import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Crown,
  Edit3,
  Eye,
  EyeOff,
  ImagePlus,
  LogOut,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { ArabicDateRangeField } from '@/components/ArabicCalendarPicker';
import {
  AMENITIES,
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
import { normalizeEgyptianPhone, resolveOwnerQuota } from '@/data/subscriptions';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  deleteChaletRecord,
  fetchOwnerChaletsByPhone,
  fetchSubscriptionsByPhone,
  insertChaletRecord,
  loadOwnerSession,
  saveOwnerSession,
  updateChaletRecord,
  uploadPropertyImages,
} from '@/services/agzstayRepository';
import type {
  AdvertiserRoleLabel,
  AmenityId,
  Chalet,
  DepositType,
  OwnerSession,
  PropertyType,
  RouteSection,
  SubscriptionRecord,
} from '@/types/chalet';
import { addDaysIso, formatArabicDate, formatIsoDate } from '@/utils/bookingPricing';

interface OwnerPortalProps {
  onNavigate: (section: RouteSection) => void;
  onDataChanged?: () => void;
}

interface UnitFormState {
  title: string;
  description: string;
  governorate: string;
  city: string;
  areaOrVillage: string;
  manualLocationMode: boolean;
  manualAreaMode: boolean;
  propertyType: PropertyType;
  advertiserRole: AdvertiserRoleLabel;
  priceText: string;
  depositType: DepositType;
  depositValueText: string;
  bedrooms: string;
  bathrooms: string;
  maxGuests: string;
  areaSqmText: string;
  amenities: AmenityId[];
  rulesText: string;
  images: string[];
  manualImageUrl: string;
}

function createEmptyUnitForm(): UnitFormState {
  const defaultGov = 'مطروح';
  const defaultCity = getCitiesForGovernorate(defaultGov)[0]?.name ?? '';
  const defaultArea = getAreasForCity(defaultGov, defaultCity)[0] ?? '';
  return {
    title: '',
    description: '',
    governorate: defaultGov,
    city: defaultCity,
    areaOrVillage: defaultArea,
    manualLocationMode: false,
    manualAreaMode: false,
    propertyType: 'شاليه',
    advertiserRole: 'مالك مباشر',
    priceText: '',
    depositType: 'percent',
    depositValueText: '',
    bedrooms: '2',
    bathrooms: '1',
    maxGuests: '4',
    areaSqmText: '',
    amenities: ['wifi', 'ac'],
    rulesText: '',
    images: [],
    manualImageUrl: '',
  };
}

function unitToFormState(unit: Chalet): UnitFormState {
  const govCities = getCitiesForGovernorate(unit.governorate);
  const matchedCity = govCities.some((c) => c.name === unit.city);
  const cityAreas = matchedCity ? getAreasForCity(unit.governorate, unit.city) : [];
  const matchedArea = matchedCity && cityAreas.includes(unit.areaOrVillage);

  return {
    title: unit.title,
    description: unit.description,
    governorate: unit.governorate || ALL_GOVERNORATE_NAMES[0],
    city: unit.city,
    areaOrVillage: unit.areaOrVillage,
    manualLocationMode: !matchedCity,
    manualAreaMode: matchedCity && Boolean(unit.areaOrVillage) && !matchedArea,
    propertyType: unit.propertyType,
    advertiserRole: unit.advertiserRole,
    priceText: unit.pricePerNight > 0 ? String(unit.pricePerNight) : '',
    depositType: unit.depositType,
    depositValueText: unit.depositValue > 0 ? String(unit.depositValue) : '',
    bedrooms: String(unit.bedrooms || 1),
    bathrooms: String(unit.bathrooms || 1),
    maxGuests: String(unit.maxGuests || 2),
    areaSqmText: unit.areaSqm ? String(unit.areaSqm) : '',
    amenities: unit.amenities ?? [],
    rulesText: (unit.rules ?? []).join('\n'),
    images: unit.images ?? [],
    manualImageUrl: '',
  };
}

export function OwnerPortal({ onNavigate, onDataChanged }: OwnerPortalProps) {
  const [session, setSession] = useState<OwnerSession | null>(() => loadOwnerSession());
  const [loginName, setLoginName] = useState(session?.name ?? '');
  const [loginPhone, setLoginPhone] = useState(session?.phone ?? '');
  const [loginError, setLoginError] = useState('');

  const [units, setUnits] = useState<Chalet[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [form, setForm] = useState<UnitFormState>(createEmptyUnitForm);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [savingUnit, setSavingUnit] = useState(false);

  const [calendarUnitId, setCalendarUnitId] = useState<string | null>(null);
  const [blockStartDate, setBlockStartDate] = useState(() => formatIsoDate(new Date()));
  const [blockEndDate, setBlockEndDate] = useState(() => formatIsoDate(new Date()));
  const [savingCalendar, setSavingCalendar] = useState(false);

  const loadOwnerData = useCallback(async (activeSession: OwnerSession | null) => {
    if (!activeSession) return;
    setLoading(true);
    setLoadError('');
    try {
      const [unitsRes, subsRes] = await Promise.all([
        fetchOwnerChaletsByPhone(activeSession.phone),
        fetchSubscriptionsByPhone(activeSession.phone),
      ]);
      if (unitsRes.error) {
        setLoadError(unitsRes.error);
      } else {
        setUnits(unitsRes.data ?? []);
      }
      if (!subsRes.error && subsRes.data) {
        setSubscriptions(subsRes.data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOwnerData(session);
  }, [loadOwnerData, session]);

  const quota = useMemo(() => {
    if (!session) return null;
    return resolveOwnerQuota(session.phone, subscriptions);
  }, [session, subscriptions]);

  const canAddAnotherUnit = quota ? units.length < quota.maxUnits : true;
  const citiesForSelectedGov = useMemo(
    () => getCitiesForGovernorate(form.governorate),
    [form.governorate]
  );
  const areasForSelectedCity = useMemo(
    () => getAreasForCity(form.governorate, form.city),
    [form.governorate, form.city]
  );

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = loginName.trim();
    const cleanPhone = normalizeEgyptianPhone(loginPhone);
    if (cleanName.length < 3) {
      setLoginError('يرجى إدخال الاسم ثلاثياً على الأقل.');
      return;
    }
    if (cleanPhone.length < 10) {
      setLoginError('يرجى إدخال رقم هاتف مصري صحيح.');
      return;
    }
    setLoginError('');
    const nextSession: OwnerSession = {
      name: cleanName,
      phone: cleanPhone,
      loggedInAt: new Date().toISOString(),
    };
    saveOwnerSession(nextSession);
    setSession(nextSession);
  };

  const handleLogout = () => {
    saveOwnerSession(null);
    setSession(null);
    setUnits([]);
    setSubscriptions([]);
    setIsFormOpen(false);
    setEditingUnitId(null);
    setFeedback(null);
  };

  const openAddForm = () => {
    if (!canAddAnotherUnit) {
      setFeedback({
        type: 'error',
        text: 'لقد وصلت إلى الحد الأقصى لعدد الإعلانات في باقتك الحالية. قم بالترقية لإضافة المزيد.',
      });
      return;
    }
    setEditingUnitId(null);
    setForm(createEmptyUnitForm());
    setIsFormOpen(true);
    setFeedback(null);
  };

  const openEditForm = (unit: Chalet) => {
    setEditingUnitId(unit.id);
    setForm(unitToFormState(unit));
    setIsFormOpen(true);
    setFeedback(null);
  };

  const handleGovernorateSelect = (gov: string) => {
    const nextCities = getCitiesForGovernorate(gov);
    const nextCity = nextCities[0]?.name ?? '';
    const nextArea = getAreasForCity(gov, nextCity)[0] ?? '';
    setForm((prev) => ({
      ...prev,
      governorate: gov,
      city: prev.manualLocationMode ? '' : nextCity,
      areaOrVillage: prev.manualLocationMode || prev.manualAreaMode ? '' : nextArea,
    }));
  };

  const handleCitySelect = (cityName: string) => {
    const nextArea = getAreasForCity(form.governorate, cityName)[0] ?? '';
    setForm((prev) => ({
      ...prev,
      city: cityName,
      manualAreaMode: false,
      areaOrVillage: nextArea,
    }));
  };

  const handleToggleAmenity = (id: AmenityId) => {
    setForm((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(id)
        ? prev.amenities.filter((a) => a !== id)
        : [...prev.amenities, id],
    }));
  };

  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0 || !session) return;

    setUploadingImages(true);
    setFeedback(null);
    try {
      const res = await uploadPropertyImages(files, session.phone);
      if (res.error || !res.data) {
        setFeedback({ type: 'error', text: res.error ?? 'تعذر رفع الصور.' });
        return;
      }
      setForm((prev) => ({
        ...prev,
        images: [...prev.images, ...res.data],
      }));
    } finally {
      setUploadingImages(false);
    }
  };

  const handleAddManualImageUrl = () => {
    const url = form.manualImageUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      setFeedback({ type: 'error', text: 'يرجى إدخال رابط صورة يبدأ بـ https://' });
      return;
    }
    setForm((prev) => ({
      ...prev,
      images: [...prev.images, url],
      manualImageUrl: '',
    }));
  };

  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    if (!isSupabaseConfigured) {
      setFeedback({ type: 'error', text: 'الاتصال بقاعدة البيانات غير مهيأ في هذه البيئة.' });
      return;
    }
    if (!editingUnitId && !canAddAnotherUnit) {
      setFeedback({
        type: 'error',
        text: 'تجاوزت الحد الأقصى للباقة الحالية. يرجى ترقية الباقة من صفحة باقات الإعلان.',
      });
      return;
    }

    const parsedPrice = Number(form.priceText);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setFeedback({ type: 'error', text: 'يرجى إدخال سعر إيجار صحيح أكبر من صفر.' });
      return;
    }
    if (form.title.trim().length < 5) {
      setFeedback({ type: 'error', text: 'يرجى كتابة عنوان واضح للوحدة (٥ أحرف على الأقل).' });
      return;
    }
    if (!form.city.trim()) {
      setFeedback({ type: 'error', text: 'يرجى تحديد المدينة أو المركز.' });
      return;
    }

    const parsedDeposit = form.depositValueText.trim() ? Number(form.depositValueText) : 0;
    const rules = form.rulesText
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean);

    const existingUnit = editingUnitId ? units.find((u) => u.id === editingUnitId) : undefined;
    const isFeatured = Boolean(quota?.activePlan.isFeaturedEligible || existingUnit?.isFeatured);

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      governorate: form.governorate,
      city: form.city.trim(),
      areaOrVillage: form.areaOrVillage.trim(),
      propertyType: form.propertyType,
      advertiserRole: form.advertiserRole,
      ownerName: session.name,
      ownerPhone: session.phone,
      isFeatured,
      depositType: form.depositType,
      depositValue: Number.isFinite(parsedDeposit) && parsedDeposit > 0 ? parsedDeposit : 0,
      pricePerNight: parsedPrice,
      monthlyPrice: form.propertyType === 'شقة فاضية' ? parsedPrice : undefined,
      bedrooms: Math.max(0, Number(form.bedrooms) || 1),
      bathrooms: Math.max(1, Number(form.bathrooms) || 1),
      maxGuests: Math.max(1, Number(form.maxGuests) || 2),
      areaSqm: form.areaSqmText.trim() ? Number(form.areaSqmText) : undefined,
      images: form.images,
      amenities: form.amenities,
      blockedDates: existingUnit?.blockedDates ?? [],
      rules,
      availabilityStatus: existingUnit?.availabilityStatus ?? ('active' as const),
    };

    setSavingUnit(true);
    setFeedback(null);
    try {
      const res = editingUnitId
        ? await updateChaletRecord(editingUnitId, payload)
        : await insertChaletRecord(payload);

      if (res.error || !res.data) {
        setFeedback({ type: 'error', text: res.error ?? 'تعذر حفظ الوحدة.' });
        return;
      }

      setFeedback({
        type: 'success',
        text: editingUnitId ? 'تم تحديث بيانات الوحدة بنجاح.' : 'تم نشر وحدتك بنجاح وظهرت الآن في الرئيسية.',
      });
      setIsFormOpen(false);
      setEditingUnitId(null);
      await loadOwnerData(session);
      onDataChanged?.();
    } finally {
      setSavingUnit(false);
    }
  };

  const handleToggleVisibility = async (unit: Chalet) => {
    if (!session) return;
    const nextStatus = unit.availabilityStatus === 'active' ? 'hidden' : 'active';
    const res = await updateChaletRecord(unit.id, { availabilityStatus: nextStatus });
    if (res.error) {
      setFeedback({ type: 'error', text: res.error });
      return;
    }
    setFeedback({
      type: 'success',
      text: nextStatus === 'active' ? 'تم إظهار الوحدة في البحث.' : 'تم إخفاء الوحدة مؤقتاً.',
    });
    await loadOwnerData(session);
    onDataChanged?.();
  };

  const handleDeleteUnit = async (unit: Chalet) => {
    if (!session) return;
    if (!window.confirm(`هل أنت متأكد من حذف "${unit.title}" نهائياً؟`)) return;
    const res = await deleteChaletRecord(unit.id);
    if (res.error) {
      setFeedback({ type: 'error', text: res.error });
      return;
    }
    setFeedback({ type: 'success', text: 'تم حذف الوحدة بنجاح.' });
    await loadOwnerData(session);
    onDataChanged?.();
  };

  const handleAddBlockedDatesRange = async (unit: Chalet) => {
    if (!session || !blockStartDate) return;
    const end = blockEndDate && blockEndDate >= blockStartDate ? blockEndDate : blockStartDate;
    const addedDates: string[] = [];
    let cursor = blockStartDate;
    for (let i = 0; i < 90; i += 1) {
      addedDates.push(cursor);
      if (cursor >= end) break;
      cursor = addDaysIso(cursor, 1);
    }
    const nextBlocked = Array.from(new Set([...unit.blockedDates, ...addedDates])).sort();
    setSavingCalendar(true);
    try {
      const res = await updateChaletRecord(unit.id, { blockedDates: nextBlocked });
      if (res.error) {
        setFeedback({ type: 'error', text: res.error });
        return;
      }
      setFeedback({ type: 'success', text: 'تم تحديث التواريخ المغلقة بنجاح.' });
      await loadOwnerData(session);
      onDataChanged?.();
    } finally {
      setSavingCalendar(false);
    }
  };

  const handleRemoveBlockedDate = async (unit: Chalet, dateIso: string) => {
    if (!session) return;
    const nextBlocked = unit.blockedDates.filter((d) => d !== dateIso);
    setSavingCalendar(true);
    try {
      const res = await updateChaletRecord(unit.id, { blockedDates: nextBlocked });
      if (res.error) {
        setFeedback({ type: 'error', text: res.error });
        return;
      }
      await loadOwnerData(session);
      onDataChanged?.();
    } finally {
      setSavingCalendar(false);
    }
  };

  // Fast Phone + Name Gate
  if (!session) {
    return (
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-stone-200/70 bg-white p-6 shadow-xs sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1E3A5F] text-white">
            <Building2 className="h-6 w-6 text-[#C5A880]" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-[#1E3A5F]">بوابة المعلن السريعة</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">
            أدخل اسمك ورقم هاتفك (واتساب) للدخول الفوري وإدارة وحداتك وتقويم الحجوزات بدون تعقيد.
          </p>

          <form onSubmit={handleLoginSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="owner-name" className="mb-1.5 block text-xs font-semibold text-slate-700">
                الاسم بالكامل أو اسم المكتب العقاري
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="owner-name"
                  type="text"
                  required
                  value={loginName}
                  onChange={(e) => setLoginName(e.target.value)}
                  placeholder="مثال: أ. كريم عبد الله"
                  className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] pl-3 pr-10 text-sm text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="owner-phone" className="mb-1.5 block text-xs font-semibold text-slate-700">
                رقم الهاتف / واتساب
              </label>
              <div className="relative">
                <Phone className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="owner-phone"
                  type="tel"
                  required
                  dir="ltr"
                  value={loginPhone}
                  onChange={(e) => setLoginPhone(e.target.value)}
                  placeholder="01012345678"
                  className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] pl-3 pr-10 text-right text-sm text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {loginError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              className="min-h-[48px] w-full rounded-xl bg-[#1E3A5F] px-5 py-3 text-sm font-bold text-white shadow-xs transition hover:bg-[#172E4D]"
            >
              دخول إلى بوابة المعلن
            </button>
          </form>
        </div>
      </main>
    );
  }

  const isMonthlySelected = form.propertyType === 'شقة فاضية';

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stone-200/70 bg-white p-5 shadow-xs">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF9F6] px-3 py-1 text-xs font-semibold text-[#1E3A5F]">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            أهلاً بك، {session.name} ({session.phone})
          </span>
          <h1 className="mt-2 text-2xl font-bold text-[#1E3A5F]">إدارة وحداتك وإعلاناتك</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void loadOwnerData(session)}
            disabled={loading}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3.5 py-2 text-xs font-semibold text-[#1E3A5F] hover:bg-slate-100 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>

          <button
            type="button"
            onClick={openAddForm}
            className={`inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold shadow-xs transition ${
              canAddAnotherUnit
                ? 'bg-[#1E3A5F] text-white hover:bg-[#172E4D]'
                : 'border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
            }`}
          >
            <Plus className="h-4 w-4" />
            <span>إضافة وحدة جديدة</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-stone-200/70 bg-white px-3.5 py-2 text-xs font-semibold text-[#6B7280] hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            <span>تغيير الرقم</span>
          </button>
        </div>
      </div>

      {/* Quota & Subscription Dashboard Card */}
      {quota && (
        <section
          aria-label="ملخص رصيد الإعلانات والاشتراك"
          className="mt-5 rounded-2xl border border-stone-200/70 bg-white p-5 shadow-xs sm:p-6"
        >
          <div className="flex flex-col justify-between gap-4 border-b border-stone-100 pb-4 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <Crown className="h-5 w-5 text-[#C5A880]" />
              <span className="text-base font-bold text-[#1E3A5F]">
                باقتك الحالية: {quota.activePlan.name}
              </span>

              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  quota.subscriptionStatus === 'active'
                    ? 'bg-emerald-50 text-emerald-700'
                    : quota.subscriptionStatus === 'pending'
                    ? 'bg-amber-50 text-amber-800'
                    : quota.subscriptionStatus === 'rejected'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-stone-100 text-[#6B7280]'
                }`}
              >
                {quota.subscriptionStatus === 'active'
                  ? 'اشتراك مفعّل'
                  : quota.subscriptionStatus === 'pending'
                  ? 'طلب ترقية قيد المراجعة'
                  : quota.subscriptionStatus === 'rejected'
                  ? 'طلب سابق مرفوض'
                  : 'باقة مجانية'}
              </span>

              {quota.activePlan.isFeaturedEligible && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#C5A880] px-2.5 py-0.5 text-[11px] font-bold text-[#1F2937]">
                  <Sparkles className="h-3 w-3" />
                  شارة مميز مفعّلة
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => onNavigate('pricing')}
              className={`min-h-[42px] shrink-0 rounded-xl px-4 py-2 text-xs font-bold shadow-xs transition ${
                !canAddAnotherUnit
                  ? 'bg-[#1E3A5F] text-white hover:bg-[#172E4D]'
                  : 'bg-[#C5A880] text-[#1F2937] hover:bg-[#b5976d]'
              }`}
            >
              {!canAddAnotherUnit
                ? 'وصلت للحد الأقصى — ترقية الباقة الآن'
                : 'ترقية الباقة لزيادة الرصيد والتمييز'}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-4 py-3">
              <span className="block text-[11px] font-semibold text-[#6B7280]">
                الإعلانات المستخدمة
              </span>
              <span className="mt-1 block text-xl font-bold text-[#1E3A5F]">
                {units.length.toLocaleString('ar-EG')}
                <span className="mr-1 text-xs font-medium text-[#6B7280]">
                  من أصل {quota.maxUnits.toLocaleString('ar-EG')}
                </span>
              </span>
            </div>

            <div className="rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-4 py-3">
              <span className="block text-[11px] font-semibold text-[#6B7280]">
                الإعلانات المتبقية
              </span>
              <span
                className={`mt-1 block text-xl font-bold ${
                  canAddAnotherUnit ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {Math.max(0, quota.maxUnits - units.length).toLocaleString('ar-EG')}
                <span className="mr-1 text-xs font-medium text-[#6B7280]">
                  {Math.max(0, quota.maxUnits - units.length) === 1 ? 'إعلان متبقٍ' : 'إعلانات متبقية'}
                </span>
              </span>
            </div>

            <div className="rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-4 py-3">
              <span className="block text-[11px] font-semibold text-[#6B7280]">
                حالة الاشتراك والتمييز
              </span>
              <span className="mt-1 block text-sm font-bold text-[#1F2937]">
                {quota.activePlan.priorityLabel}
              </span>
            </div>
          </div>

          {!canAddAnotherUnit && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-950">
              <span>
                وصلت للحد الأقصى المسموح به في باقتك الحالية ({quota.maxUnits.toLocaleString('ar-EG')}{' '}
                {quota.maxUnits === 1 ? 'إعلان' : 'إعلانات'}). قم بالترقية لإضافة وحدات جديدة وتفعيل شارة الإعلان المميز.
              </span>
              <button
                type="button"
                onClick={() => onNavigate('pricing')}
                className="rounded-lg bg-[#1E3A5F] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#172E4D]"
              >
                عرض الباقات والترقية
              </button>
            </div>
          )}

          {quota.pendingSubscription && (
            <p className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-2.5 text-xs font-semibold text-amber-900">
              طلبك قيد المراجعة: {quota.pendingSubscription.planName} — سيتم تفعيل الباقة وتمييز وحداتك تلقائياً فور اعتماد الإيصال من الأدمن.
            </p>
          )}

          {!quota.activeSubscription && !quota.pendingSubscription && quota.latestRejectedSubscription && (
            <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-800">
              تنبيه: تم رفض طلب اشتراك ({quota.latestRejectedSubscription.planName}). يرجى مراجعة الإيصال وإعادة التقديم من صفحة الباقات.
            </p>
          )}
        </section>
      )}

      {feedback && (
        <div
          className={`mt-5 flex items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-xs font-bold ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
          role="alert"
        >
          <span className="inline-flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-600" />
            )}
            {feedback.text}
          </span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="rounded-lg p-1 hover:bg-black/5"
            aria-label="إغلاق التنبيه"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loadError && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800">
          {loadError}
        </div>
      )}

      {/* Add / Edit Form */}
      {isFormOpen && (
        <section className="mt-6 rounded-2xl border border-[#1E3A5F]/20 bg-white p-5 shadow-xs sm:p-7">
          <div className="flex items-center justify-between border-b border-stone-100 pb-4">
            <h2 className="text-lg font-bold text-[#1E3A5F]">
              {editingUnitId ? 'تعديل بيانات الوحدة' : 'إضافة وحدة عقارية جديدة'}
            </h2>
            <button
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                setEditingUnitId(null);
              }}
              className="rounded-xl p-2 text-[#6B7280] hover:bg-slate-100"
              aria-label="إغلاق النموذج"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSaveUnit} className="mt-5 space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  عنوان الإعلان
                </label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="مثال: شاليه غرفتين يطل على البحيرة في مراسي"
                  className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-sm text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  نوع العقار
                </label>
                <select
                  value={form.propertyType}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, propertyType: e.target.value as PropertyType }))
                  }
                  className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-sm font-semibold text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                >
                  {EDITABLE_PROPERTY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  صفة المعلن
                </label>
                <select
                  value={form.advertiserRole}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      advertiserRole: e.target.value as AdvertiserRoleLabel,
                    }))
                  }
                  className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-sm font-semibold text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                >
                  {EDITABLE_ADVERTISER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 3-Level Location + Manual Override */}
            <div className="rounded-2xl border border-stone-200/70 bg-[#FAF9F6] p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1E3A5F]">
                  <MapPin className="h-4 w-4 text-[#C5A880]" />
                  الموقع (المحافظة ← المدينة ← القرية / المنطقة)
                </span>
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#6B7280]">
                  <input
                    type="checkbox"
                    checked={form.manualLocationMode}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, manualLocationMode: e.target.checked }))
                    }
                    className="h-4 w-4 accent-[#1E3A5F]"
                  />
                  <span>إدخال المدينة والمنطقة يدوياً</span>
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#6B7280]">المحافظة</label>
                  <select
                    value={form.governorate}
                    onChange={(e) => handleGovernorateSelect(e.target.value)}
                    className="h-11 w-full rounded-xl border border-stone-200/70 bg-white px-3 text-xs font-semibold text-[#1F2937] focus:border-[#1E3A5F] focus:outline-none sm:text-sm"
                  >
                    {ALL_GOVERNORATE_NAMES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#6B7280]">
                    المدينة / المركز
                  </label>
                  {form.manualLocationMode ? (
                    <input
                      type="text"
                      required
                      value={form.city}
                      onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                      placeholder="اكتب اسم المدينة..."
                      className="h-11 w-full rounded-xl border border-stone-200/70 bg-white px-3 text-xs font-semibold text-[#1F2937] focus:border-[#1E3A5F] focus:outline-none sm:text-sm"
                    />
                  ) : (
                    <select
                      value={form.city}
                      onChange={(e) => handleCitySelect(e.target.value)}
                      className="h-11 w-full rounded-xl border border-stone-200/70 bg-white px-3 text-xs font-semibold text-[#1F2937] focus:border-[#1E3A5F] focus:outline-none sm:text-sm"
                    >
                      {citiesForSelectedGov.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#6B7280]">
                    القرية / المنطقة / الحي
                  </label>
                  {form.manualLocationMode || form.manualAreaMode ? (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={form.areaOrVillage}
                        onChange={(e) => setForm((p) => ({ ...p, areaOrVillage: e.target.value }))}
                        placeholder="اكتب اسم القرية أو الكمبوند يدوياً..."
                        className="h-11 w-full rounded-xl border border-stone-200/70 bg-white px-3 text-xs font-semibold text-[#1F2937] focus:border-[#1E3A5F] focus:outline-none sm:text-sm"
                      />
                      {!form.manualLocationMode && areasForSelectedCity.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setForm((p) => ({
                              ...p,
                              manualAreaMode: false,
                              areaOrVillage: areasForSelectedCity[0] ?? '',
                            }))
                          }
                          className="h-11 shrink-0 rounded-xl border border-stone-200/70 bg-white px-2.5 text-[11px] font-semibold text-[#1E3A5F] hover:bg-stone-50"
                        >
                          القائمة
                        </button>
                      )}
                    </div>
                  ) : (
                    <select
                      value={form.areaOrVillage}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__custom__') {
                          setForm((p) => ({ ...p, manualAreaMode: true, areaOrVillage: '' }));
                        } else {
                          setForm((p) => ({ ...p, areaOrVillage: val }));
                        }
                      }}
                      className="h-11 w-full rounded-xl border border-stone-200/70 bg-white px-3 text-xs font-semibold text-[#1F2937] focus:border-[#1E3A5F] focus:outline-none sm:text-sm"
                    >
                      <option value="">اختر المنطقة (اختياري)</option>
                      {areasForSelectedCity.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                      <option value="__custom__">+ أخرى (كتابة اسم قرية أو كمبوند يدوياً)</option>
                    </select>
                  )}
                </div>
              </div>
            </div>

            {/* Price & Flexible Deposit */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  {isMonthlySelected ? 'الإيجار الشهري (ج.م)' : 'سعر الليلة (ج.م)'}
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={form.priceText}
                  onChange={(e) => setForm((p) => ({ ...p, priceText: e.target.value }))}
                  placeholder={isMonthlySelected ? 'مثال: 15000' : 'مثال: 2500'}
                  className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-sm font-semibold text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  نوع العربون الاسترشادي
                </label>
                <select
                  value={form.depositType}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, depositType: e.target.value as DepositType }))
                  }
                  className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-sm font-semibold text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                >
                  <option value="percent">نسبة مئوية (%)</option>
                  <option value="fixed">مبلغ ثابت (ج.م)</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  قيمة العربون ({form.depositType === 'percent' ? '%' : 'ج.م'}) — اختياري
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.depositValueText}
                  onChange={(e) => setForm((p) => ({ ...p, depositValueText: e.target.value }))}
                  placeholder={form.depositType === 'percent' ? 'مثال: 20' : 'مثال: 1000'}
                  className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-sm font-semibold text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {/* Specs */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">غرف النوم</label>
                <input
                  type="number"
                  min={0}
                  value={form.bedrooms}
                  onChange={(e) => setForm((p) => ({ ...p, bedrooms: e.target.value }))}
                  className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-sm text-[#1F2937]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">الحمامات</label>
                <input
                  type="number"
                  min={1}
                  value={form.bathrooms}
                  onChange={(e) => setForm((p) => ({ ...p, bathrooms: e.target.value }))}
                  className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-sm text-[#1F2937]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">أقصى عدد أفراد</label>
                <input
                  type="number"
                  min={1}
                  value={form.maxGuests}
                  onChange={(e) => setForm((p) => ({ ...p, maxGuests: e.target.value }))}
                  className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-sm text-[#1F2937]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">المساحة (م²)</label>
                <input
                  type="number"
                  min={10}
                  value={form.areaSqmText}
                  onChange={(e) => setForm((p) => ({ ...p, areaSqmText: e.target.value }))}
                  placeholder="اختياري"
                  className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-sm text-[#1F2937]"
                />
              </div>
            </div>

            {/* Description & Rules */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  وصف تفصيلي للوحدة
                </label>
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="اذكر الإطلالة، الطابق، القرب من البحر أو الخدمات، وحالة الفرش..."
                  className="w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] p-3 text-sm text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  شروط وملاحظات الإيجار (سطر لكل شرط)
                </label>
                <textarea
                  rows={4}
                  value={form.rulesText}
                  onChange={(e) => setForm((p) => ({ ...p, rulesText: e.target.value }))}
                  placeholder="العائلات فقط&#10;الدخول الساعة ٢ ظهراً"
                  className="w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] p-3 text-sm text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {/* Amenities */}
            <div>
              <span className="mb-2 block text-xs font-semibold text-slate-700">المميزات المتوفرة</span>
              <div className="flex flex-wrap gap-2">
                {AMENITIES.map((a) => {
                  const selected = form.amenities.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => handleToggleAmenity(a.id)}
                      className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                        selected
                          ? 'border-[#1E3A5F] bg-[#1E3A5F] text-white'
                          : 'border-stone-200/70 bg-[#FAF9F6] text-[#1F2937] hover:border-[#C5A880]'
                      }`}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Property Images (`property-images`) */}
            <div className="rounded-2xl border border-stone-200/70 bg-[#FAF9F6] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="block text-xs font-bold text-[#1E3A5F]">
                    صور الوحدة (تُرفع في حاوية property-images)
                  </span>
                  <span className="text-[11px] text-[#6B7280]">
                    يتم ضغط الصور تلقائياً بصيغة WebP لتسريع التحميل.
                  </span>
                </div>

                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#1E3A5F] px-4 py-2 text-xs font-bold text-white hover:bg-[#172E4D]">
                  <ImagePlus className="h-4 w-4" />
                  <span>{uploadingImages ? 'جاري الرفع...' : 'رفع صور من الجهاز'}</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    disabled={uploadingImages}
                    onChange={(e) => void handleUploadFiles(e)}
                    className="sr-only"
                  />
                </label>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  type="url"
                  dir="ltr"
                  value={form.manualImageUrl}
                  onChange={(e) => setForm((p) => ({ ...p, manualImageUrl: e.target.value }))}
                  placeholder="أو أضف رابط صورة مباشر https://..."
                  className="h-10 min-w-[220px] flex-1 rounded-xl border border-stone-200/70 bg-white px-3 text-xs text-[#1F2937]"
                />
                <button
                  type="button"
                  onClick={handleAddManualImageUrl}
                  className="h-10 rounded-xl border border-stone-200/70 bg-white px-3.5 text-xs font-bold text-[#1E3A5F] hover:bg-slate-100"
                >
                  إضافة الرابط
                </button>
              </div>

              {form.images.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
                  {form.images.map((url, idx) => (
                    <div
                      key={`${url}-${idx}`}
                      className="group relative aspect-square overflow-hidden rounded-xl border border-stone-200/70 bg-white"
                    >
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() =>
                          setForm((p) => ({
                            ...p,
                            images: p.images.filter((_, i) => i !== idx),
                          }))
                        }
                        aria-label="حذف الصورة"
                        className="absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white shadow-xs"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-stone-100 pt-4">
              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                  setEditingUnitId(null);
                }}
                className="min-h-[44px] rounded-xl border border-stone-200/70 bg-white px-5 py-2 text-xs font-bold text-[#6B7280] hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={savingUnit || uploadingImages}
                className="min-h-[44px] rounded-xl bg-[#1E3A5F] px-6 py-2 text-sm font-bold text-white shadow-xs hover:bg-[#172E4D] disabled:opacity-60"
              >
                {savingUnit
                  ? 'جاري الحفظ...'
                  : editingUnitId
                  ? 'حفظ التعديلات'
                  : 'نشر الوحدة الآن'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Owner Units List */}
      <section className="mt-7">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#1E3A5F]">
            وحداتي المنشورة ({units.length.toLocaleString('ar-EG')})
          </h2>
        </div>

        {loading && units.length === 0 ? (
          <div className="rounded-2xl border border-stone-200/70 bg-white p-10 text-center text-sm text-[#6B7280]">
            جاري تحميل وحداتك...
          </div>
        ) : units.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <Building2 className="mx-auto h-10 w-10 text-[#C5A880]" />
            <h3 className="mt-3 text-base font-bold text-[#1F2937]">لم تضف أي وحدة بعد</h3>
            <p className="mt-1 text-xs text-[#6B7280]">
              ابدأ بنشر وحدتك الأولى مجاناً واستقبل طلبات المستأجرين مباشرة على واتساب.
            </p>
            <button
              type="button"
              onClick={openAddForm}
              className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#1E3A5F] px-5 py-2 text-xs font-bold text-white hover:bg-[#172E4D]"
            >
              <Plus className="h-4 w-4" />
              <span>أضف وحدتك الأولى الآن</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {units.map((unit) => {
              const isHidden = unit.availabilityStatus !== 'active';
              const isCalendarOpen = calendarUnitId === unit.id;
              return (
                <div
                  key={unit.id}
                  className="rounded-2xl border border-stone-200/70 bg-white p-4 shadow-xs sm:p-5"
                >
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                    <div className="flex items-start gap-4">
                      <div className="h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                        {unit.images[0] ? (
                          <img
                            src={unit.images[0]}
                            alt={unit.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-[#1E3A5F] text-[#C5A880]">
                            <Building2 className="h-6 w-6" />
                          </div>
                        )}
                      </div>

                      <div>
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
                          {unit.isFeatured && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#C5A880] px-2.5 py-0.5 text-[11px] font-bold text-[#1F2937]">
                              <Sparkles className="h-3 w-3" />
                              مميز
                            </span>
                          )}
                        </div>

                        <h3 className="mt-1.5 text-base font-bold text-[#1F2937]">{unit.title}</h3>
                        <p className="mt-0.5 text-xs text-[#6B7280]">
                          {[unit.governorate, unit.city, unit.areaOrVillage]
                            .filter(Boolean)
                            .join(' • ')}{' '}
                          —{' '}
                          <strong className="text-[#1E3A5F]">
                            {formatEGP(unit.pricePerNight)} ({getPriceUnitLabel(unit)})
                          </strong>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setCalendarUnitId((prev) => (prev === unit.id ? null : unit.id))
                        }
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 py-1.5 text-xs font-semibold text-[#1E3A5F] hover:bg-slate-100"
                      >
                        <Calendar className="h-3.5 w-3.5 text-[#C5A880]" />
                        <span>التقويم ({unit.blockedDates.length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditForm(unit)}
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-stone-200/70 bg-white px-3 py-1.5 text-xs font-semibold text-[#1F2937] hover:bg-slate-50"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>تعديل</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleToggleVisibility(unit)}
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

                  {/* Manual Calendar Blocker Panel */}
                  {isCalendarOpen && (
                    <div className="mt-4 border-t border-stone-100 pt-4">
                      <h4 className="text-xs font-bold text-[#1E3A5F]">
                        حجب التواريخ المحجوزة أو المغلقة يدوياً
                      </h4>
                      <div className="mt-2.5 flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="flex-1">
                          <ArabicDateRangeField
                            checkInDate={blockStartDate}
                            checkOutDate={blockEndDate}
                            checkInLabel="من تاريخ"
                            checkOutLabel="إلى تاريخ"
                            allowClear={false}
                            allowSameDay
                            defaultSpanDays={0}
                            onChange={(start, end) => {
                              setBlockStartDate(start);
                              setBlockEndDate(end || start);
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          disabled={savingCalendar}
                          onClick={() => void handleAddBlockedDatesRange(unit)}
                          className="h-11 shrink-0 rounded-xl bg-[#1E3A5F] px-5 text-xs font-bold text-white hover:bg-[#172E4D] disabled:opacity-60"
                        >
                          {savingCalendar ? 'جاري الحفظ...' : 'إغلاق التواريخ'}
                        </button>
                      </div>

                      {unit.blockedDates.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {unit.blockedDates.map((iso) => (
                            <button
                              key={iso}
                              type="button"
                              onClick={() => void handleRemoveBlockedDate(unit, iso)}
                              title="اضغط لإتاحة هذا التاريخ"
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100"
                            >
                              <span>{formatArabicDate(iso)}</span>
                              <X className="h-3 w-3" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
