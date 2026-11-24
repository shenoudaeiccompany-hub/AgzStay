import type { SubscriptionPlan, SubscriptionPlanId, SubscriptionRecord } from '@/types/chalet';

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'الباقة المجانية',
    badge: 'ابدأ مجاناً',
    price: 0,
    maxUnits: 1,
    isFeaturedEligible: false,
    priorityLabel: 'ظهور عادي في نتائج البحث',
    features: [
      'إضافة وحدة واحدة مجاناً بدون رسوم',
      'تواصل مباشر من المستأجرين عبر واتساب والهاتف',
      'إدارة تقويم التواريخ المتاحة والمغلقة',
    ],
  },
  {
    id: 'starter',
    name: 'باقة البداية (Starter)',
    badge: 'للملاك الأفراد',
    price: 500,
    maxUnits: 5,
    isFeaturedEligible: true,
    priorityLabel: 'شارة إعلان مميز',
    features: [
      'نشر حتى ٥ وحدات عقارية في نفس الوقت',
      'تفعيل شارة "إعلان مميز" على وحداتك تلقائياً',
      'إدارة كاملة للتقويم وحجب التواريخ المحجوزة',
    ],
  },
  {
    id: 'pro',
    name: 'الباقة الاحترافية (Pro)',
    badge: 'الأكثر طلباً',
    price: 800,
    maxUnits: 10,
    isFeaturedEligible: true,
    priorityLabel: 'شارة مميز + أولوية ظهور',
    features: [
      'نشر حتى ١٠ وحدات عقارية بمختلف المحافظات',
      'أولوية ظهور أعلى في الصفحة الرئيسية ونتائج البحث',
      'شارة "إعلان مميز" على كافة وحداتك النشطة',
    ],
  },
  {
    id: 'enterprise',
    name: 'باقة الشركات والمكاتب (Enterprise)',
    badge: 'للمكاتب والوسطاء',
    price: 1500,
    maxUnits: 20,
    isFeaturedEligible: true,
    priorityLabel: 'شارة مميز + ترويج وأولوية قصوى',
    features: [
      'نشر حتى ٢٠ وحدة (شقق مفروشة، فاضية، شاليهات، فيلات)',
      'أعلى أولوية ظهور وترويج لوحدات المكتب أو الشركة',
      'شارة "إعلان مميز" وتقارير توافر شاملة',
    ],
  },
];

export function getSubscriptionPlanById(planId: SubscriptionPlanId): SubscriptionPlan {
  return SUBSCRIPTION_PLANS.find((p) => p.id === planId) ?? SUBSCRIPTION_PLANS[0];
}

export function normalizeEgyptianPhone(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.startsWith('20') && digits.length === 12) {
    return `0${digits.slice(2)}`;
  }
  return digits;
}

export function resolveOwnerQuota(
  ownerPhone: string,
  subscriptions: SubscriptionRecord[]
): {
  maxUnits: number;
  activePlan: SubscriptionPlan;
  activeSubscription: SubscriptionRecord | null;
  pendingSubscription: SubscriptionRecord | null;
} {
  const normalizedTarget = normalizeEgyptianPhone(ownerPhone);
  const matching = subscriptions.filter(
    (s) => normalizeEgyptianPhone(s.ownerPhone) === normalizedTarget
  );

  const activeSubs = matching
    .filter((s) => s.status === 'active')
    .sort((a, b) => b.maxUnits - a.maxUnits);

  const activeSubscription = activeSubs[0] ?? null;
  const pendingSubscription = matching.find((s) => s.status === 'pending') ?? null;

  if (activeSubscription) {
    const plan = getSubscriptionPlanById(activeSubscription.planId);
    return {
      maxUnits: Math.max(plan.maxUnits, activeSubscription.maxUnits),
      activePlan: plan,
      activeSubscription,
      pendingSubscription,
    };
  }

  const freePlan = SUBSCRIPTION_PLANS[0];
  return {
    maxUnits: freePlan.maxUnits,
    activePlan: freePlan,
    activeSubscription: null,
    pendingSubscription,
  };
}
