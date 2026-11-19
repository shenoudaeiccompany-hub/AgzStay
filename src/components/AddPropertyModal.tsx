import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Briefcase,
  Camera,
  Check,
  Crown,
  ImagePlus,
  KeyRound,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { MapPinPicker } from '@/components/MapPinPicker';
import {
  AMENITIES,
  DESTINATION_DEFAULT_COORDINATES,
  FREE_TIER_MAX_UNITS,
  GOVERNORATES,
  PRO_TIER_MAX_UNITS,
  PRO_TIER_MONTHLY_FEE,
  UNIT_TYPES,
  VIEW_TYPES,
  formatEGP,
} from '@/data/chalets';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  uploadChaletImages,
  type RepoResult,
} from '@/services/agzstayRepository';
import type {
  AdvertiserRole,
  AmenityId,
  AppUser,
  Chalet,
  Coordinates,
  GovernorateId,
  HostTier,
  OwnerVerificationSubmission,
  RentalDuration,
  UnitType,
  ViewType,
} from '@/types/chalet';

interface AddPropertyModalProps {
  currentUser: AppUser | null;
  verification: OwnerVerificationSubmission | null;
  hostTier?: HostTier;
  activeCustomUnitsCount?: number;
  onClose: () => void;
  onOpenAuth?: () => void;
  onAddProperty: (property: Chalet) => Promise<RepoResult<Chalet>>;
  onOpenVerification: () => void;
  onOpenUpgradeModal?: () => void;
}

const DEFAULT_FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1000&q=80';

export function AddPropertyModal({
  currentUser,
  verification,
  hostTier = 'free',
  activeCustomUnitsCount = 0,
  onClose,
  onOpenAuth,
  onAddProperty,
  onOpenVerification,
  onOpenUpgradeModal,
}: AddPropertyModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Role, Durations, Location
  const [advertiserRole, setAdvertiserRole] = useState<AdvertiserRole>('owner');
  const [brokerAgency, setBrokerAgency] = useState('');
  const [supportedDurations, setSupportedDurations] = useState<RentalDuration[]>([
    'daily',
    'weekly',
    'monthly',
  ]);
  const [unitType, setUnitType] = useState<UnitType>('furnished-apartment');
  const [viewType, setViewType] = useState<ViewType>('city-nile');
  const [title, setTitle] = useState('');
  const [governorate, setGovernorate] = useState<Exclude<GovernorateId, 'all'>>('greater-cairo');
  const initialAreas = GOVERNORATES.find((g) => g.id === 'greater-cairo')?.areas ?? [];
  const [area, setArea] = useState<string>(initialAreas[0] ?? 'التجمع الخامس');
  const [resort, setResort] = useState('');

  // Step 2: Pricing, Specs, Map
  const [pricePerNight, setPricePerNight] = useState('2200');
  const [weeklyPrice, setWeeklyPrice] = useState('14000');
  const [monthlyPrice, setMonthlyPrice] = useState('42000');
  const [securityDeposit, setSecurityDeposit] = useState('3000');
  const [bedrooms, setBedrooms] = useState('3');
  const [bathrooms, setBathrooms] = useState('2');
  const [areaSqm, setAreaSqm] = useState('150');
  const [maxGuests, setMaxGuests] = useState('6');
  const [beachDistanceMeters, setBeachDistanceMeters] = useState('0');
  const [coordinates, setCoordinates] = useState<Coordinates>(
    DESTINATION_DEFAULT_COORDINATES['greater-cairo']
  );

  // Step 3: Amenities, Photos, Owner Info
  const [includesPasses, setIncludesPasses] = useState(true);
  const [verifiedLivePhotos, setVerifiedLivePhotos] = useState(true);
  const [selectedAmenities, setSelectedAmenities] = useState<AmenityId[]>([
    'wifi',
    'ac',
    'family',
  ]);
  const [imageUrl, setImageUrl] = useState('');
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [ownerName, setOwnerName] = useState(
    verification?.ownerName ?? currentUser?.name ?? ''
  );
  const [ownerPhone, setOwnerPhone] = useState(
    verification?.phone ?? currentUser?.phone ?? ''
  );
  const [instaPayHandle, setInstaPayHandle] = useState('');
  const [downPaymentPercent, setDownPaymentPercent] = useState('25');
  const [wifiName, setWifiName] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [gateInstructions, setGateInstructions] = useState('');
  const [caretakerName, setCaretakerName] = useState('');
  const [caretakerPhone, setCaretakerPhone] = useState('');
  const [description, setDescription] = useState('');
  const [saveAsDraft, setSaveAsDraft] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const maxAllowedUnits = hostTier === 'pro' ? PRO_TIER_MAX_UNITS : FREE_TIER_MAX_UNITS;
  const isAtTierLimit = activeCustomUnitsCount >= maxAllowedUnits;

  const activeGovConfig = GOVERNORATES.find((g) => g.id === governorate);
  const availableAreas = activeGovConfig?.areas ?? [];

  const handleGovernorateChange = (nextGov: Exclude<GovernorateId, 'all'>) => {
    setGovernorate(nextGov);
    const govObj = GOVERNORATES.find((g) => g.id === nextGov);
    setArea(govObj?.areas[0] ?? '');
    setCoordinates(DESTINATION_DEFAULT_COORDINATES[nextGov]);
  };

  const toggleDuration = (dur: RentalDuration) => {
    setSupportedDurations((prev) =>
      prev.includes(dur)
        ? prev.length > 1
          ? prev.filter((d) => d !== dur)
          : prev
        : [...prev, dur]
    );
  };

  const toggleAmenity = (id: AmenityId) => {
    setSelectedAmenities((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    if (!isSupabaseConfigured || !currentUser) {
      setError('يرجى تسجيل الدخول وإعداد Supabase قبل رفع الصور.');
      e.target.value = '';
      return;
    }
    setError('');
    setIsUploadingImages(true);
    try {
      const res = await uploadChaletImages(files);
      if (res.error || !res.data) {
        setError(res.error || 'تعذر رفع الصور المختارة.');
        e.target.value = '';
        return;
      }
      setUploadedImages((prev) => [...prev, ...res.data!].slice(0, 8));
    } finally {
      setIsUploadingImages(false);
    }
  };

  const validateStep1 = () => {
    if (!title.trim() || !resort.trim()) {
      setError('يرجى إدخال عنوان الوحدة واسم الكمبوند / الشارع / القرية.');
      return false;
    }
    if (advertiserRole === 'broker' && !brokerAgency.trim()) {
      setError('يرجى إدخال اسم المكتب أو شركة الوساطة العقارية.');
      return false;
    }
    setError('');
    return true;
  };

  const validateStep2 = () => {
    const daily = Number(pricePerNight);
    if (!Number.isFinite(daily) || daily < 300) {
      setError('يرجى إدخال سعر يومي صحيح (٣٠٠ ج.م فأكثر).');
      return false;
    }
    setError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      setError('وضع تجريبي: لا يمكن نشر وحدات جديدة لعدم إعداد Supabase.');
      return;
    }
    if (!currentUser) {
      setError('يرجى تسجيل الدخول أولاً لإضافة وحدة.');
      return;
    }
    if (!ownerName.trim()) {
      setError('يرجى إدخال اسم المعلن.');
      return;
    }
    if (!/^01[0125][0-9]{8}$/.test(ownerPhone.trim())) {
      setError('يرجى إدخال رقم موبايل مصري صحيح مكون من ١١ رقماً.');
      return;
    }

    const combinedImages = [...uploadedImages];
    if (imageUrl.trim()) {
      combinedImages.push(imageUrl.trim());
    }
    if (combinedImages.length === 0) {
      combinedImages.push(DEFAULT_FALLBACK_IMAGE);
    }

    const dailyVal = Number(pricePerNight) || 2000;
    const isVerifiedOwner =
      currentUser.role === 'admin' || verification?.status === 'verified';

    const newProperty: Chalet = {
      id: `prop-${Date.now()}`,
      ownerId: currentUser.id,
      isDemo: false,
      unitNumber: Math.floor(200 + (Date.now() % 790)),
      title: title.trim(),
      listingMode: 'rent',
      supportedDurations,
      destination: governorate,
      governorate,
      area: area || undefined,
      destinationLabel: activeGovConfig?.label ?? 'القاهرة الكبرى',
      resort: resort.trim(),
      unitType,
      viewType,
      availabilityStatus: saveAsDraft
        ? 'draft'
        : isVerifiedOwner
        ? 'active'
        : 'pending_review',
      includesPasses,
      verifiedLivePhotos,
      livePhotosVerifiedAt: verifiedLivePhotos ? 'نوفمبر ٢٠٢٦' : undefined,
      hostTier,
      welcomeGuide:
        wifiName.trim() || wifiPassword.trim() || gateInstructions.trim() || caretakerPhone.trim()
          ? {
              wifiName: wifiName.trim() || 'AgzStay_Guest',
              wifiPassword: wifiPassword.trim() || 'يُرسل عند الوصول',
              gateInstructions:
                gateInstructions.trim() ||
                'التواصل مع المشرف قبل الوصول لتسليم المفاتيح وتصاريح الدخول.',
              caretakerName: caretakerName.trim() || ownerName.trim(),
              caretakerPhone: caretakerPhone.trim() || ownerPhone.trim(),
              mapsUrl: `https://maps.google.com/?q=${coordinates.lat},${coordinates.lng}`,
            }
          : undefined,
      pricePerNight: dailyVal,
      weeklyPrice: Number(weeklyPrice) || Math.round(dailyVal * 6.2),
      monthlyPrice: Number(monthlyPrice) || Math.round(dailyVal * 22),
      weekendPricePerNight: Math.round((dailyVal * 1.15) / 50) * 50,
      securityDeposit: Number(securityDeposit) || 2000,
      depositType: 'percent',
      downPaymentPercent: Math.min(100, Math.max(5, Number(downPaymentPercent) || 25)),
      bedrooms: Number(bedrooms) || 2,
      bathrooms: Number(bathrooms) || 1,
      areaSqm: Number(areaSqm) || 120,
      maxGuests: Number(maxGuests) || 4,
      beachDistanceMeters: Number(beachDistanceMeters) || 0,
      coordinates,
      rating: 0,
      reviewsCount: 0,
      featured: hostTier === 'pro',
      images: combinedImages,
      amenities: selectedAmenities.length > 0 ? selectedAmenities : ['ac'],
      description:
        description.trim() ||
        'وحدة إيجار منشورة عبر منصة AgzStay بتفاصيل وسعر شفافين للتواصل المباشر.',
      rules: [
        'التأكيد مباشرة مع المعلن قبل الوصول',
        'الالتزام بقواعد العقار أو القرية',
      ],
      owner: {
        name: ownerName.trim(),
        phone: ownerPhone.trim(),
        instaPayHandle: instaPayHandle.trim() || undefined,
        verified: isVerifiedOwner,
        roleType: advertiserRole,
        brokerAgency: advertiserRole === 'broker' ? brokerAgency.trim() : undefined,
        verificationStatus: isVerifiedOwner
          ? 'verified'
          : verification?.status ?? 'unverified',
        responseTime: 'يرد خلال دقائق',
        memberSince: '٢٠٢٦',
      },
    };

    setError('');
    setIsSubmitting(true);
    try {
      const res = await onAddProperty(newProperty);
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="إضافة وحدة للإيجار في دقيقتين"
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary-50 px-2.5 py-0.5 text-xs font-bold text-secondary-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                نشر سريع في ٣ خطوات (دقيقتان)
              </span>
              {verification?.status !== 'verified' && (
                <button
                  type="button"
                  onClick={onOpenVerification}
                  className="text-xs font-bold text-accent-600 underline hover:text-accent-700"
                >
                  توثيق الهوية بالبطاقة
                </button>
              )}
            </div>
            <h2 className="mt-1.5 text-xl font-extrabold text-slate-900">
              أضف شقتك أو شاليهك للإيجار المباشر
            </h2>
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

        {!isSupabaseConfigured ? (
          <div className="mt-5 space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
            <h3 className="text-base font-extrabold text-amber-950">
              وضع تجريبي: إضافة الوحدات معطلة
            </h3>
            <p className="text-xs text-amber-800">
              يرجى ضبط مفاتيح Supabase في <code className="font-mono">.env</code> لتفعيل النشر الحقيقي.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-white px-5 py-2 text-xs font-bold text-slate-700 shadow-sm"
            >
              إغلاق
            </button>
          </div>
        ) : !currentUser ? (
          <div className="mt-5 space-y-3 rounded-2xl border border-primary-100 bg-primary-50/70 p-6 text-center">
            <h3 className="text-base font-extrabold text-primary-900">
              سجّل دخولك أولاً لإضافة وحدة إيجار
            </h3>
            <p className="text-xs text-primary-800">
              لحماية المستأجرين وضمان ملكية الوحدات، يجب تسجيل الدخول وتوثيق حساب المالك قبل نشر الوحدة.
            </p>
            <div className="flex justify-center gap-2 pt-1">
              {onOpenAuth && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAuth();
                  }}
                  className="rounded-xl bg-primary-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-primary-700"
                >
                  تسجيل الدخول / إنشاء حساب
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700"
              >
                إغلاق
              </button>
            </div>
          </div>
        ) : isAtTierLimit ? (
          <div className="mt-5 space-y-4 rounded-2xl border-2 border-amber-300 bg-amber-50/70 p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Crown className="h-6 w-6" />
            </div>
            <h3 className="text-base font-extrabold text-slate-900">
              وصلت للحد الأقصى للوحدات في {hostTier === 'pro' ? 'الباقة الاحترافية' : 'الباقة الأساسية المجانية'} ({activeCustomUnitsCount} / {maxAllowedUnits})
            </h3>
            <p className="text-xs leading-relaxed text-slate-600">
              {hostTier === 'free'
                ? `تتيح الباقة المجانية نشر وحدة إيجار واحدة نشطة. قم بالترقية إلى الباقة الاحترافية (${formatEGP(PRO_TIER_MONTHLY_FEE)} / شهرياً) لنشر حتى ${PRO_TIER_MAX_UNITS} وحدات مع تثبيت بالبحث وشارة شريك مميز.`
                : `لقد قمت بنشر الحد الأقصى (${PRO_TIER_MAX_UNITS} وحدات) للباقة الاحترافية. يمكنك إدارة وحداتك أو حذف وحدة لإضافة غيرها.`}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {hostTier === 'free' && onOpenUpgradeModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenUpgradeModal();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-secondary-500 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-secondary-600"
                >
                  <Crown className="h-4 w-4" />
                  <span>الترقية للباقة الاحترافية ({formatEGP(PRO_TIER_MONTHLY_FEE)}/شهرياً)</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                إغلاق
              </button>
            </div>
          </div>
        ) : (
          <>
            {currentUser.role !== 'admin' && verification?.status !== 'verified' && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-950">
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold">
                    تنبيه النشر: حسابك غير موثق بعد (
                    {verification?.status === 'pending' ? 'طلبك قيد المراجعة' : 'بانتظار التوثيق'})
                  </p>
                  <p className="mt-0.5 text-[11px] text-amber-900">
                    ستُحفظ الوحدة بحالة &quot;بانتظار التوثيق (pending_review)&quot; أو كمسودة، ولن تظهر للجمهور إلا بعد اعتماد مستندات الملكية من الإدارة.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenVerification();
                  }}
                  className="shrink-0 rounded-xl bg-amber-500 px-3 py-1.5 text-[11px] font-extrabold text-slate-950 hover:bg-amber-400"
                >
                  {verification?.status === 'pending' ? 'متابعة التوثيق' : 'رفع مستند الملكية'}
                </button>
              </div>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { num: 1, label: '١. الهوية والموقع' },
                { num: 2, label: '٢. الأسعار والخريطة' },
                { num: 3, label: '٣. المميزات والصور' },
              ].map((item) => (
                <button
                  key={item.num}
                  type="button"
                  onClick={() => {
                    if (item.num < step) setStep(item.num as 1 | 2 | 3);
                  }}
                  className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                    step === item.num
                      ? 'bg-primary-600 text-white shadow-sm'
                      : step > item.num
                      ? 'bg-success-50 text-success-700'
                      : 'bg-sand-100 text-slate-500'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <span className="mb-1.5 block text-xs font-bold text-slate-700">
                  اختر صفتك كمعلن (هوية المعلن)
                </span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {[
                    {
                      id: 'owner',
                      label: 'مالك أصلي',
                      sub: 'بدون عمولة نهائياً',
                      icon: <ShieldCheck className="h-4 w-4 text-success-500" />,
                    },
                    {
                      id: 'founding-owner',
                      label: 'مالك مؤسس',
                      sub: 'أولوية وثقة مضاعفة',
                      icon: <Award className="h-4 w-4 text-amber-500" />,
                    },
                    {
                      id: 'broker',
                      label: 'وسيط معتمد (بروكر)',
                      sub: 'باسم مكتب أو شركة',
                      icon: <Briefcase className="h-4 w-4 text-sky-600" />,
                    },
                  ].map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setAdvertiserRole(r.id as AdvertiserRole)}
                      className={`rounded-2xl border p-3 text-right transition ${
                        advertiserRole === r.id
                          ? 'border-secondary-500 bg-secondary-50 ring-2 ring-secondary-500/20'
                          : 'border-slate-200 bg-white hover:bg-sand-50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900">
                        {r.icon}
                        <span>{r.label}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">{r.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {advertiserRole === 'broker' && (
                <div>
                  <label htmlFor="wizard-agency" className="mb-1 block text-xs font-bold text-slate-700">
                    اسم مكتب / شركة الوساطة المعتمدة
                  </label>
                  <input
                    id="wizard-agency"
                    type="text"
                    value={brokerAgency}
                    onChange={(e) => setBrokerAgency(e.target.value)}
                    placeholder="مثال: النيل للاستثمار العقاري"
                    className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2.5 text-sm focus:border-secondary-500 focus:bg-white focus:outline-none"
                  />
                </div>
              )}

              <div>
                <span className="mb-1.5 block text-xs font-bold text-slate-700">
                  مدد الإيجار المتاحة لهذه الوحدة
                </span>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'daily', label: 'يومي' },
                    { id: 'weekly', label: 'أسبوعي' },
                    { id: 'monthly', label: 'شهري' },
                  ].map((d) => {
                    const active = supportedDurations.includes(d.id as RentalDuration);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleDuration(d.id as RentalDuration)}
                        className={`inline-flex items-center gap-1 rounded-xl border px-3.5 py-2 text-xs font-bold ${
                          active
                            ? 'border-secondary-500 bg-secondary-50 text-secondary-700'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        {active && <Check className="h-3.5 w-3.5" />}
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label htmlFor="wizard-title" className="mb-1 block text-xs font-bold text-slate-700">
                  عنوان الوحدة
                </label>
                <input
                  id="wizard-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: شقة مفروشة ٣ غرف بالتجمع الخامس قريبة من التسعين"
                  className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2.5 text-sm focus:border-secondary-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="wizard-gov" className="mb-1 block text-xs font-bold text-slate-700">
                    المحافظة / النطاق
                  </label>
                  <select
                    id="wizard-gov"
                    value={governorate}
                    onChange={(e) =>
                      handleGovernorateChange(e.target.value as Exclude<GovernorateId, 'all'>)
                    }
                    className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2.5 text-sm focus:border-secondary-500 focus:bg-white focus:outline-none"
                  >
                    {GOVERNORATES.filter((g) => g.id !== 'all').map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="wizard-area" className="mb-1 block text-xs font-bold text-slate-700">
                    المنطقة / القرية
                  </label>
                  <select
                    id="wizard-area"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2.5 text-sm focus:border-secondary-500 focus:bg-white focus:outline-none"
                  >
                    {availableAreas.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="wizard-resort" className="mb-1 block text-xs font-bold text-slate-700">
                    الكمبوند / القرية / الشارع
                  </label>
                  <input
                    id="wizard-resort"
                    type="text"
                    value={resort}
                    onChange={(e) => setResort(e.target.value)}
                    placeholder="مثال: اللوتس الشمالية"
                    className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-sm focus:border-secondary-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="wizard-unit" className="mb-1 block text-xs font-bold text-slate-700">
                    نوع الوحدة
                  </label>
                  <select
                    id="wizard-unit"
                    value={unitType}
                    onChange={(e) => setUnitType(e.target.value as UnitType)}
                    className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-sm focus:border-secondary-500 focus:bg-white focus:outline-none"
                  >
                    {UNIT_TYPES.filter((u) => u.id !== 'all').map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="wizard-view" className="mb-1 block text-xs font-bold text-slate-700">
                    الإطلالة
                  </label>
                  <select
                    id="wizard-view"
                    value={viewType}
                    onChange={(e) => setViewType(e.target.value as ViewType)}
                    className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-sm focus:border-secondary-500 focus:bg-white focus:outline-none"
                  >
                    {VIEW_TYPES.filter((v) => v.id !== 'all').map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    السعر اليومي (ج.م)
                  </label>
                  <input
                    type="number"
                    min={300}
                    value={pricePerNight}
                    onChange={(e) => setPricePerNight(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    الأسبوعي (ج.م)
                  </label>
                  <input
                    type="number"
                    min={1000}
                    value={weeklyPrice}
                    onChange={(e) => setWeeklyPrice(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    الشهري (ج.م)
                  </label>
                  <input
                    type="number"
                    min={2000}
                    value={monthlyPrice}
                    onChange={(e) => setMonthlyPrice(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    التأمين المسترد
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={securityDeposit}
                    onChange={(e) => setSecurityDeposit(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-sm font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">الغرف</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={bedrooms}
                    onChange={(e) => setBedrooms(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">الحمامات</label>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={bathrooms}
                    onChange={(e) => setBathrooms(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">المساحة (م²)</label>
                  <input
                    type="number"
                    min={30}
                    value={areaSqm}
                    onChange={(e) => setAreaSqm(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">أقصى أفراد</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={maxGuests}
                    onChange={(e) => setMaxGuests(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">للبحر (م)</label>
                  <input
                    type="number"
                    min={0}
                    value={beachDistanceMeters}
                    onChange={(e) => setBeachDistanceMeters(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <MapPinPicker coordinates={coordinates} onChange={setCoordinates} />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <span className="mb-1.5 block text-xs font-bold text-slate-700">المميزات المتوفرة</span>
                <div className="flex flex-wrap gap-2">
                  {AMENITIES.map((amenity) => {
                    const selected = selectedAmenities.includes(amenity.id);
                    return (
                      <button
                        key={amenity.id}
                        type="button"
                        onClick={() => toggleAmenity(amenity.id)}
                        className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                          selected
                            ? 'border-secondary-500 bg-secondary-50 text-secondary-700'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        {selected && <Check className="h-3.5 w-3.5" />}
                        {amenity.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-sand-50 px-3 py-2.5 text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={includesPasses}
                  onChange={(e) => setIncludesPasses(e.target.checked)}
                  className="h-4 w-4 rounded accent-secondary-500"
                />
                <span>يشمل تصاريح الدخول والكارنيهات أو رسوم خدمات الكمبوند</span>
              </label>

              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-xs font-bold text-emerald-900">
                <input
                  type="checkbox"
                  checked={verifiedLivePhotos}
                  onChange={(e) => setVerifiedLivePhotos(e.target.checked)}
                  className="h-4 w-4 rounded accent-emerald-600"
                />
                <Camera className="h-4 w-4 text-emerald-600" />
                <span>تفعيل شارة &quot;صور حديثة على الطبيعة&quot; لتعزيز ثقة المستأجرين</span>
              </label>

              <div className="space-y-2 rounded-2xl border border-slate-200 bg-sand-50 p-3.5">
                <span className="block text-xs font-bold text-slate-700">
                  صور الوحدة (رفع من الجهاز أو رابط)
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-secondary-200 bg-white px-3.5 py-2 text-xs font-bold text-secondary-700 hover:bg-secondary-50">
                    <ImagePlus className="h-4 w-4" />
                    <span>{isUploadingImages ? 'جاري الرفع...' : 'اختر صور من جهازك'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>

                  <input
                    type="url"
                    dir="ltr"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="أو رابط صورة https://..."
                    className="min-w-[200px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs focus:border-secondary-500 focus:outline-none"
                  />
                </div>

                {uploadedImages.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {uploadedImages.map((src, idx) => (
                      <div
                        key={`${idx}-${src.slice(0, 24)}`}
                        className="relative h-16 w-20 overflow-hidden rounded-xl border border-slate-200"
                      >
                        <img src={src} alt="" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() =>
                            setUploadedImages((prev) => prev.filter((_, i) => i !== idx))
                          }
                          aria-label="حذف الصورة"
                          className="absolute left-1 top-1 rounded-full bg-slate-900/75 p-1 text-white"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="wizard-owner" className="mb-1 block text-xs font-bold text-slate-700">
                    اسم المعلن
                  </label>
                  <input
                    id="wizard-owner"
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="مثال: م. محمد حسن"
                    className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="wizard-phone" className="mb-1 block text-xs font-bold text-slate-700">
                    رقم الموبايل / واتساب
                  </label>
                  <input
                    id="wizard-phone"
                    type="tel"
                    dir="ltr"
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    placeholder="01000000000"
                    className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-left text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="wizard-instapay" className="mb-1 block text-xs font-bold text-slate-700">
                    حساب إنستاباي لجدية الحجز (اختياري)
                  </label>
                  <input
                    id="wizard-instapay"
                    type="text"
                    dir="ltr"
                    value={instaPayHandle}
                    onChange={(e) => setInstaPayHandle(e.target.value)}
                    placeholder="name@instapay"
                    className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-left text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="wizard-deposit-pct" className="mb-1 block text-xs font-bold text-slate-700">
                    نسبة جدية الحجز المطلوبة (٪)
                  </label>
                  <input
                    id="wizard-deposit-pct"
                    type="number"
                    min={5}
                    max={100}
                    step={5}
                    value={downPaymentPercent}
                    onChange={(e) => setDownPaymentPercent(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-sm font-bold"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="wizard-desc" className="mb-1 block text-xs font-bold text-slate-700">
                  وصف مختصر للوحدة
                </label>
                <textarea
                  id="wizard-desc"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="أضف تفاصيل الفرش، التكييفات، والقرب من الخدمات..."
                  className="w-full rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-2.5 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3.5">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-900">
                  <KeyRound className="h-4 w-4 text-emerald-600" />
                  <span>بيانات بطاقة الترحيب التلقائية (تظهر للمستأجر فور تأكيد الجدية)</span>
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <input
                    type="text"
                    value={wifiName}
                    onChange={(e) => setWifiName(e.target.value)}
                    placeholder="اسم شبكة Wi-Fi"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  />
                  <input
                    type="text"
                    dir="ltr"
                    value={wifiPassword}
                    onChange={(e) => setWifiPassword(e.target.value)}
                    placeholder="كلمة سر Wi-Fi"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs"
                  />
                  <input
                    type="text"
                    value={caretakerName}
                    onChange={(e) => setCaretakerName(e.target.value)}
                    placeholder="اسم المشرف / البواب"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  />
                  <input
                    type="tel"
                    dir="ltr"
                    value={caretakerPhone}
                    onChange={(e) => setCaretakerPhone(e.target.value)}
                    placeholder="موبايل المشرف للاستلام"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs"
                  />
                </div>
                <input
                  type="text"
                  value={gateInstructions}
                  onChange={(e) => setGateInstructions(e.target.value)}
                  placeholder="تعليمات البوابة والكمبوند (مثال: بوابة ٢ — استلام المفاتيح من الأمن)"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                />
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-xl bg-error-50 px-3 py-2 text-xs font-semibold text-error-700">
              {error}
            </p>
          )}

              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-sand-50 px-3 py-2 text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={saveAsDraft}
                  onChange={(e) => setSaveAsDraft(e.target.checked)}
                  className="h-4 w-4 rounded accent-primary-600"
                />
                <span>حفظ كمسودة (draft) فقط دون نشر علني الآن</span>
              </label>

              <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                {step > 1 ? (
                  <button
                    type="button"
                    onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <ArrowRight className="h-4 w-4" />
                    <span>السابق</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    إلغاء
                  </button>
                )}

                {step < 3 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (step === 1 && validateStep1()) setStep(2);
                      else if (step === 2 && validateStep2()) setStep(3);
                    }}
                    className="inline-flex items-center gap-1 rounded-xl bg-primary-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-primary-700"
                  >
                    <span>التالي</span>
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isUploadingImages || isSubmitting}
                    className="rounded-xl bg-secondary-500 px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-secondary-600 disabled:opacity-60"
                  >
                    {isSubmitting
                      ? 'جاري الحفظ...'
                      : saveAsDraft
                      ? 'حفظ كمسودة (draft)'
                      : verification?.status === 'verified' || currentUser.role === 'admin'
                      ? 'نشر الوحدة للإيجار'
                      : 'حفظ للمراجعة لحين التوثيق'}
                  </button>
                )}
              </div>
        </form>
          </>
        )}
      </div>
    </div>
  );
}
