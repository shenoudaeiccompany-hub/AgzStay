import type {
  AdvertiserRoleLabel,
  AmenityId,
  Chalet,
  PropertyType,
} from '@/types/chalet';

export const PROPERTY_TYPES: readonly (PropertyType | 'الكل')[] = [
  'الكل',
  'شقة مفروشة',
  'شقة فاضية',
  'شاليه',
  'فيلا',
  'استوديو',
];

export const EDITABLE_PROPERTY_TYPES: readonly PropertyType[] = [
  'شقة مفروشة',
  'شقة فاضية',
  'شاليه',
  'فيلا',
  'استوديو',
];

export const ADVERTISER_ROLES: readonly (AdvertiserRoleLabel | 'الكل')[] = [
  'الكل',
  'مالك مباشر',
  'مكتب / وسيط',
];

export const EDITABLE_ADVERTISER_ROLES: readonly AdvertiserRoleLabel[] = [
  'مالك مباشر',
  'مكتب / وسيط',
];

export const AMENITIES: { id: AmenityId; label: string }[] = [
  { id: 'wifi', label: 'واي فاي فائق السرعة' },
  { id: 'ac', label: 'تكييف بالكامل' },
  { id: 'elevator', label: 'أسانسير' },
  { id: 'pool', label: 'حمام سباحة' },
  { id: 'family', label: 'مناسب للعائلات فقط' },
  { id: 'sea-view', label: 'إطلالة على البحر' },
  { id: 'garden', label: 'حديقة خاصة' },
  { id: 'parking', label: 'موقف سيارات' },
];

export function getAmenityLabel(id: AmenityId): string {
  return AMENITIES.find((a) => a.id === id)?.label ?? id;
}

export function formatEGP(amount: number): string {
  return `${Math.round(amount).toLocaleString('ar-EG')} ج.م`;
}

export function isMonthlyOnlyProperty(property: Pick<Chalet, 'propertyType'>): boolean {
  return property.propertyType === 'شقة فاضية';
}

export function getPriceUnitLabel(property: Pick<Chalet, 'propertyType'>): string {
  return isMonthlyOnlyProperty(property) ? 'إيجار شهري' : 'سعر الليلة';
}

export function getShortPriceUnitLabel(property: Pick<Chalet, 'propertyType'>): string {
  return isMonthlyOnlyProperty(property) ? 'شهرياً' : 'لليلة';
}

function offsetIsoDate(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const CURATED_EGYPT_UNITS: Omit<Chalet, 'id'>[] = [
  {
    title: 'شاليه صف أول لاجون وبحر في مراسي سيدي عبد الرحمن — الساحل الشمالي',
    description:
      'شاليه فاخر بتشطيب فندقي هادئ متاح للإيجار اليومي والأسبوعي في قلب مراسي الساحل الشمالي، يضم ٣ غرف نوم مكيفة وتراس واسع يطل على اللاجون، مع مطبخ متكامل وقرب خطوات من الشاطئ.',
    governorate: 'مطروح',
    city: 'الساحل الشمالي - العلمين وسيدي عبد الرحمن',
    areaOrVillage: 'مراسي',
    propertyType: 'شاليه',
    advertiserRole: 'مالك مباشر',
    ownerName: 'م. طارق المنشاوي',
    ownerPhone: '01012345678',
    isFeatured: true,
    depositType: 'percent',
    depositValue: 20,
    pricePerNight: 7500,
    bedrooms: 3,
    bathrooms: 2,
    areaSqm: 145,
    maxGuests: 6,
    beachDistanceMeters: 90,
    coordinates: { lat: 30.9672, lng: 28.7423 },
    images: [
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&h=900&q=80',
      'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1200&h=900&q=80',
    ],
    amenities: ['sea-view', 'pool', 'ac', 'wifi', 'family', 'parking'],
    blockedDates: [offsetIsoDate(4), offsetIsoDate(5)],
    rules: ['إيجار يومي وأسبوعي للعائلات فقط', 'استلام المفاتيح ٢ عصراً والمغادرة ١٢ ظهراً'],
    availabilityStatus: 'active',
  },
  {
    title: 'شاليه بحديقة خاصة وإطلالة بانوراما في المونت جلالة — العين السخنة',
    description:
      'شاليه أرضي هادئ بحديقة خاصة متاح للإيجار اليومي والأسبوعي في المونت جلالة العين السخنة على بُعد ساعة ونصف من القاهرة، مثالي لعطلات نهاية الأسبوع والعائلات.',
    governorate: 'السويس',
    city: 'العين السخنة',
    areaOrVillage: 'المونت جلالة',
    propertyType: 'شاليه',
    advertiserRole: 'مالك مباشر',
    ownerName: 'أ. نادية الشريف',
    ownerPhone: '01098765432',
    isFeatured: true,
    depositType: 'percent',
    depositValue: 20,
    pricePerNight: 3900,
    bedrooms: 2,
    bathrooms: 2,
    areaSqm: 115,
    maxGuests: 5,
    beachDistanceMeters: 150,
    coordinates: { lat: 29.5206, lng: 32.3694 },
    images: [
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&h=900&q=80',
      'https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=1200&h=900&q=80',
    ],
    amenities: ['sea-view', 'pool', 'ac', 'garden', 'family', 'parking'],
    blockedDates: [offsetIsoDate(7), offsetIsoDate(8)],
    rules: ['إيجار يومي وأسبوعي — الهدوء بعد منتصف الليل', 'تأمين مسترد عند المعاينة والاستلام'],
    availabilityStatus: 'active',
  },
  {
    title: 'استوديو فندقي بالممشى السياحي وقريب من البحر — الغردقة',
    description:
      'استوديو مشرق ونظيف متاح للإيجار اليومي والأسبوعي في قلب الممشى السياحي بالغردقة مع حمام سباحة مشترك، واي فاي سريع، وتكييف بالكامل، مناسب للإجازات أو العمل عن بُعد.',
    governorate: 'البحر الأحمر',
    city: 'الغردقة',
    areaOrVillage: 'الممشى السياحي',
    propertyType: 'استوديو',
    advertiserRole: 'مالك مباشر',
    ownerName: 'أ. مينا جورج',
    ownerPhone: '01223344556',
    isFeatured: false,
    depositType: 'percent',
    depositValue: 20,
    pricePerNight: 1650,
    bedrooms: 1,
    bathrooms: 1,
    areaSqm: 60,
    maxGuests: 3,
    beachDistanceMeters: 200,
    coordinates: { lat: 27.1973, lng: 33.8358 },
    images: [
      'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?auto=format&fit=crop&w=1200&h=900&q=80',
      'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?auto=format&fit=crop&w=1200&h=900&q=80',
    ],
    amenities: ['pool', 'wifi', 'ac', 'elevator'],
    blockedDates: [],
    rules: ['إيجار يومي وأسبوعي — خصم للإقامات الأطول', 'الاتفاق والمعاينة مباشرة عند الاستلام'],
    availabilityStatus: 'active',
  },
  {
    title: 'شقة مفروشة مودرن بالتجمع الخامس قرب الجامعة الأمريكية',
    description:
      'شقة مفروشة بالكامل بأثاث عصري متاحة للإيجار اليومي والأسبوعي في كمبوند هادئ بالتجمع الخامس، مكيفة بالكامل مع إنترنت فايبر ومصعد وموقف سيارة خاص.',
    governorate: 'القاهرة',
    city: 'القاهرة الجديدة',
    areaOrVillage: 'التجمع الخامس',
    propertyType: 'شقة مفروشة',
    advertiserRole: 'مالك مباشر',
    ownerName: 'م. شريف عبد الرحمن',
    ownerPhone: '01001122334',
    isFeatured: true,
    depositType: 'fixed',
    depositValue: 2000,
    pricePerNight: 2400,
    bedrooms: 3,
    bathrooms: 2,
    areaSqm: 175,
    maxGuests: 6,
    beachDistanceMeters: 0,
    coordinates: { lat: 30.0258, lng: 31.4913 },
    images: [
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&h=900&q=80',
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&h=900&q=80',
    ],
    amenities: ['wifi', 'ac', 'elevator', 'family', 'parking'],
    blockedDates: [],
    rules: ['إيجار يومي وأسبوعي للعائلات والوافدين', 'تأمين مسترد عند تسليم المفاتيح'],
    availabilityStatus: 'active',
  },
  {
    title: 'شقة فاضية تشطيب الترا سوبر لوكس للإيجار الشهري في الشيخ زايد',
    description:
      'شقة فاضية غير مفروشة للإيجار الشهري بعقد سنوي في كمبوند راقٍ بالشيخ زايد جاهزة للسكن العائلي الفوري، مطبخ راكب وتكييفات مركزية ومساحات خضراء واسعة.',
    governorate: 'الجيزة',
    city: 'الشيخ زايد',
    areaOrVillage: 'بيفرلي هيلز',
    propertyType: 'شقة فاضية',
    advertiserRole: 'مكتب / وسيط',
    ownerName: 'مكتب زايد العقاري',
    ownerPhone: '01112223344',
    isFeatured: false,
    depositType: 'fixed',
    depositValue: 18000,
    pricePerNight: 18000,
    monthlyPrice: 18000,
    bedrooms: 3,
    bathrooms: 2,
    areaSqm: 190,
    maxGuests: 6,
    beachDistanceMeters: 0,
    coordinates: { lat: 30.0229, lng: 30.9803 },
    images: [
      'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&h=900&q=80',
      'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1200&h=900&q=80',
    ],
    amenities: ['elevator', 'garden', 'parking', 'family'],
    blockedDates: [],
    rules: ['عقد إيجار شهري (مدة التعاقد سنة على الأقل)', 'المعاينة متاحة يومياً بعد التنسيق عبر واتساب'],
    availabilityStatus: 'active',
  },
  {
    title: 'فيلا شاطئية بمسبح خاص قريبة من خليج نعمة — شرم الشيخ',
    description:
      'فيلا عائلية مستقلة متاحة للإيجار اليومي والأسبوعي في خليج نعمة مع حمام سباحة خاص وحديقة وتراس خارجي هادئ على بُعد دقائق من الممشى والشاطئ.',
    governorate: 'جنوب سيناء',
    city: 'شرم الشيخ',
    areaOrVillage: 'خليج نعمة',
    propertyType: 'فيلا',
    advertiserRole: 'مالك مباشر',
    ownerName: 'م. تامر عبد الحميد',
    ownerPhone: '01055667788',
    isFeatured: true,
    depositType: 'percent',
    depositValue: 25,
    pricePerNight: 5600,
    bedrooms: 4,
    bathrooms: 3,
    areaSqm: 240,
    maxGuests: 8,
    beachDistanceMeters: 300,
    coordinates: { lat: 27.9158, lng: 34.3299 },
    images: [
      'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1200&h=900&q=80',
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&h=900&q=80',
    ],
    amenities: ['pool', 'ac', 'wifi', 'family', 'garden', 'parking'],
    blockedDates: [],
    rules: ['إيجار يومي وأسبوعي للعائلات فقط', 'ممنوع إقامة الحفلات الصاخبة'],
    availabilityStatus: 'active',
  },
  {
    title: 'شقة مفروشة بإطلالة بحرية مفتوحة في سان ستيفانو — الإسكندرية',
    description:
      'شقة مفروشة فاخرة متاحة للإيجار اليومي والأسبوعي على كورنيش الإسكندرية بمنطقة سان ستيفانو، تشطيب حديث وتكييفات وواي فاي سريع وقرب مباشر من المول والبحر.',
    governorate: 'الإسكندرية',
    city: 'شرق الإسكندرية',
    areaOrVillage: 'سان ستيفانو',
    propertyType: 'شقة مفروشة',
    advertiserRole: 'مالك مباشر',
    ownerName: 'أ. خالد السكندري',
    ownerPhone: '01288990011',
    isFeatured: true,
    depositType: 'fixed',
    depositValue: 1500,
    pricePerNight: 2800,
    bedrooms: 3,
    bathrooms: 2,
    areaSqm: 165,
    maxGuests: 6,
    beachDistanceMeters: 50,
    coordinates: { lat: 31.2456, lng: 29.9668 },
    images: [
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&h=900&q=80',
      'https://images.unsplash.com/photo-1560185007-cde436f6a4d0?auto=format&fit=crop&w=1200&h=900&q=80',
    ],
    amenities: ['sea-view', 'wifi', 'ac', 'elevator', 'family'],
    blockedDates: [],
    rules: ['إيجار يومي وأسبوعي للعائلات فقط', 'تأمين مسترد عند الاستلام والمعاينة'],
    availabilityStatus: 'active',
  },
  {
    title: 'شقة فاضية ٣ غرف للإيجار الشهري بشارع عباس العقاد — مدينة نصر',
    description:
      'شقة فاضية غير مفروشة للإيجار الشهري في موقع حيوي متفرع من عباس العقاد بمدينة نصر، دور رابع بأسانسير وعداد كهرباء وغاز طبيعي، مناسبة للسكن العائلي طويل الأمد.',
    governorate: 'القاهرة',
    city: 'مدينة نصر',
    areaOrVillage: 'عباس العقاد',
    propertyType: 'شقة فاضية',
    advertiserRole: 'مكتب / وسيط',
    ownerName: 'مكتب النصر للتسويق العقاري',
    ownerPhone: '01554433221',
    isFeatured: false,
    depositType: 'fixed',
    depositValue: 14500,
    pricePerNight: 14500,
    monthlyPrice: 14500,
    bedrooms: 3,
    bathrooms: 2,
    areaSqm: 160,
    maxGuests: 6,
    beachDistanceMeters: 0,
    coordinates: { lat: 30.0609, lng: 31.3372 },
    images: [
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&h=900&q=80',
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&h=900&q=80',
    ],
    amenities: ['elevator', 'family', 'parking'],
    blockedDates: [],
    rules: ['إيجار شهري بعقد موثق (سنة قابلة للتجديد)', 'لا يُدفع أي مبلغ قبل معاينة الشقة ومراجعة الأوراق'],
    availabilityStatus: 'active',
  },
  {
    title: 'شاليه أبراج العلمين بإطلالة بانورامية على البحر — العلمين الجديدة',
    description:
      'شاليه فندقي حديث متاح للإيجار اليومي والأسبوعي في العلمين الجديدة بإطلالة مباشرة على البحر والممشى، مجهز بالكامل وخدمات أمن وصيانة على مدار الساعة.',
    governorate: 'مطروح',
    city: 'الساحل الشمالي - العلمين وسيدي عبد الرحمن',
    areaOrVillage: 'العلمين الجديدة',
    propertyType: 'شاليه',
    advertiserRole: 'مكتب / وسيط',
    ownerName: 'شركة الساحل لإدارة الوحدات',
    ownerPhone: '01066778899',
    isFeatured: true,
    depositType: 'percent',
    depositValue: 25,
    pricePerNight: 6200,
    bedrooms: 2,
    bathrooms: 2,
    areaSqm: 130,
    maxGuests: 5,
    beachDistanceMeters: 70,
    coordinates: { lat: 30.8364, lng: 28.9522 },
    images: [
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&h=900&q=80',
      'https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1200&h=900&q=80',
    ],
    amenities: ['sea-view', 'pool', 'ac', 'wifi', 'elevator', 'parking'],
    blockedDates: [],
    rules: ['إيجار يومي وأسبوعي', 'الدفع عند التعاقد والاستلام بعد المعاينة'],
    availabilityStatus: 'active',
  },
];

export const THREE_REAL_EGYPT_SAMPLE_UNITS: Omit<Chalet, 'id'>[] =
  CURATED_EGYPT_UNITS.slice(0, 3);

const DEMO_UNIT_IDS = [
  'demo-marassi-1',
  'demo-sokhna-1',
  'demo-hurghada-1',
  'demo-cairo-tagamoa-1',
  'demo-zayed-unfurnished-1',
  'demo-sharm-villa-1',
  'demo-alex-sanstefano-1',
  'demo-cairo-nasrcity-1',
  'demo-alamein-towers-1',
];

export const INITIAL_CHALETS: Chalet[] = CURATED_EGYPT_UNITS.map((unit, idx) => ({
  id: DEMO_UNIT_IDS[idx] ?? `demo-unit-${idx + 1}`,
  isDemo: true,
  ...unit,
}));
