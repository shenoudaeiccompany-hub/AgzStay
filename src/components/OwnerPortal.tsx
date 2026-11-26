import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  Crown,
  Edit3,
  Eye,
  EyeOff,
  FileCheck2,
  ImagePlus,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
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
import { normalizeEgyptianPhone } from '@/data/subscriptions';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  deleteChaletRecord,
  ensureOwnerRole,
  fetchMyOwnerVerification,
  fetchMyProfile,
  fetchMySubscriptionSummary,
  fetchOwnerChalets,
  fetchOwnerContactRevealStats,
  getCurrentAuthUser,
  insertChaletWithContact,
  isValidEgyptianMobile,
  onAuthStateChange,
  sendPasswordResetEmail,
  signInWithEmailPassword,
  signOutAuth,
  signUpOwnerAccount,
  submitOwnerVerificationRpc,
  updateChaletWithContact,
  updateMyPassword,
  updateMyProfile,
  uploadPropertyImages,
  uploadVerificationDocumentFile,
  upsertChaletPricingRule,
} from '@/services/agzstayRepository';
import type {
  AdvertiserRoleLabel,
  AdvertiserTypeCode,
  AmenityId,
  AuthUserSummary,
  Chalet,
  DepositType,
  MySubscriptionSummary,
  OwnerRevealStats,
  OwnerVerificationRecord,
  PropertyType,
  RouteSection,
  UserProfile,
  VerificationDocumentType,
} from '@/types/chalet';
import {
  addDaysIso,
  buildOwnerMarketingCopy,
  formatArabicDate,
  formatIsoDate,
} from '@/utils/bookingPricing';

interface OwnerPortalProps {
  onNavigate: (section: RouteSection) => void;
  onDataChanged?: () => void;
  isPasswordRecovery?: boolean;
  onPasswordRecoveryComplete?: () => void;
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
  ownerPhone: string;
  priceText: string;
  weekendPriceText: string;
  seasonalPriceText: string;
  seasonalLabel: string;
  seasonalStart: string;
  seasonalEnd: string;
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

function createEmptyUnitForm(defaultPhone = '', defaultAdvType: AdvertiserTypeCode = 'owner'): UnitFormState {
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
    advertiserRole: defaultAdvType === 'broker' ? 'مكتب / وسيط' : 'مالك مباشر',
    ownerPhone: defaultPhone,
    priceText: '',
    weekendPriceText: '',
    seasonalPriceText: '',
    seasonalLabel: '',
    seasonalStart: '',
    seasonalEnd: '',
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

function unitToFormState(unit: Chalet, fallbackPhone = ''): UnitFormState {
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
    ownerPhone: unit.ownerPhone || fallbackPhone,
    priceText: unit.pricePerNight > 0 ? String(unit.pricePerNight) : '',
    weekendPriceText: unit.weekendPrice && unit.weekendPrice > 0 ? String(unit.weekendPrice) : '',
    seasonalPriceText:
      unit.seasonalPrice && unit.seasonalPrice > 0 ? String(unit.seasonalPrice) : '',
    seasonalLabel: unit.seasonalLabel ?? '',
    seasonalStart: unit.seasonalStart ?? '',
    seasonalEnd: unit.seasonalEnd ?? '',
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

export function OwnerPortal({
  onNavigate,
  onDataChanged,
  isPasswordRecovery = false,
  onPasswordRecoveryComplete,
}: OwnerPortalProps) {
  const [authChecking, setAuthChecking] = useState(true);
  const [authUser, setAuthUser] = useState<AuthUserSummary | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Supabase Auth form states
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupAdvType, setSignupAdvType] = useState<AdvertiserTypeCode>('owner');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccessNotice, setAuthSuccessNotice] = useState('');

  // Password recovery update state
  const [localRecoveryActive, setLocalRecoveryActive] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [savingNewPassword, setSavingNewPassword] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');

  // Profile editor toggle
  const [isProfileEditOpen, setIsProfileEditOpen] = useState(false);
  const [editProfileName, setEditProfileName] = useState('');
  const [editProfilePhone, setEditProfilePhone] = useState('');
  const [editProfileAdvType, setEditProfileAdvType] = useState<AdvertiserTypeCode>('owner');
  const [savingProfile, setSavingProfile] = useState(false);

  const [units, setUnits] = useState<Chalet[]>([]);
  const [subSummary, setSubSummary] = useState<MySubscriptionSummary | null>(null);
  const [myVerification, setMyVerification] = useState<OwnerVerificationRecord | null>(null);
  const [revealStats, setRevealStats] = useState<OwnerRevealStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
    showUpgradeCta?: boolean;
  } | null>(null);

  // Verification submission form state
  const [isVerificationFormOpen, setIsVerificationFormOpen] = useState(false);
  const [verDocType, setVerDocType] = useState<VerificationDocumentType>('national-id');
  const [verDocNumber, setVerDocNumber] = useState('');
  const [verPhone, setVerPhone] = useState('');
  const [verFile, setVerFile] = useState<File | null>(null);
  const [submittingVerification, setSubmittingVerification] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [form, setForm] = useState<UnitFormState>(() => createEmptyUnitForm());
  const [uploadingImages, setUploadingImages] = useState(false);
  const [savingUnit, setSavingUnit] = useState(false);

  const [calendarUnitId, setCalendarUnitId] = useState<string | null>(null);
  const [blockStartDate, setBlockStartDate] = useState(() => formatIsoDate(new Date()));
  const [blockEndDate, setBlockEndDate] = useState(() => formatIsoDate(new Date()));
  const [savingCalendar, setSavingCalendar] = useState(false);
  const [copiedMarketingUnitId, setCopiedMarketingUnitId] = useState<string | null>(null);

  const loadOwnerData = useCallback(async (user: AuthUserSummary | null) => {
    if (!user) return;
    setLoading(true);
    setLoadError('');
    try {
      let profRes = await fetchMyProfile();
      if (profRes.data && profRes.data.role === 'guest') {
        const upgraded = await ensureOwnerRole(profRes.data.advertiserType);
        if (upgraded.data) profRes = upgraded;
      }

      if (profRes.data) {
        setProfile(profRes.data);
        setEditProfileName(profRes.data.name);
        setEditProfilePhone(profRes.data.phone);
        setEditProfileAdvType(profRes.data.advertiserType);
        setVerPhone((prev) => prev || profRes.data?.phone || '');
      }

      const [unitsRes, subRes, verRes, statsRes] = await Promise.all([
        fetchOwnerChalets(),
        fetchMySubscriptionSummary(),
        fetchMyOwnerVerification(),
        fetchOwnerContactRevealStats(),
      ]);

      if (unitsRes.error) {
        setLoadError(unitsRes.error);
      } else {
        setUnits(unitsRes.data ?? []);
      }

      if (!subRes.error && subRes.data) {
        setSubSummary(subRes.data);
      }

      if (!verRes.error) {
        setMyVerification(verRes.data);
        if (verRes.data) {
          setVerDocType(verRes.data.documentType);
          setVerDocNumber(verRes.data.documentNumber);
          if (verRes.data.phone) setVerPhone(verRes.data.phone);
        }
      }

      if (!statsRes.error && statsRes.data) {
        setRevealStats(statsRes.data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const user = await getCurrentAuthUser();
        if (!active) return;
        setAuthUser(user);
        if (user) {
          await loadOwnerData(user);
        }
      } finally {
        if (active) setAuthChecking(false);
      }
    };
    void init();

    const unsubscribe = onAuthStateChange((user, event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setLocalRecoveryActive(true);
      }
      setAuthUser(user);
      if (user) {
        void loadOwnerData(user);
      } else {
        setProfile(null);
        setUnits([]);
        setSubSummary(null);
        setMyVerification(null);
        setRevealStats(null);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [loadOwnerData]);

  const maxUnits = subSummary?.maxUnits ?? 1;
  const usedUnitsCount = subSummary ? Math.max(subSummary.usedUnits, units.length) : units.length;
  const remainingUnitsCount = Math.max(0, maxUnits - usedUnitsCount);
  const canAddAnotherUnit = usedUnitsCount < maxUnits;

  const citiesForSelectedGov = useMemo(
    () => getCitiesForGovernorate(form.governorate),
    [form.governorate]
  );
  const areasForSelectedCity = useMemo(
    () => getAreasForCity(form.governorate, form.city),
    [form.governorate, form.city]
  );

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccessNotice('');
    setAuthSubmitting(true);

    try {
      if (authMode === 'forgot') {
        const res = await sendPasswordResetEmail(authEmail, '/owner');
        if (res.error) {
          setAuthError(res.error);
          return;
        }
        setAuthSuccessNotice(
          'تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني. افتح الرابط لإعادة تعيين كلمة المرور.'
        );
        setAuthMode('login');
        return;
      }

      if (authMode === 'login') {
        const res = await signInWithEmailPassword(authEmail, authPassword);
        if (res.error || !res.data) {
          setAuthError(res.error ?? 'تعذر تسجيل الدخول.');
          return;
        }
        setAuthUser(res.data);
        await loadOwnerData(res.data);
      } else {
        if (signupName.trim().length < 3) {
          setAuthError('يرجى إدخال الاسم ثلاثياً على الأقل.');
          return;
        }
        if (!isValidEgyptianMobile(signupPhone)) {
          setAuthError('يرجى إدخال رقم هاتف مصري صحيح يبدأ بـ 010 أو 011 أو 012 أو 015.');
          return;
        }
        const res = await signUpOwnerAccount({
          email: authEmail,
          password: authPassword,
          name: signupName,
          phone: signupPhone,
          advertiserType: signupAdvType,
        });
        if (res.error || !res.data) {
          setAuthError(res.error ?? 'تعذر إنشاء الحساب الجديد.');
          return;
        }
        if (res.data.needsEmailConfirmation) {
          setAuthSuccessNotice(
            'تم إنشاء حسابك بنجاح! يرجى فتح رسالة التأكيد المرسلة إلى بريدك الإلكتروني ثم تسجيل الدخول.'
          );
          setAuthMode('login');
          return;
        }
        setAuthUser(res.data.user);
        await loadOwnerData(res.data.user);
      }
    } finally {
      setAuthSubmitting(false);
    }
  };

  const showRecoveryCard = isPasswordRecovery || localRecoveryActive;

  const handleSaveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError('');
    if (newPassword.length < 6) {
      setRecoveryError('كلمة المرور الجديدة يجب أن تتكون من ٦ أحرف على الأقل.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setRecoveryError('كلمتا المرور غير متطابقتين.');
      return;
    }
    setSavingNewPassword(true);
    try {
      const res = await updateMyPassword(newPassword);
      if (res.error) {
        setRecoveryError(res.error);
        return;
      }
      setNewPassword('');
      setConfirmNewPassword('');
      setLocalRecoveryActive(false);
      onPasswordRecoveryComplete?.();
      try {
        if (window.location.hash.includes('type=recovery')) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      } catch {
        // ignore
      }
      setFeedback({ type: 'success', text: 'تم تعيين كلمة المرور الجديدة بنجاح.' });
    } finally {
      setSavingNewPassword(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser) return;
    if (editProfileName.trim().length < 3) {
      setFeedback({ type: 'error', text: 'يرجى إدخال الاسم ثلاثياً على الأقل.' });
      return;
    }
    setSavingProfile(true);
    setFeedback(null);
    try {
      const res = await updateMyProfile({
        name: editProfileName,
        phone: editProfilePhone,
        advertiserType: editProfileAdvType,
      });
      if (res.error || !res.data) {
        setFeedback({ type: 'error', text: res.error ?? 'تعذر تحديث بيانات الملف الشخصي.' });
        return;
      }
      setProfile(res.data);
      await ensureOwnerRole(res.data.advertiserType);
      setIsProfileEditOpen(false);
      setFeedback({ type: 'success', text: 'تم تحديث بيانات حسابك بنجاح.' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLogout = async () => {
    await signOutAuth();
    setAuthUser(null);
    setProfile(null);
    setUnits([]);
    setSubSummary(null);
    setMyVerification(null);
    setRevealStats(null);
    setIsVerificationFormOpen(false);
    setIsFormOpen(false);
    setEditingUnitId(null);
    setFeedback(null);
  };

  const handleSubmitVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser) return;
    if (!isSupabaseConfigured) {
      setFeedback({ type: 'error', text: 'الاتصال بقاعدة البيانات غير مهيأ في هذه البيئة.' });
      return;
    }
    const normalizedPhone = normalizeEgyptianPhone(verPhone || profile?.phone || '');
    if (!isValidEgyptianMobile(normalizedPhone)) {
      setFeedback({
        type: 'error',
        text: 'يرجى إدخال رقم هاتف مصري صحيح لتوثيق الحساب.',
      });
      return;
    }
    if (!verFile) {
      setFeedback({
        type: 'error',
        text: 'يرجى إرفاق صورة واضحة أو ملف PDF لمستند التوثيق.',
      });
      return;
    }

    setSubmittingVerification(true);
    setFeedback(null);
    try {
      const uploadRes = await uploadVerificationDocumentFile(verFile);
      if (uploadRes.error || !uploadRes.data) {
        setFeedback({ type: 'error', text: uploadRes.error ?? 'تعذر رفع مستند التوثيق.' });
        return;
      }

      const submitRes = await submitOwnerVerificationRpc({
        ownerName: profile?.name?.trim() || authUser.email.split('@')[0] || 'معلن AgzStay',
        phone: normalizedPhone,
        documentType: verDocType,
        documentNumber: verDocNumber,
        documentPath: uploadRes.data.path,
      });

      if (submitRes.error || !submitRes.data) {
        setFeedback({
          type: 'error',
          text: submitRes.error ?? 'تعذر إرسال طلب التوثيق للمراجعة.',
        });
        return;
      }

      setMyVerification(submitRes.data);
      setVerFile(null);
      setIsVerificationFormOpen(false);
      setFeedback({
        type: 'success',
        text: 'تم استلام مستند التوثيق بنجاح. ستظهر شارة «معلن موثق» على وحداتك فور اعتماد الإدارة.',
      });
      await loadOwnerData(authUser);
      onDataChanged?.();
    } finally {
      setSubmittingVerification(false);
    }
  };

  const openAddForm = () => {
    if (!canAddAnotherUnit) {
      setFeedback({
        type: 'error',
        text: 'لقد وصلت إلى الحد الأقصى لعدد الإعلانات في باقتك الحالية. قم بالترقية لإضافة المزيد.',
        showUpgradeCta: true,
      });
      return;
    }
    setEditingUnitId(null);
    setForm(createEmptyUnitForm(profile?.phone ?? '', profile?.advertiserType ?? 'owner'));
    setIsFormOpen(true);
    setFeedback(null);
  };

  const openEditForm = (unit: Chalet) => {
    setEditingUnitId(unit.id);
    setForm(unitToFormState(unit, profile?.phone ?? ''));
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
    if (files.length === 0 || !authUser) return;

    setUploadingImages(true);
    setFeedback(null);
    try {
      const res = await uploadPropertyImages(files);
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
    if (!authUser) return;

    if (!isSupabaseConfigured) {
      setFeedback({ type: 'error', text: 'الاتصال بقاعدة البيانات غير مهيأ في هذه البيئة.' });
      return;
    }
    if (!editingUnitId && !canAddAnotherUnit) {
      setFeedback({
        type: 'error',
        text: 'تجاوزت الحد الأقصى للباقة الحالية. يرجى ترقية الباقة من صفحة باقات الإعلان.',
        showUpgradeCta: true,
      });
      return;
    }

    const normalizedPhone = normalizeEgyptianPhone(form.ownerPhone || profile?.phone || '');
    if (!isValidEgyptianMobile(normalizedPhone)) {
      setFeedback({
        type: 'error',
        text: 'يرجى إدخال رقم واتساب مصري صحيح (١١ رقماً يبدأ بـ 010 أو 011 أو 012 أو 015).',
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
    const ownerDisplayName = profile?.name?.trim() || authUser.email.split('@')[0] || 'معلن AgzStay';

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      governorate: form.governorate,
      city: form.city.trim(),
      areaOrVillage: form.areaOrVillage.trim(),
      propertyType: form.propertyType,
      advertiserRole: form.advertiserRole,
      ownerName: ownerDisplayName,
      ownerPhone: normalizedPhone,
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

    if (
      form.propertyType !== 'شقة فاضية' &&
      form.seasonalStart &&
      form.seasonalEnd &&
      form.seasonalEnd < form.seasonalStart
    ) {
      setFeedback({
        type: 'error',
        text: 'تاريخ نهاية الموسم يجب أن يكون بعد أو مساوياً لتاريخ البداية.',
      });
      return;
    }

    const parsedWeekendPrice =
      form.propertyType !== 'شقة فاضية' && form.weekendPriceText.trim()
        ? Number(form.weekendPriceText)
        : 0;
    const parsedSeasonalPrice =
      form.propertyType !== 'شقة فاضية' && form.seasonalPriceText.trim()
        ? Number(form.seasonalPriceText)
        : 0;

    setSavingUnit(true);
    setFeedback(null);
    try {
      const res = editingUnitId
        ? await updateChaletWithContact(editingUnitId, payload)
        : await insertChaletWithContact(payload);

      if (res.error || !res.data) {
        setFeedback({
          type: 'error',
          text: res.error ?? 'تعذر حفظ الوحدة.',
          showUpgradeCta: res.errorCode === 'quota_exceeded',
        });
        return;
      }

      let pricingRuleError: string | null = null;
      const pricingRes = await upsertChaletPricingRule(res.data.id, {
        weekendPrice: parsedWeekendPrice > 0 ? parsedWeekendPrice : null,
        seasonalPrice: parsedSeasonalPrice > 0 ? parsedSeasonalPrice : null,
        seasonalLabel: form.seasonalLabel.trim(),
        seasonalStart: form.seasonalStart || undefined,
        seasonalEnd: form.seasonalEnd || undefined,
      });
      if (pricingRes.error && (parsedWeekendPrice > 0 || parsedSeasonalPrice > 0)) {
        pricingRuleError = pricingRes.error;
      }

      setFeedback({
        type: 'success',
        text: pricingRuleError
          ? `تم حفظ الوحدة بنجاح، لكن تعذر حفظ التسعير المرن (${pricingRuleError}).`
          : editingUnitId
          ? 'تم تحديث بيانات الوحدة ورقم التواصل بنجاح.'
          : 'تم نشر وحدتك بنجاح وحفظ رقم التواصل بأمان.',
      });
      setIsFormOpen(false);
      setEditingUnitId(null);
      await loadOwnerData(authUser);
      onDataChanged?.();
    } finally {
      setSavingUnit(false);
    }
  };

  const handleCopyMarketingCopy = async (unit: Chalet) => {
    const encodedId = encodeURIComponent(unit.id);
    let shareUrl = `https://agzstay.com/chalet/${encodedId}`;
    try {
      shareUrl = `${window.location.origin}/chalet/${encodedId}`;
    } catch {
      // fallback
    }
    const text = buildOwnerMarketingCopy(unit, shareUrl);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedMarketingUnitId(unit.id);
      window.setTimeout(() => {
        setCopiedMarketingUnitId((prev) => (prev === unit.id ? null : prev));
      }, 2400);
    } catch {
      setCopiedMarketingUnitId(unit.id);
    }
  };

  const handleToggleVisibility = async (unit: Chalet) => {
    if (!authUser) return;
    const nextStatus = unit.availabilityStatus === 'active' ? 'hidden' : 'active';
    const res = await updateChaletWithContact(unit.id, { availabilityStatus: nextStatus });
    if (res.error) {
      setFeedback({ type: 'error', text: res.error });
      return;
    }
    setFeedback({
      type: 'success',
      text: nextStatus === 'active' ? 'تم إظهار الوحدة في البحث.' : 'تم إخفاء الوحدة مؤقتاً.',
    });
    await loadOwnerData(authUser);
    onDataChanged?.();
  };

  const handleDeleteUnit = async (unit: Chalet) => {
    if (!authUser) return;
    if (!window.confirm(`هل أنت متأكد من حذف "${unit.title}" نهائياً؟`)) return;
    const res = await deleteChaletRecord(unit.id);
    if (res.error) {
      setFeedback({ type: 'error', text: res.error });
      return;
    }
    setFeedback({ type: 'success', text: 'تم حذف الوحدة بنجاح.' });
    await loadOwnerData(authUser);
    onDataChanged?.();
  };

  const handleAddBlockedDatesRange = async (unit: Chalet) => {
    if (!authUser || !blockStartDate) return;
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
      const res = await updateChaletWithContact(unit.id, { blockedDates: nextBlocked });
      if (res.error) {
        setFeedback({ type: 'error', text: res.error });
        return;
      }
      setFeedback({ type: 'success', text: 'تم تحديث التواريخ المغلقة بنجاح.' });
      await loadOwnerData(authUser);
      onDataChanged?.();
    } finally {
      setSavingCalendar(false);
    }
  };

  const handleRemoveBlockedDate = async (unit: Chalet, dateIso: string) => {
    if (!authUser) return;
    const nextBlocked = unit.blockedDates.filter((d) => d !== dateIso);
    setSavingCalendar(true);
    try {
      const res = await updateChaletWithContact(unit.id, { blockedDates: nextBlocked });
      if (res.error) {
        setFeedback({ type: 'error', text: res.error });
        return;
      }
      await loadOwnerData(authUser);
      onDataChanged?.();
    } finally {
      setSavingCalendar(false);
    }
  };

  if (authChecking) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 items-center justify-center px-4 py-16">
        <div className="inline-flex items-center gap-2 rounded-2xl border border-stone-200/70 bg-white px-6 py-4 text-sm font-bold text-[#1E3A5F] shadow-xs">
          <RefreshCw className="h-4 w-4 animate-spin text-[#C5A880]" />
          <span>جاري التحقق من جلسة حسابك...</span>
        </div>
      </main>
    );
  }

  // Supabase Auth Gate (Login / Sign Up)
  if (!authUser) {
    return (
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-stone-200/70 bg-white p-6 shadow-xs sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1E3A5F] text-white">
              <Building2 className="h-6 w-6 text-[#C5A880]" />
            </div>

            <div className="flex rounded-xl border border-stone-200/70 bg-[#FAF9F6] p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError('');
                  setAuthSuccessNotice('');
                }}
                className={`rounded-lg px-3.5 py-1.5 transition ${
                  authMode === 'login' ? 'bg-[#1E3A5F] text-white shadow-xs' : 'text-[#6B7280]'
                }`}
              >
                تسجيل الدخول
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signup');
                  setAuthError('');
                  setAuthSuccessNotice('');
                }}
                className={`rounded-lg px-3.5 py-1.5 transition ${
                  authMode === 'signup' ? 'bg-[#1E3A5F] text-white shadow-xs' : 'text-[#6B7280]'
                }`}
              >
                إنشاء حساب جديد
              </button>
            </div>
          </div>

          <h1 className="mt-4 text-2xl font-bold text-[#1E3A5F]">
            {authMode === 'forgot'
              ? 'استعادة كلمة المرور'
              : authMode === 'login'
              ? 'تسجيل دخول المعلن'
              : 'إنشاء حساب معلن في AgzStay'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">
            {authMode === 'forgot'
              ? 'أدخل بريدك الإلكتروني المسجل وسنرسل لك رابطاً لإعادة تعيين كلمة المرور.'
              : authMode === 'login'
              ? 'ادخل بحسابك الموثق لإدارة وحداتك، متابعة باقة الاشتراك، وضبط التواريخ المتاحة بأمان.'
              : 'أنشئ حساباً جديداً كمُؤجّر أو مكتب عقاري لنشر وحداتك واستقبال التواصل المحمي عبر واتساب.'}
          </p>

          {!isSupabaseConfigured && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
              ملاحظة: يجب تهيئة متغيرات Supabase البيئية في لوحة Secrets قبل تسجيل الدخول.
            </div>
          )}

          {authSuccessNotice && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-bold text-emerald-900">
              {authSuccessNotice}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="mt-6 space-y-4">
            {authMode === 'signup' && (
              <>
                <div>
                  <label
                    htmlFor="owner-signup-name"
                    className="mb-1.5 block text-xs font-semibold text-slate-700"
                  >
                    الاسم بالكامل أو اسم المكتب العقاري
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="owner-signup-name"
                      type="text"
                      required
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      placeholder="مثال: أ. كريم عبد الله"
                      className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] pl-3 pr-10 text-sm text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="owner-signup-phone"
                      className="mb-1.5 block text-xs font-semibold text-slate-700"
                    >
                      رقم الهاتف / واتساب المصري
                    </label>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="owner-signup-phone"
                        type="tel"
                        required
                        dir="ltr"
                        value={signupPhone}
                        onChange={(e) => setSignupPhone(e.target.value)}
                        placeholder="01012345678"
                        className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] pl-3 pr-10 text-right text-sm text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="owner-signup-type"
                      className="mb-1.5 block text-xs font-semibold text-slate-700"
                    >
                      صفة المعلن
                    </label>
                    <select
                      id="owner-signup-type"
                      value={signupAdvType}
                      onChange={(e) => setSignupAdvType(e.target.value as AdvertiserTypeCode)}
                      className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-sm font-semibold text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                    >
                      <option value="owner">مالك مباشر</option>
                      <option value="broker">مكتب / وسيط عقاري</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            <div>
              <label
                htmlFor="owner-auth-email"
                className="mb-1.5 block text-xs font-semibold text-slate-700"
              >
                البريد الإلكتروني
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="owner-auth-email"
                  type="email"
                  required
                  dir="ltr"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="owner@example.com"
                  className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] pl-3 pr-10 text-left text-sm text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {authMode !== 'forgot' && (
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label
                    htmlFor="owner-auth-password"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    كلمة المرور
                  </label>
                  {authMode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('forgot');
                        setAuthError('');
                        setAuthSuccessNotice('');
                      }}
                      className="text-xs font-semibold text-[#1E3A5F] hover:underline"
                    >
                      نسيت كلمة المرور؟
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="owner-auth-password"
                    type="password"
                    required
                    minLength={6}
                    dir="ltr"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••"
                    className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] pl-3 pr-10 text-left text-sm text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            )}

            {authError && (
              <div
                className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700"
                role="alert"
              >
                {authError}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={authSubmitting}
                className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#1E3A5F] px-5 py-3 text-sm font-bold text-white shadow-xs transition hover:bg-[#172E4D] disabled:opacity-60"
              >
                {authSubmitting && <RefreshCw className="h-4 w-4 animate-spin" />}
                <span>
                  {authSubmitting
                    ? 'جاري المعالجة...'
                    : authMode === 'forgot'
                    ? 'إرسال رابط الاستعادة'
                    : authMode === 'login'
                    ? 'دخول إلى بوابة المعلن'
                    : 'إنشاء حساب المعلن'}
                </span>
              </button>

              {authMode === 'forgot' && (
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError('');
                  }}
                  className="min-h-[48px] rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-4 py-3 text-xs font-bold text-[#1E3A5F] hover:bg-stone-100"
                >
                  العودة للدخول
                </button>
              )}
            </div>
          </form>
        </div>
      </main>
    );
  }

  const isMonthlySelected = form.propertyType === 'شقة فاضية';
  const displayName = profile?.name || authUser.email;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stone-200/70 bg-white p-5 shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF9F6] px-3 py-1 text-xs font-semibold text-[#1E3A5F]">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              أهلاً بك، {displayName}
              {profile?.phone && (
                <span className="text-[#6B7280]" dir="ltr">
                  ({profile.phone})
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setIsProfileEditOpen((p) => !p)}
              className="inline-flex items-center gap-1 rounded-full border border-stone-200/70 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#6B7280] hover:text-[#1E3A5F]"
            >
              <Edit3 className="h-3 w-3" />
              <span>تعديل بياناتي</span>
            </button>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-[#1E3A5F]">إدارة وحداتك وإعلاناتك</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void loadOwnerData(authUser)}
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
            onClick={() => void handleLogout()}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-stone-200/70 bg-white px-3.5 py-2 text-xs font-semibold text-[#6B7280] hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </div>

      {/* Password Recovery Completion Form */}
      {showRecoveryCard && (
        <form
          onSubmit={handleSaveNewPassword}
          className="mt-4 rounded-2xl border border-[#C5A880] bg-white p-5 shadow-xs"
        >
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-[#C5A880]" />
              <h2 className="text-sm font-bold text-[#1E3A5F]">تعيين كلمة مرور جديدة لحسابك</h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setLocalRecoveryActive(false);
                onPasswordRecoveryComplete?.();
              }}
              className="rounded-lg p-1 text-[#6B7280] hover:bg-stone-100"
              aria-label="إغلاق"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#6B7280]">
                كلمة المرور الجديدة
              </label>
              <input
                type="password"
                required
                minLength={6}
                dir="ltr"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="٦ أحرف على الأقل"
                className="h-10 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-left text-xs text-[#1F2937]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#6B7280]">
                تأكيد كلمة المرور الجديدة
              </label>
              <input
                type="password"
                required
                minLength={6}
                dir="ltr"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="أعد كتابة كلمة المرور"
                className="h-10 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-left text-xs text-[#1F2937]"
              />
            </div>
          </div>
          {recoveryError && (
            <p className="mt-3 text-xs font-semibold text-red-700" role="alert">
              {recoveryError}
            </p>
          )}
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={savingNewPassword}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[#1E3A5F] px-5 py-2 text-xs font-bold text-white hover:bg-[#172E4D] disabled:opacity-60"
            >
              {savingNewPassword && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              <span>{savingNewPassword ? 'جاري التحديث...' : 'حفظ كلمة المرور الجديدة'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Inline Profile Editor (`name`, `phone`, `advertiser_type` only) */}
      {isProfileEditOpen && (
        <form
          onSubmit={handleSaveProfile}
          className="mt-4 rounded-2xl border border-stone-200/70 bg-white p-5 shadow-xs"
        >
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <h2 className="text-sm font-bold text-[#1E3A5F]">تحديث بيانات المعلن في الملف الشخصي</h2>
            <button
              type="button"
              onClick={() => setIsProfileEditOpen(false)}
              className="rounded-lg p-1 text-[#6B7280] hover:bg-stone-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#6B7280]">الاسم</label>
              <input
                type="text"
                required
                value={editProfileName}
                onChange={(e) => setEditProfileName(e.target.value)}
                className="h-10 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-xs text-[#1F2937]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#6B7280]">رقم الهاتف</label>
              <input
                type="tel"
                required
                dir="ltr"
                value={editProfilePhone}
                onChange={(e) => setEditProfilePhone(e.target.value)}
                className="h-10 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-right text-xs text-[#1F2937]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#6B7280]">صفة المعلن</label>
              <select
                value={editProfileAdvType}
                onChange={(e) => setEditProfileAdvType(e.target.value as AdvertiserTypeCode)}
                className="h-10 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-xs font-semibold text-[#1F2937]"
              >
                <option value="owner">مالك مباشر</option>
                <option value="broker">مكتب / وسيط</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="submit"
              disabled={savingProfile}
              className="rounded-xl bg-[#1E3A5F] px-4 py-2 text-xs font-bold text-white hover:bg-[#172E4D] disabled:opacity-60"
            >
              {savingProfile ? 'جاري الحفظ...' : 'حفظ البيانات'}
            </button>
          </div>
        </form>
      )}

      {/* Quota & Subscription Dashboard Card (`my_subscription` RPC) */}
      {subSummary && (
        <section
          aria-label="ملخص رصيد الإعلانات والاشتراك"
          className="mt-5 rounded-2xl border border-stone-200/70 bg-white p-5 shadow-xs sm:p-6"
        >
          <div className="flex flex-col justify-between gap-4 border-b border-stone-100 pb-4 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <Crown className="h-5 w-5 text-[#C5A880]" />
              <span className="text-base font-bold text-[#1E3A5F]">
                باقتك الحالية: {subSummary.planName}
              </span>

              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  subSummary.status === 'active'
                    ? 'bg-emerald-50 text-emerald-700'
                    : subSummary.pendingRequest || subSummary.status === 'pending'
                    ? 'bg-amber-50 text-amber-800'
                    : subSummary.status === 'rejected'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-stone-100 text-[#6B7280]'
                }`}
              >
                {subSummary.status === 'active'
                  ? 'اشتراك مفعّل'
                  : subSummary.pendingRequest || subSummary.status === 'pending'
                  ? 'طلب ترقية قيد المراجعة'
                  : subSummary.status === 'rejected'
                  ? 'طلب سابق مرفوض'
                  : subSummary.status === 'expired'
                  ? 'انتهى الاشتراك'
                  : 'باقة مجانية'}
              </span>

              {subSummary.isFeaturedEligible && (
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
                {usedUnitsCount.toLocaleString('ar-EG')}
                <span className="mr-1 text-xs font-medium text-[#6B7280]">
                  من أصل {maxUnits.toLocaleString('ar-EG')}
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
                {remainingUnitsCount.toLocaleString('ar-EG')}
                <span className="mr-1 text-xs font-medium text-[#6B7280]">
                  {remainingUnitsCount === 1 ? 'إعلان متبقٍ' : 'إعلانات متبقية'}
                </span>
              </span>
            </div>

            <div className="rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-4 py-3">
              <span className="block text-[11px] font-semibold text-[#6B7280]">
                صلاحية الاشتراك
              </span>
              <span className="mt-1 block text-sm font-bold text-[#1F2937]">
                {subSummary.expiresAt
                  ? `سارٍ حتى ${formatArabicDate(subSummary.expiresAt.slice(0, 10))}`
                  : subSummary.isFeaturedEligible
                  ? 'مفعّل — تمييز تلقائي للوحدات'
                  : 'مفتوحة (الباقة المجانية)'}
              </span>
            </div>
          </div>

          {(() => {
            if (subSummary.status !== 'active' || !subSummary.expiresAt) return null;
            const expiresMs = Date.parse(subSummary.expiresAt);
            if (!Number.isFinite(expiresMs)) return null;
            const daysRemaining = Math.ceil((expiresMs - Date.now()) / 86400000);
            if (daysRemaining > 7) return null;
            return (
              <div
                className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-950"
                role="status"
              >
                <span className="inline-flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
                  {daysRemaining <= 0
                    ? 'انتهت صلاحية باقة اشتراكك أو قاربت على الانتهاء اليوم — جدد الاشتراك لاستمرار تمييز وحداتك.'
                    : `تنبيه: باقة اشتراكك الحالية تنتهي خلال ${daysRemaining.toLocaleString('ar-EG')} ${daysRemaining === 1 ? 'يوم' : 'أيام'} (${formatArabicDate(subSummary.expiresAt.slice(0, 10))}).`}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('pricing')}
                  className="rounded-lg bg-[#1E3A5F] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#172E4D]"
                >
                  تجديد الاشتراك الآن
                </button>
              </div>
            );
          })()}

          {!canAddAnotherUnit && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-950">
              <span>
                وصلت للحد الأقصى المسموح به في باقتك الحالية ({maxUnits.toLocaleString('ar-EG')}{' '}
                {maxUnits === 1 ? 'إعلان' : 'إعلانات'}). قم بالترقية لإضافة وحدات جديدة وتفعيل شارة الإعلان المميز.
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

          {subSummary.pendingRequest && (
            <p className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-2.5 text-xs font-semibold text-amber-900">
              طلبك قيد المراجعة: {subSummary.pendingRequest.planName} — سيتم تفعيل الباقة وتمييز وحداتك تلقائياً فور اعتماد الإيصال من الإدارة.
            </p>
          )}

          {subSummary.status === 'rejected' && subSummary.adminNote && (
            <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-800">
              ملاحظة الإدارة على آخر طلب: {subSummary.adminNote}
            </p>
          )}
        </section>
      )}

      {/* Owner Contact Reveal Analytics + Verification Status */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Privacy-Safe Contact Reveal Stats */}
        <section
          aria-label="إحصائيات كشف رقم التواصل"
          className="rounded-2xl border border-stone-200/70 bg-white p-5 shadow-xs sm:p-6"
        >
          <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3.5">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FAF9F6] text-[#1E3A5F]">
                <BarChart3 className="h-4.5 w-4.5 text-[#C5A880]" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#1E3A5F]">
                  إحصائيات كشف رقم التواصل (التفاعل)
                </h2>
                <p className="text-[11px] text-[#6B7280]">
                  أرقام مجمّعة لعدد مرات طلب رقمك دون كشف هوية الزوار.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2.5">
            <div className="rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 py-3 text-center">
              <span className="block text-[11px] font-semibold text-[#6B7280]">الإجمالي الكلي</span>
              <span className="mt-1 block text-xl font-bold text-[#1E3A5F]">
                {(revealStats?.totalReveals ?? 0).toLocaleString('ar-EG')}
              </span>
            </div>
            <div className="rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 py-3 text-center">
              <span className="block text-[11px] font-semibold text-[#6B7280]">آخر ٧ أيام</span>
              <span className="mt-1 block text-xl font-bold text-emerald-700">
                {(revealStats?.revealsLast7Days ?? 0).toLocaleString('ar-EG')}
              </span>
            </div>
            <div className="rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 py-3 text-center">
              <span className="block text-[11px] font-semibold text-[#6B7280]">آخر ٣٠ يوماً</span>
              <span className="mt-1 block text-xl font-bold text-[#1F2937]">
                {(revealStats?.revealsLast30Days ?? 0).toLocaleString('ar-EG')}
              </span>
            </div>
          </div>
        </section>

        {/* Owner Verification Card */}
        <section
          aria-label="حالة توثيق المعلن"
          className="rounded-2xl border border-stone-200/70 bg-white p-5 shadow-xs sm:p-6"
        >
          {(() => {
            const effStatus =
              myVerification?.status ??
              (profile?.verificationStatus === 'verified'
                ? 'verified'
                : profile?.verificationStatus === 'pending'
                ? 'pending'
                : 'unverified');
            const isVerified = effStatus === 'verified';
            const isPending = effStatus === 'pending';

            return (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 pb-3.5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FAF9F6] text-[#1E3A5F]">
                      <BadgeCheck
                        className={`h-5 w-5 ${isVerified ? 'text-emerald-600' : 'text-[#C5A880]'}`}
                      />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-bold text-[#1E3A5F]">توثيق حساب المعلن</h2>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            isVerified
                              ? 'bg-emerald-50 text-emerald-700'
                              : isPending
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-stone-100 text-[#6B7280]'
                          }`}
                        >
                          {isVerified
                            ? 'حساب موثق'
                            : isPending
                            ? 'قيد المراجعة'
                            : myVerification?.rejectionReason
                            ? 'مرفوض — يحتاج إعادة رفع'
                            : 'غير موثق'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#6B7280]">
                        {isVerified
                          ? 'شارة «معلن موثق» ظاهرة الآن على جميع وحداتك لرفع ثقة المستأجرين.'
                          : 'ارفع إثبات الهوية أو ملكية الوحدة للحصول على شارة «معلن موثق».'}
                      </p>
                    </div>
                  </div>

                  {!isPending && (
                    <button
                      type="button"
                      onClick={() => setIsVerificationFormOpen((prev) => !prev)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#1E3A5F] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#172E4D]"
                    >
                      <FileCheck2 className="h-3.5 w-3.5 text-[#C5A880]" />
                      <span>
                        {isVerificationFormOpen
                          ? 'إخفاء النموذج'
                          : isVerified
                          ? 'تحديث المستند'
                          : 'توثيق الحساب الآن'}
                      </span>
                    </button>
                  )}
                </div>

                {myVerification?.status === 'unverified' && myVerification.rejectionReason && (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-800">
                    سبب رفض الطلب السابق: {myVerification.rejectionReason}
                  </div>
                )}

                {isPending && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-900">
                    تم استلام مستندك وهو قيد المراجعة من إدارة AgzStay حالياً.
                  </div>
                )}

                {isVerificationFormOpen && (
                  <form onSubmit={handleSubmitVerification} className="mt-4 space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-[#6B7280]">
                          نوع المستند
                        </label>
                        <select
                          value={verDocType}
                          onChange={(e) =>
                            setVerDocType(e.target.value as VerificationDocumentType)
                          }
                          className="h-10 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-2.5 text-xs font-semibold text-[#1F2937]"
                        >
                          <option value="national-id">بطاقة رقم قومي</option>
                          <option value="ownership-contract">عقد ملكية أو إيجار موثق</option>
                          <option value="resort-card">كارنيه قرية / اتحاد ملاك</option>
                          <option value="authorization">تفويض رسمي من المالك</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-semibold text-[#6B7280]">
                          رقم المستند (اختياري)
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={verDocNumber}
                          onChange={(e) => setVerDocNumber(e.target.value)}
                          placeholder="مثال: آخر ٤ أرقام أو رقم العقد"
                          className="h-10 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-left text-xs text-[#1F2937]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-[#6B7280]">
                          رقم الهاتف للتأكيد
                        </label>
                        <input
                          type="tel"
                          required
                          dir="ltr"
                          value={verPhone}
                          onChange={(e) => setVerPhone(e.target.value)}
                          placeholder="01012345678"
                          className="h-10 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-right text-xs text-[#1F2937]"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-semibold text-[#6B7280]">
                          ملف المستند (JPG / PNG / WebP / PDF حتى ٥ ميجا)
                        </label>
                        <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#1E3A5F]/40 bg-[#FAF9F6] px-3 text-xs font-semibold text-[#1E3A5F] hover:bg-stone-100">
                          <Upload className="h-3.5 w-3.5" />
                          <span className="truncate">
                            {verFile ? verFile.name : 'اختر صورة أو ملف PDF'}
                          </span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            onChange={(e) => setVerFile(e.target.files?.[0] ?? null)}
                            className="sr-only"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsVerificationFormOpen(false)}
                        className="rounded-xl border border-stone-200/70 px-3.5 py-2 text-xs font-bold text-[#6B7280]"
                      >
                        إلغاء
                      </button>
                      <button
                        type="submit"
                        disabled={submittingVerification}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#1E3A5F] px-4 py-2 text-xs font-bold text-white hover:bg-[#172E4D] disabled:opacity-60"
                      >
                        {submittingVerification && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                        <span>
                          {submittingVerification ? 'جاري الرفع والإرسال...' : 'إرسال للمراجعة'}
                        </span>
                      </button>
                    </div>
                  </form>
                )}
              </>
            );
          })()}
        </section>
      </div>

      {feedback && (
        <div
          className={`mt-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-xs font-bold ${
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
          <div className="flex items-center gap-2">
            {feedback.showUpgradeCta && (
              <button
                type="button"
                onClick={() => onNavigate('pricing')}
                className="rounded-lg bg-[#1E3A5F] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#172E4D]"
              >
                ترقية الباقة
              </button>
            )}
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="rounded-lg p-1 hover:bg-black/5"
              aria-label="إغلاق التنبيه"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="md:col-span-3">
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

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  رقم الواتساب للتواصل (محمي في chalet_contacts)
                </label>
                <input
                  type="tel"
                  required
                  dir="ltr"
                  value={form.ownerPhone}
                  onChange={(e) => setForm((p) => ({ ...p, ownerPhone: e.target.value }))}
                  placeholder="01012345678"
                  className="h-11 w-full rounded-xl border border-stone-200/70 bg-[#FAF9F6] px-3 text-right text-sm font-semibold text-[#1F2937] focus:border-[#1E3A5F] focus:bg-white focus:outline-none"
                />
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

            {/* Optional Flexible Weekend & Seasonal Pricing */}
            {!isMonthlySelected && (
              <div className="rounded-2xl border border-stone-200/70 bg-[#FAF9F6] p-4">
                <div className="mb-3">
                  <span className="block text-xs font-bold text-[#1E3A5F]">
                    التسعير المرن للويك إند والمواسم (اختياري)
                  </span>
                  <span className="text-[11px] text-[#6B7280]">
                    تُطبّق تلقائياً على ليالي الخميس والجمعة أو خلال فترة الموسم المحددة.
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[#6B7280]">
                      سعر ليلة الويك إند (ج.م)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={form.weekendPriceText}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, weekendPriceText: e.target.value }))
                      }
                      placeholder="مثال: 3200"
                      className="h-10 w-full rounded-xl border border-stone-200/70 bg-white px-3 text-xs font-semibold text-[#1F2937] focus:border-[#1E3A5F] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[#6B7280]">
                      سعر ليلة الموسم (ج.م)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={form.seasonalPriceText}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, seasonalPriceText: e.target.value }))
                      }
                      placeholder="مثال: 4000"
                      className="h-10 w-full rounded-xl border border-stone-200/70 bg-white px-3 text-xs font-semibold text-[#1F2937] focus:border-[#1E3A5F] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[#6B7280]">
                      اسم الموسم / العيد
                    </label>
                    <input
                      type="text"
                      maxLength={80}
                      value={form.seasonalLabel}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, seasonalLabel: e.target.value }))
                      }
                      placeholder="مثال: عيد الأضحى"
                      className="h-10 w-full rounded-xl border border-stone-200/70 bg-white px-3 text-xs font-semibold text-[#1F2937] focus:border-[#1E3A5F] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[#6B7280]">
                      بداية الموسم
                    </label>
                    <input
                      type="date"
                      value={form.seasonalStart}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, seasonalStart: e.target.value }))
                      }
                      className="h-10 w-full rounded-xl border border-stone-200/70 bg-white px-3 text-xs font-semibold text-[#1F2937] focus:border-[#1E3A5F] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[#6B7280]">
                      نهاية الموسم
                    </label>
                    <input
                      type="date"
                      value={form.seasonalEnd}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, seasonalEnd: e.target.value }))
                      }
                      className="h-10 w-full rounded-xl border border-stone-200/70 bg-white px-3 text-xs font-semibold text-[#1F2937] focus:border-[#1E3A5F] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

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
                    صور الوحدة (تُرفع في مسار حسابك داخل حاوية property-images)
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
                          {unit.ownerVerified && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                              <BadgeCheck className="h-3 w-3" />
                              معلن موثق
                            </span>
                          )}
                          {revealStats?.perChalet[unit.id] && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#FAF9F6] px-2.5 py-0.5 text-[11px] font-semibold text-[#1E3A5F]">
                              <Phone className="h-3 w-3 text-[#C5A880]" />
                              كشف الرقم:{' '}
                              {revealStats.perChalet[unit.id].totalReveals.toLocaleString('ar-EG')}
                              {revealStats.perChalet[unit.id].revealsLast7Days > 0 && (
                                <span className="text-emerald-700">
                                  ({revealStats.perChalet[unit.id].revealsLast7Days.toLocaleString('ar-EG')} آخر ٧ أيام)
                                </span>
                              )}
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
                          {unit.ownerPhone && (
                            <span className="mr-2 text-[#6B7280]" dir="ltr">
                              • {unit.ownerPhone}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCopyMarketingCopy(unit)}
                        className={`inline-flex min-h-[38px] items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                          copiedMarketingUnitId === unit.id
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                            : 'border-[#C5A880]/70 bg-[#FAF6F0] text-[#1E3A5F] hover:bg-[#C5A880]/15'
                        }`}
                      >
                        {copiedMarketingUnitId === unit.id ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-[#C5A880]" />
                        )}
                        <span>
                          {copiedMarketingUnitId === unit.id ? 'تم نسخ الإعلان' : 'نسخ إعلان واتساب'}
                        </span>
                      </button>

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
